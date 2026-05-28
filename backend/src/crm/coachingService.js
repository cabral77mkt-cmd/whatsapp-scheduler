'use strict';

/**
 * coachingService.js — Onda 3: Conversation Intelligence
 *
 * Gera Coaching Cards com feedback da IA após negócios fechados/perdidos.
 * Cada card tem: tipo, emoji, título, insight e ação recomendada.
 *
 * Tipos:
 *   'win'    — negócio fechado: o que funcionou bem
 *   'loss'   — negócio perdido: o que melhorar
 *   'stale'  — lead parado: alerta de atenção
 */

const db = require('../database');

/* ─── Lazy Anthropic ────────────────────────────────────────────────────── */
let _anthropic = null;
function getAnthropic() {
  if (!_anthropic && process.env.ANTHROPIC_API_KEY) {
    try { _anthropic = new (require('@anthropic-ai/sdk'))({ apiKey: process.env.ANTHROPIC_API_KEY }); } catch {}
  }
  return _anthropic;
}

/* ─── Públicos ───────────────────────────────────────────────────────────── */
async function generateWinCoaching(leadId, userId) {
  return _generate(leadId, userId, 'win');
}

async function generateLossCoaching(leadId, userId) {
  return _generate(leadId, userId, 'loss');
}

async function generateStaleCoaching(leadId, userId) {
  return _generate(leadId, userId, 'stale');
}

/* ─── Núcleo ─────────────────────────────────────────────────────────────── */
async function _generate(leadId, userId, type) {
  try {
    const lead = db.prepare('SELECT * FROM crm_leads WHERE id = ?').get(leadId);
    if (!lead) return;

    const messages = db.prepare(`
      SELECT direction, body, occurred_at FROM crm_message_log
      WHERE lead_id = ? ORDER BY occurred_at ASC LIMIT 30
    `).all(leadId);

    const stageHistory = db.prepare(`
      SELECT from_stage, to_stage, changed_at FROM crm_stage_history
      WHERE lead_id = ? ORDER BY changed_at ASC LIMIT 10
    `).all(leadId);

    const followupCount = db.prepare(
      "SELECT COUNT(*) AS c FROM crm_followups WHERE lead_id = ?"
    ).get(leadId)?.c || 0;

    const aiRow = db.prepare('SELECT * FROM crm_lead_ai WHERE lead_id = ?').get(leadId);

    // Montar contexto para o prompt
    const context = buildContext(lead, messages, stageHistory, followupCount, aiRow, type);

    let card;
    const anthropic = getAnthropic();
    if (anthropic) {
      card = await callClaude(anthropic, context, type, lead);
    } else {
      card = buildFallbackCard(type, lead, followupCount, messages.length);
    }

    if (!card) return;

    db.prepare(`
      INSERT INTO crm_coaching_cards
        (org_id, user_id, lead_id, type, emoji, title, insight, action, score, source)
      VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId, leadId,
      card.type   || type,
      card.emoji  || '💡',
      card.title,
      card.insight,
      card.action || null,
      card.score  || null,
      anthropic ? 'ai' : 'rule',
    );

    console.log(`[Coaching] ✅ Card gerado (${type}) para lead #${leadId}`);
  } catch (e) {
    console.warn(`[Coaching] Erro ao gerar card (${type}) para lead #${leadId}:`, e.message);
  }
}

/* ─── Contexto para o prompt ─────────────────────────────────────────────── */
function buildContext(lead, messages, stageHistory, followupCount, aiRow, type) {
  const inMsgs  = messages.filter(m => m.direction === 'in').length;
  const outMsgs = messages.filter(m => m.direction === 'out' && !m.auto_response).length;
  const firstContact = lead.first_contact_at;
  const lastContact  = lead.last_interaction_at;

  const daysInPipeline = firstContact
    ? Math.floor((Date.now() - new Date(firstContact).getTime()) / 86400000)
    : null;

  const stagesPath = stageHistory.map(s => s.to_stage).join(' → ');

  const convSnippet = messages.slice(-10).map(m =>
    `[${m.direction === 'in' ? 'Lead' : 'Vendedor'}]: ${(m.body || '').slice(0, 80)}`
  ).join('\n');

  return {
    lead: {
      name:           lead.name || 'sem nome',
      stage:          lead.stage,
      temperature:    lead.temperature,
      closedValue:    lead.closed_value,
      lossReason:     lead.loss_reason,
      source:         lead.source,
      daysInPipeline,
      stagesPath,
    },
    conv: { inMsgs, outMsgs, followupCount, snippet: convSnippet },
    ai:   aiRow ? { score: aiRow.score, summary: aiRow.conversation_summary } : null,
    type,
  };
}

/* ─── Chamada Claude ─────────────────────────────────────────────────────── */
async function callClaude(anthropic, ctx, type, lead) {
  const typeConfig = {
    win: {
      emoji: '🏆',
      prompt: `Você é um coach de vendas experiente. Um negócio foi FECHADO com sucesso.
Analise a conversa e dê feedback construtivo ao vendedor sobre o que funcionou bem e o que pode potencializar ainda mais.
Seja específico, direto e motivador.`,
    },
    loss: {
      emoji: '📚',
      prompt: `Você é um coach de vendas experiente. Um negócio foi PERDIDO.
Analise a conversa e dê um feedback de aprendizado ao vendedor: o que pôde ter travado o negócio e qual seria a abordagem ideal.
Seja empático, construtivo — sem crítica pesada.`,
    },
    stale: {
      emoji: '⏰',
      prompt: `Você é um coach de vendas. Este lead está PARADO há vários dias.
Identifique o que pode estar travando e sugira a melhor ação para reativar o lead agora.`,
    },
  };

  const cfg = typeConfig[type] || typeConfig.win;

  const systemPrompt = `${cfg.prompt}

Responda EXCLUSIVAMENTE com um JSON válido neste formato (sem markdown):
{
  "emoji": "${cfg.emoji}",
  "title": "Título curto e impactante (max 60 chars)",
  "insight": "Análise em 2-3 frases. Específica, baseada nos dados reais da conversa.",
  "action": "1 ação concreta e imediata que o vendedor deve fazer",
  "score": <número de 0 a 100 representando qualidade da condução da venda>
}`;

  const userMsg = `Dados do lead/negócio:
- Nome: ${ctx.lead.name}
- Estágio final: ${ctx.lead.stage}
- Temperatura: ${ctx.lead.temperature || 'não definida'}
- Dias no pipeline: ${ctx.lead.daysInPipeline || '?'}
- Caminho de estágios: ${ctx.lead.stagesPath || '?'}
- Valor fechado: ${ctx.lead.closedValue ? `R$ ${ctx.lead.closedValue}` : '—'}
- Motivo da perda: ${ctx.lead.lossReason || '—'}
- Mensagens recebidas: ${ctx.conv.inMsgs}
- Mensagens enviadas: ${ctx.conv.outMsgs}
- Follow-ups agendados: ${ctx.conv.followupCount}
${ctx.ai ? `- Score de IA antes do desfecho: ${ctx.ai.score}/100\n- Resumo IA: ${ctx.ai.summary}` : ''}

Trecho da conversa (últimas mensagens):
${ctx.conv.snippet}`;

  const resp = await anthropic.messages.create({
    model:      'claude-haiku-4-5',
    max_tokens: 400,
    system:     systemPrompt,
    messages:   [{ role: 'user', content: userMsg }],
  });

  const raw = resp.content?.[0]?.text?.trim();
  if (!raw) return null;

  // Parse JSON (Claude pode incluir markdown às vezes)
  const jsonStr = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
  return JSON.parse(jsonStr);
}

/* ─── Fallback sem API key ───────────────────────────────────────────────── */
function buildFallbackCard(type, lead, followupCount, msgCount) {
  const name = lead.name || 'Lead';
  if (type === 'win') {
    return {
      emoji:   '🏆',
      title:   `Negócio fechado: ${name}`,
      insight: `Parabéns pelo fechamento! ${followupCount} follow-ups realizados e ${msgCount} mensagens trocadas. Anote o que funcionou para replicar em próximos leads.`,
      action:  'Peça uma indicação para o novo cliente nas próximas 48h.',
      score:   75,
    };
  }
  if (type === 'loss') {
    return {
      emoji:   '📚',
      title:   `Aprendizado: ${name} — ${lead.loss_reason || 'negócio perdido'}`,
      insight: `O negócio foi perdido${lead.loss_reason ? ` por "${lead.loss_reason}"` : ''}. Analise se houve demora nas respostas ou falta de proposta de valor clara.`,
      action:  'Revise a abordagem para leads no estágio onde este travou.',
      score:   null,
    };
  }
  return {
    emoji:   '⏰',
    title:   `${name} está sem interação`,
    insight: `Este lead está parado há vários dias sem resposta. Uma nova abordagem personalizada pode reativá-lo.`,
    action:  'Envie uma mensagem de reengajamento hoje.',
    score:   null,
  };
}

module.exports = { generateWinCoaching, generateLossCoaching, generateStaleCoaching };
