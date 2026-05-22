'use strict';

/**
 * rescueGenerator.js — Resgatador Diário
 *
 * Roda toda manhã (cron 08:00 por padrão, configurável por user).
 * Analisa todo o pipeline e gera lista priorizada de leads que precisam atenção HOJE.
 *
 * Pra cada lead candidato, usa Claude haiku pra gerar:
 *   - Motivo claro do resgate
 *   - Ação sugerida
 *   - Mensagem-rascunho personalizada (NÃO envia, só sugere)
 *
 * Depois envia o resumo:
 *   - Push notification (se ativado)
 *   - WhatsApp pro número configurado em user_settings (se ativado)
 */

const db = require('../database');
const pushService = require('../push/pushService');

function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY não configurada');
  const Anthropic = require('@anthropic-ai/sdk');
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

/**
 * Calcula um score de "urgência de resgate" para um lead.
 * Quanto maior, mais prioritário.
 */
function calcPriority(lead) {
  let score = 0;
  const now = Date.now();
  const lastInter = lead.last_interaction_at ? new Date(lead.last_interaction_at).getTime() : now;
  const daysSince = Math.floor((now - lastInter) / (1000 * 60 * 60 * 24));

  // Tempo desde última interação: mais tempo = mais urgente (até 14d depois cai)
  if (daysSince >= 2 && daysSince <= 4)  score += 30;
  if (daysSince >= 5 && daysSince <= 7)  score += 45;
  if (daysSince >= 8 && daysSince <= 14) score += 35;
  if (daysSince > 14)                    score += 15;

  // Temperatura
  if (lead.temperature === 'quente') score += 25;
  if (lead.temperature === 'morno')  score += 10;

  // Estágios avançados são mais valiosos
  const advancedStages = ['proposta_enviada', 'analisando_proposta', 'negociacao'];
  if (advancedStages.includes(lead.stage)) score += 20;

  // Valor potencial (até 20 pontos)
  if (lead.potential_value) {
    const v = Number(lead.potential_value);
    if (v >= 50000) score += 20;
    else if (v >= 20000) score += 15;
    else if (v >= 5000) score += 10;
    else if (v >= 1000) score += 5;
  }

  // AI Score se existir
  if (lead.ai_score) score += Math.floor(Number(lead.ai_score) / 5);

  return Math.min(100, score);
}

/**
 * Identifica o motivo provável de esfriamento.
 */
function inferCoolingReason(lead) {
  const stage = lead.stage;
  const map = {
    entrou_contato:      'Sumiu logo no primeiro contato',
    conversando:         'Parou de responder durante qualificação',
    diagnostico:         'Esfriou no diagnóstico',
    reuniao_agendada:    'Reunião marcada mas sem confirmação',
    reuniao_realizada:   'Pós-reunião sem retorno',
    aguardando_proposta: 'Aguardando proposta há muito tempo',
    proposta_enviada:    'Proposta enviada e sem resposta',
    analisando_proposta: 'Analisando proposta há tempo demais',
    negociacao:          'Negociação travada',
  };
  return map[stage] || 'Sem interação recente';
}

/**
 * Pega leads candidatos para resgate.
 * Critério: aberto, sem interação >=2d, não dormente, não fechado/perdido.
 */
function getCandidates(userId) {
  return db.prepare(`
    SELECT
      l.*,
      (SELECT score FROM crm_lead_ai WHERE lead_id = l.id) AS ai_score,
      (SELECT next_step_text FROM crm_lead_ai WHERE lead_id = l.id) AS ai_next_step,
      (SELECT scheduled_at FROM crm_followups
        WHERE lead_id = l.id AND status = 'pending'
        ORDER BY scheduled_at ASC LIMIT 1) AS next_followup_at
    FROM crm_leads l
    WHERE l.user_id = ?
      AND l.stage NOT IN ('fechado','perdido')
      AND (l.dormant_until IS NULL OR datetime(l.dormant_until) < datetime('now'))
      AND (
        l.last_interaction_at IS NULL
        OR datetime(l.last_interaction_at) < datetime('now', '-2 days')
      )
    ORDER BY l.last_interaction_at ASC
    LIMIT 50
  `).all(userId);
}

/**
 * Pega últimas N mensagens de um lead.
 */
function getRecentMessages(leadId, limit = 6) {
  try {
    return db.prepare(`
      SELECT direction, body, occurred_at AS created_at
      FROM crm_message_log
      WHERE lead_id = ?
      ORDER BY occurred_at DESC
      LIMIT ?
    `).all(leadId, limit).reverse();
  } catch {
    return [];
  }
}

/**
 * Chama Claude pra gerar ação + mensagem-rascunho pro lead.
 * Fallback: se não tiver API key, gera fallback determinístico.
 */
async function generateSuggestion(lead, messages) {
  const fallback = {
    suggested_action: `Enviar mensagem retomando contato — lead em "${lead.stage}" há vários dias`,
    suggested_message: `Oi ${lead.name?.split(' ')[0] || ''}! Como você tá? Tudo certo por aí?\n\nQueria saber se posso te ajudar com algo do que conversamos. Tô à disposição!`,
  };

  if (!process.env.ANTHROPIC_API_KEY) return fallback;

  try {
    const client = getClient();
    const msgLines = messages.map(m => `[${m.direction === 'in' ? 'LEAD' : 'VOCÊ'}] ${m.body}`).join('\n');
    const prompt = `Você é o copiloto comercial de um vendedor de marketing pra eventos.
Analise este lead que esfriou e gere UMA sugestão de retomada.

LEAD: ${lead.name || 'sem nome'} | Estágio: ${lead.stage} | Temperatura: ${lead.temperature}
Última interação: ${lead.last_interaction_at || 'nunca'}
Valor potencial: ${lead.potential_value || 'não informado'}

ÚLTIMAS MENSAGENS (mais antigas primeiro):
${msgLines || '(sem histórico)'}

Gere um JSON com:
{
  "suggested_action": "ação curta e clara (1 linha) — ex: 'enviar áudio de 30s perguntando dúvida'",
  "suggested_message": "mensagem-rascunho curta (2-4 linhas, tom natural BR, evite parecer template, mencione algo específico do histórico se houver)"
}

Retorne APENAS o JSON, sem texto extra.`;

    const response = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content?.[0]?.text || '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return fallback;
    const parsed = JSON.parse(match[0]);
    return {
      suggested_action:  parsed.suggested_action  || fallback.suggested_action,
      suggested_message: parsed.suggested_message || fallback.suggested_message,
    };
  } catch (e) {
    console.warn('[Rescue] Claude falhou, usando fallback:', e.message);
    return fallback;
  }
}

/**
 * Gera rescues do dia para um usuário específico.
 * Idempotente: se já rodou hoje pro user, sobrescreve.
 */
async function generateRescuesForUser(userId, orgId) {
  const today = new Date().toISOString().slice(0, 10);

  // Pega settings (máximo de itens)
  const settings = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(userId) || {};
  if (settings.rescue_enabled === 0) return { generated: 0, skipped: true };
  const maxItems = settings.rescue_max_items || 10;

  // Pega candidatos e ranqueia
  const candidates = getCandidates(userId);
  if (!candidates.length) return { generated: 0 };

  const ranked = candidates
    .map(l => ({ lead: l, priority: calcPriority(l), reason: inferCoolingReason(l) }))
    .sort((a, b) => b.priority - a.priority)
    .slice(0, maxItems);

  // Limpa rescues do dia (idempotente)
  db.prepare(`DELETE FROM crm_daily_rescues WHERE user_id = ? AND rescue_date = ?`).run(userId, today);

  // Gera sugestões + insere
  let generated = 0;
  for (const item of ranked) {
    const messages = getRecentMessages(item.lead.id, 6);
    const suggestion = await generateSuggestion(item.lead, messages);

    try {
      db.prepare(`
        INSERT INTO crm_daily_rescues
          (org_id, user_id, lead_id, rescue_date, priority, reason, suggested_action, suggested_message, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
      `).run(orgId, userId, item.lead.id, today, item.priority, item.reason,
             suggestion.suggested_action, suggestion.suggested_message);
      generated++;
    } catch (e) {
      console.warn('[Rescue] falha ao inserir rescue:', e.message);
    }
  }

  // Notifica
  await notifyUser(userId, settings, generated, ranked);

  return { generated };
}

/**
 * Envia push + WhatsApp pra notificar o usuário.
 */
async function notifyUser(userId, settings, count, ranked) {
  if (!count) return;

  // Push notification
  if (settings.rescue_via_push) {
    pushService.sendToUser(userId, {
      title: `🚨 ${count} leads precisam atenção hoje`,
      body:  `Top: ${ranked[0].lead.name || ranked[0].lead.phone} — ${ranked[0].reason}`,
      url:   '/crm/resgatador',
      tag:   'daily-rescue',
    }).catch(() => {});
  }

  // WhatsApp pro próprio número
  if (settings.rescue_via_whatsapp && settings.notification_phone) {
    try {
      const { sendMessage } = require('../whatsapp/client');
      const top = ranked.slice(0, 5);
      const body = [
        `🌅 *Bom dia! Seu Resgatador Diário*`,
        ``,
        `🚨 *${count} leads* precisam atenção hoje:`,
        ``,
        ...top.map((r, i) => {
          const name = r.lead.name || r.lead.phone;
          const value = r.lead.potential_value ? ` (R$ ${Number(r.lead.potential_value).toLocaleString('pt-BR')})` : '';
          return `${i + 1}. *${name}*${value}\n   _${r.reason}_`;
        }),
        ``,
        count > 5 ? `_+ ${count - 5} outros leads na fila_\n` : '',
        `👉 Abra: https://seudominio.com/crm/resgatador`,
      ].filter(Boolean).join('\n');

      await sendMessage(userId, settings.notification_phone, body);
    } catch (e) {
      console.warn('[Rescue] falha ao enviar WhatsApp:', e.message);
    }
  }
}

/**
 * Executa o resgatador pra todos os usuários elegíveis.
 * Chamado pelo scheduler.
 */
async function runDailyRescues() {
  console.log('[Rescue] Iniciando geração diária...');
  const users = db.prepare(`
    SELECT u.id
    FROM users u
    INNER JOIN user_settings s ON s.user_id = u.id
    WHERE s.rescue_enabled = 1
  `).all();

  let total = 0;
  for (const u of users) {
    try {
      const result = await generateRescuesForUser(u.id, 1);
      total += result.generated;
    } catch (e) {
      console.error(`[Rescue] erro pro user ${u.id}:`, e.message);
    }
  }
  console.log(`[Rescue] Concluído: ${total} rescues gerados pra ${users.length} usuários.`);
  return { users: users.length, rescues: total };
}

module.exports = {
  runDailyRescues,
  generateRescuesForUser,
  calcPriority,
  inferCoolingReason,
};
