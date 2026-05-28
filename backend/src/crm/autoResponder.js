'use strict';

/**
 * autoResponder.js — Onda 2: AI First Responder + AI SDR
 *
 * Fluxo:
 *   1. Lead manda mensagem → autoLead.js chama maybeAutoRespond()
 *   2. Verifica config do usuário (enabled, max_auto_msgs, persona…)
 *   3. Conta quantas respostas automáticas já foram enviadas para o lead
 *      - auto_response = 1 → fase First Responder
 *      - auto_response = 2 → fase SDR (agendar reunião)
 *   4. Chama Claude haiku para gerar resposta contextual
 *   5. Aguarda response_delay_secs e envia via WhatsApp
 *   6. Após max_auto_msgs, envia handoff_message (se configurado) ou ativa SDR
 */

const db          = require('../database');
const metrics     = require('./metricsService');

/* ─── Lazy imports (evita dependência circular com autoLead) ────────────── */
function getWASend() { return require('../whatsapp/client').sendMessage; }
let _anthropic = null;
function getAnthropic() {
  if (!_anthropic) {
    try { _anthropic = new (require('@anthropic-ai/sdk'))({ apiKey: process.env.ANTHROPIC_API_KEY }); } catch {}
  }
  return _anthropic;
}

/* ─── Ponto de entrada ───────────────────────────────────────────────────── */
async function maybeAutoRespond(userId, leadId, phone, inboundBody, io) {
  // 1. Carregar configuração
  const cfg = db.prepare('SELECT * FROM crm_auto_responder_config WHERE user_id = ?').get(userId);
  if (!cfg || !cfg.enabled) return;

  // 2. Contar respostas automáticas já enviadas para este lead
  const counts = db.prepare(`
    SELECT
      SUM(CASE WHEN auto_response = 1 THEN 1 ELSE 0 END) AS first_count,
      SUM(CASE WHEN auto_response = 2 THEN 1 ELSE 0 END) AS sdr_count
    FROM crm_message_log
    WHERE lead_id = ? AND direction = 'out' AND auto_response > 0
  `).get(leadId) || {};

  const firstCount = counts.first_count || 0;
  const sdrCount   = counts.sdr_count   || 0;
  const maxFirst   = cfg.max_auto_msgs  || 3;
  const maxSDR     = cfg.sdr_max_attempts || 5;

  // 3. Determinar fase
  const inFirstPhase = firstCount < maxFirst;
  const inSDRPhase   = !inFirstPhase && cfg.sdr_enabled && sdrCount < maxSDR;

  if (!inFirstPhase && !inSDRPhase) return; // Esgotou todas as fases

  const autoFlag = inSDRPhase ? 2 : 1;

  // 4. Buscar histórico da conversa
  const history = db.prepare(`
    SELECT direction, body, occurred_at FROM crm_message_log
    WHERE lead_id = ? AND (auto_response = 0 OR direction = 'in')
    ORDER BY occurred_at ASC
    LIMIT 20
  `).all(leadId);

  const lead = db.prepare('SELECT * FROM crm_leads WHERE id = ?').get(leadId);

  // 5. Gerar resposta via Claude (com fallback)
  const aiReply = await generateReply(cfg, lead, history, inboundBody, inSDRPhase, firstCount);
  if (!aiReply) return;

  // 6. Delay antes de enviar
  const delaySecs = Math.max(1, Math.min(cfg.response_delay_secs || 5, 60));
  await new Promise(r => setTimeout(r, delaySecs * 1000));

  // 7. Enviar mensagem
  let waMsgId = null;
  try {
    const sent = await getWASend()(userId, phone, aiReply);
    waMsgId = sent?.key?.id || null;
  } catch (e) {
    console.warn(`[AutoResponder] Erro ao enviar para lead #${leadId}:`, e.message);
    return;
  }

  // 8. Logar no banco
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO crm_message_log (lead_id, direction, body, wa_msg_id, auto_response, occurred_at)
    VALUES (?, 'out', ?, ?, ?, ?)
  `).run(leadId, aiReply, waMsgId, autoFlag, now);
  db.prepare(`UPDATE crm_leads SET last_interaction_at = ? WHERE id = ?`).run(now, leadId);

  // 9. Métricas
  metrics.increment(userId, 'messages_sent');

  // 10. Emitir evento no socket (inbox atualiza em tempo real)
  if (io) {
    io.to(`user:${userId}`).emit('inbox:new-message', {
      lead_id: leadId, direction: 'out', body: aiReply, occurred_at: now, phone, auto: true,
    });
    io.to(`user:${userId}`).emit('crm:lead_updated', { lead_id: leadId });
  }

  const phaseLabel = inSDRPhase ? `SDR #${sdrCount + 1}` : `First Responder #${firstCount + 1}`;
  console.log(`[AutoResponder] ✅ ${phaseLabel} → lead #${leadId} (${lead?.name || phone})`);

  // 11. Após esgotar o First Responder SEM SDR: enviar handoff_message
  const isLastFirst = !inSDRPhase && firstCount + 1 >= maxFirst;
  if (isLastFirst && cfg.handoff_message && !cfg.sdr_enabled) {
    setTimeout(async () => {
      try {
        const sentHandoff = await getWASend()(userId, phone, cfg.handoff_message);
        const ts = new Date().toISOString();
        db.prepare(`
          INSERT INTO crm_message_log (lead_id, direction, body, wa_msg_id, auto_response, occurred_at)
          VALUES (?, 'out', ?, ?, 1, ?)
        `).run(leadId, cfg.handoff_message, sentHandoff?.key?.id || null, ts);
        db.prepare(`UPDATE crm_leads SET last_interaction_at = ? WHERE id = ?`).run(ts, leadId);
        if (io) {
          io.to(`user:${userId}`).emit('inbox:new-message', { lead_id: leadId, direction: 'out', body: cfg.handoff_message, occurred_at: ts, phone, auto: true });
        }
        console.log(`[AutoResponder] 📨 Handoff enviado para lead #${leadId}`);
      } catch (e) {
        console.warn('[AutoResponder] Erro no handoff:', e.message);
      }
    }, 30_000);
  }
}

/* ─── Geração de resposta ────────────────────────────────────────────────── */
async function generateReply(cfg, lead, history, currentMessage, isSDR, msgCount) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey) {
    try {
      const client = getAnthropic();
      if (!client) throw new Error('SDK não disponível');

      const systemPrompt = isSDR
        ? buildSDRPrompt(cfg, lead)
        : buildFirstResponderPrompt(cfg, lead, msgCount);

      // Montar histórico para Claude
      const convo = history.map(m => ({
        role: m.direction === 'in' ? 'user' : 'assistant',
        content: m.body || '[sem texto]',
      }));
      convo.push({ role: 'user', content: currentMessage });

      const resp = await client.messages.create({
        model:      'claude-haiku-4-5',
        max_tokens: 300,
        system:     systemPrompt,
        messages:   convo,
      });
      const text = resp.content?.[0]?.text?.trim();
      if (text) return text;
    } catch (e) {
      console.warn('[AutoResponder] Claude falhou, usando fallback:', e.message);
    }
  }

  return buildFallback(cfg, lead, isSDR, msgCount);
}

/* ─── Prompts ────────────────────────────────────────────────────────────── */
function buildFirstResponderPrompt(cfg, lead, msgCount) {
  const name      = lead?.name || 'o contato';
  const maxMsgs   = cfg.max_auto_msgs || 3;
  const remaining = maxMsgs - msgCount;

  return `Você é um assistente de atendimento${cfg.persona ? ` — ${cfg.persona}` : ''}.
Está respondendo as primeiras mensagens de "${name}" que entrou em contato agora.
${cfg.objectives ? `Objetivos: ${cfg.objectives}` : 'Objetivo: manter a conversa ativa e qualificar o lead.'}

REGRAS:
- Resposta curta e natural (máximo 2-3 linhas no WhatsApp)
- Não mencione que é bot ou IA — pareça um humano
- Linguagem informal, brasileira, calorosa
- Faça UMA pergunta por vez para entender a necessidade
- Você tem mais ${remaining - 1} resposta(s) automática(s) disponível(is)
${msgCount === 0 ? '- Primeira resposta: seja acolhedor, agradeça o contato' : ''}
${remaining === 1 ? '- Última resposta automática: avise que um humano vai retornar' : ''}

Responda APENAS com o texto da mensagem. Sem explicações.`;
}

function buildSDRPrompt(cfg, lead) {
  const name    = lead?.name || 'a pessoa';
  const goal    = cfg.sdr_goal || 'Agendar uma reunião de 15 minutos';
  const calLink = cfg.sdr_calendar_link
    ? `\nLink de agendamento: ${cfg.sdr_calendar_link}`
    : '';

  return `Você é um SDR (Sales Development Representative) experiente.
Está conversando com "${name}".
SEU ÚNICO OBJETIVO: ${goal}${calLink}

ESTRATÉGIA:
- Seja direto, porém amigável e sem pressão
- Se o lead demonstrar interesse → envie o link imediatamente
- Antecipe objeções (falta de tempo, falta de interesse, etc.)
- Respostas curtas: máximo 2 linhas
- Não mencione que é bot — pareça humano
- Linguagem informal e brasileira

Responda APENAS com o texto da mensagem.`;
}

/* ─── Fallback (sem API key / erro) ─────────────────────────────────────── */
function buildFallback(cfg, lead, isSDR, msgCount) {
  const firstName = lead?.name ? lead.name.split(' ')[0] : null;
  const hi = firstName ? `Oi, ${firstName}!` : 'Oi!';

  if (isSDR) {
    const goal    = cfg.sdr_goal || 'uma conversa rápida de 15 minutos';
    const calLink = cfg.sdr_calendar_link ? `\n${cfg.sdr_calendar_link}` : '';
    const options = [
      `${hi} Que tal agendarmos ${goal}? Tenho alguns horários disponíveis essa semana!${calLink}`,
      `${firstName ? firstName + ', v' : 'V'}ocê teria disponibilidade para uma rápida conversa? Seria muito proveitoso!`,
      `Pode ser amanhã? Só precisaria de 15 minutinhos para te apresentar algo relevante para você.`,
    ];
    return options[Math.min(msgCount % 3, options.length - 1)];
  }

  const options = [
    `${hi} Recebemos sua mensagem! Em breve alguém da nossa equipe vai te atender. Enquanto isso, pode me contar mais sobre o que você precisa?`,
    `${hi} Obrigado pelo contato! Tem algo específico que posso te ajudar agora?`,
    `A nossa equipe vai entrar em contato em breve. Só pra confirmar: você está buscando... [descreva em 1 linha o que procura]?`,
  ];
  return options[Math.min(msgCount, options.length - 1)];
}

module.exports = { maybeAutoRespond };
