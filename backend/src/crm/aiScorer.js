'use strict';

/**
 * aiScorer.js — Copiloto de IA para leads do CRM
 *
 * Usa Claude haiku para analisar conversas e gerar:
 *   - Score 0-100 de probabilidade de fechamento
 *   - Próxima ação recomendada
 *   - Resumo da conversa em 2-3 linhas
 *   - Sinais quentes detectados
 */

const db = require('../database');

function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY não configurada');
  const Anthropic = require('@anthropic-ai/sdk');
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, Number(n) || 0));
}

function extractJSON(text) {
  try {
    // Tenta extrair JSON entre chaves
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

function buildPrompt(lead, messages, proposals, learnings) {
  const msgLines = messages
    .slice()
    .reverse()
    .map((m) => `[${m.direction === 'in' ? 'LEAD' : 'VENDEDOR'}] ${m.body}`)
    .join('\n');

  const proposalSummary = proposals.length
    ? proposals.map((p) => `R$${p.amount || p.negotiated_amount || 0} (${p.status})`).join(', ')
    : 'nenhuma proposta';

  const learningLines = learnings.length
    ? 'Aprendizados de negócios anteriores:\n' + learnings.map((l) => `- ${l.lesson}`).join('\n')
    : '';

  return `Você é um assistente especialista em vendas comerciais. Analise este lead e responda APENAS com JSON válido, sem texto adicional.

DADOS DO LEAD:
Nome: ${lead.name || 'não informado'}
Telefone: ${lead.phone}
Etapa atual: ${lead.stage}
Temperatura: ${lead.temperature}
Valor potencial: R$ ${lead.potential_value || 0}
Evento: ${lead.event_name || 'não informado'}
Cidade: ${lead.city || 'não informada'}
Data do evento: ${lead.event_date || 'não informada'}
Tipo de evento: ${lead.event_type || 'não informado'}

HISTÓRICO DE MENSAGENS (do mais antigo ao mais recente):
${msgLines || 'Sem mensagens ainda'}

PROPOSTAS: ${proposalSummary}

${learningLines}

RESPONDA APENAS com este JSON (sem markdown, sem explicações):
{
  "score": <inteiro 0-100 representando probabilidade de fechar negócio>,
  "score_reason": "<frase curta explicando o score, máx 80 chars>",
  "next_step_text": "<próxima ação recomendada, máx 60 chars, em português>",
  "next_step_action": "<exatamente uma de: schedule_meeting | send_proposal | follow_up | send_message | close_deal | none>",
  "conversation_summary": "<resumo objetivo em 2-3 frases do que foi discutido e situação atual>",
  "hot_signals": ["<sinal positivo 1>", "<sinal positivo 2>"]
}`;
}

/* ── scoreLead: analisa um lead específico ─────────────────── */
async function scoreLead(leadId, userId) {
  const client = getClient();

  const lead = db.prepare(`
    SELECT l.*,
      (SELECT event_name FROM crm_lead_event WHERE lead_id = l.id) AS event_name,
      (SELECT city       FROM crm_lead_event WHERE lead_id = l.id) AS city,
      (SELECT event_date FROM crm_lead_event WHERE lead_id = l.id) AS event_date,
      (SELECT event_type FROM crm_lead_event WHERE lead_id = l.id) AS event_type
    FROM crm_leads l WHERE l.id = ?
  `).get(leadId);
  if (!lead) throw new Error('Lead não encontrado');

  const messages = db.prepare(`
    SELECT direction, body, occurred_at
    FROM crm_message_log
    WHERE lead_id = ?
    ORDER BY occurred_at DESC
    LIMIT 25
  `).all(leadId);

  const proposals = db.prepare(`
    SELECT status, amount, negotiated_amount
    FROM crm_proposals
    WHERE lead_id = ?
    ORDER BY created_at DESC
    LIMIT 3
  `).all(leadId);

  const learnings = db.prepare(`
    SELECT outcome, lesson
    FROM crm_ai_learnings
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT 5
  `).all(userId);

  const prompt = buildPrompt(lead, messages, proposals, learnings);

  const response = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 600,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0]?.text || '';
  const json = extractJSON(text);
  if (!json) {
    console.error(`[aiScorer] JSON inválido para lead ${leadId}:`, text.slice(0, 200));
    throw new Error('Resposta inválida da IA');
  }

  // Upsert no banco
  db.prepare(`
    INSERT INTO crm_lead_ai
      (lead_id, score, score_reason, next_step_text, next_step_action,
       conversation_summary, hot_signals_json, last_updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(lead_id) DO UPDATE SET
      score                = excluded.score,
      score_reason         = excluded.score_reason,
      next_step_text       = excluded.next_step_text,
      next_step_action     = excluded.next_step_action,
      conversation_summary = excluded.conversation_summary,
      hot_signals_json     = excluded.hot_signals_json,
      last_updated_at      = excluded.last_updated_at
  `).run(
    leadId,
    clamp(json.score, 0, 100),
    json.score_reason  || null,
    json.next_step_text  || null,
    json.next_step_action || 'none',
    json.conversation_summary || null,
    Array.isArray(json.hot_signals) ? JSON.stringify(json.hot_signals) : null,
  );

  const saved = db.prepare('SELECT * FROM crm_lead_ai WHERE lead_id = ?').get(leadId);
  console.log(`[aiScorer] Lead ${leadId} scored: ${saved.score}/100 — ${saved.next_step_text}`);
  return saved;
}

/* ── runAiScoring: roda em batch (chamado pelo scheduler) ──── */
async function runAiScoring() {
  if (!process.env.ANTHROPIC_API_KEY) return;

  // Leads ativos com mensagens novas desde o último score (ou nunca analisados)
  const leads = db.prepare(`
    SELECT l.id, l.user_id
    FROM crm_leads l
    WHERE l.stage NOT IN ('fechado', 'perdido')
      AND EXISTS (SELECT 1 FROM crm_message_log WHERE lead_id = l.id)
      AND (
        NOT EXISTS (SELECT 1 FROM crm_lead_ai WHERE lead_id = l.id)
        OR (
          SELECT MAX(occurred_at) FROM crm_message_log WHERE lead_id = l.id
        ) > (
          SELECT last_updated_at FROM crm_lead_ai WHERE lead_id = l.id
        )
      )
    ORDER BY l.last_interaction_at DESC
    LIMIT 8
  `).all();

  if (!leads.length) return;
  console.log(`[aiScorer] Analisando ${leads.length} lead(s)…`);

  for (const { id, user_id } of leads) {
    try {
      await scoreLead(id, user_id);
      // Pequena pausa entre chamadas para não ultrapassar rate limit
      await new Promise((r) => setTimeout(r, 500));
    } catch (err) {
      console.error(`[aiScorer] Erro no lead ${id}:`, err.message);
    }
  }
}

/* ── saveLeadLearning: salva aprendizado ao fechar/perder ──── */
function saveLeadLearning(leadId, userId, outcome, lesson) {
  try {
    db.prepare(`
      INSERT INTO crm_ai_learnings (user_id, lead_id, outcome, lesson)
      VALUES (?, ?, ?, ?)
    `).run(userId, leadId, outcome, lesson);
  } catch (err) {
    console.error('[aiScorer] Erro ao salvar learning:', err.message);
  }
}

module.exports = { runAiScoring, scoreLead, saveLeadLearning };
