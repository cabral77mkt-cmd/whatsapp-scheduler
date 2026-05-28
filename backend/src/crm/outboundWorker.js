'use strict';

/**
 * outboundWorker.js — Onda 4: processa fila de envio de campanhas outbound
 *
 * Chamado via: runOutboundCampaign(campaignId, userId, io)
 * Processa jobs em sequência com delay configurado, podendo personalizar
 * cada mensagem com Claude (ai_personalize=1).
 */

const db      = require('../database');
const metrics = require('./metricsService');

/* ─── Lazy imports ───────────────────────────────────────────────────────── */
function getWASend() { return require('../whatsapp/client').sendMessage; }
let _anthropic = null;
function getAnthropic() {
  if (!_anthropic && process.env.ANTHROPIC_API_KEY) {
    try { _anthropic = new (require('@anthropic-ai/sdk'))({ apiKey: process.env.ANTHROPIC_API_KEY }); } catch {}
  }
  return _anthropic;
}

/* ─── Substituição de variáveis no template ─────────────────────────────── */
function applyVars(template, lead) {
  const firstName = (lead.name || '').split(' ')[0] || lead.phone;
  return template
    .replace(/\{nome\}/gi,     lead.name || lead.phone || '')
    .replace(/\{primeiro_nome\}/gi, firstName)
    .replace(/\{telefone\}/gi, lead.phone || '')
    .replace(/\{estagio\}/gi,  lead.stage || '')
    .replace(/\{fonte\}/gi,    lead.source || '')
    .replace(/\{valor\}/gi,    lead.potential_value ? `R$ ${lead.potential_value.toFixed(2).replace('.', ',')}` : '')
    .replace(/\{notas\}/gi,    lead.notes || '');
}

/* ─── Personalização com IA ──────────────────────────────────────────────── */
async function personalizeWithAI(template, lead) {
  const anthropic = getAnthropic();
  if (!anthropic) return applyVars(template, lead);

  try {
    const aiRow = db.prepare('SELECT conversation_summary FROM crm_lead_ai WHERE lead_id = ?').get(lead.id);

    const systemPrompt = `Você é um especialista em copywriting para vendas via WhatsApp.
Personalize a mensagem de outbound para o destinatário, mantendo o tom e proposta central.
Responda APENAS com o texto da mensagem personalizada. Sem explicações.`;

    const userMsg = `Mensagem base:
"${applyVars(template, lead)}"

Dados do destinatário:
- Nome: ${lead.name || 'não informado'}
- Estágio no funil: ${lead.stage || 'não informado'}
- Fonte: ${lead.source || 'não informado'}
${aiRow?.conversation_summary ? `- Contexto da conversa: ${aiRow.conversation_summary}` : ''}

Personalize a mensagem acima para este destinatário específico.`;

    const resp = await anthropic.messages.create({
      model:      'claude-haiku-4-5',
      max_tokens: 300,
      system:     systemPrompt,
      messages:   [{ role: 'user', content: userMsg }],
    });
    return resp.content?.[0]?.text?.trim() || applyVars(template, lead);
  } catch {
    return applyVars(template, lead);
  }
}

/* ─── Runner principal ───────────────────────────────────────────────────── */
async function runOutboundCampaign(campaignId, userId, io) {
  const campaign = db.prepare('SELECT * FROM crm_outbound_campaigns WHERE id = ?').get(campaignId);
  if (!campaign || campaign.status !== 'running') return;

  const jobs = db.prepare(`
    SELECT j.*, l.name, l.phone, l.stage, l.source, l.notes, l.potential_value
    FROM crm_outbound_jobs j
    JOIN crm_leads l ON l.id = j.lead_id
    WHERE j.campaign_id = ? AND j.status = 'pending'
    ORDER BY j.id ASC
  `).all(campaignId);

  const delaySecs = Math.max(1, Math.min(campaign.delay_seconds || 10, 120));

  for (const job of jobs) {
    // Re-check if campaign was paused/canceled
    const fresh = db.prepare('SELECT status FROM crm_outbound_campaigns WHERE id = ?').get(campaignId);
    if (!fresh || fresh.status !== 'running') break;

    let message = job.personalized_msg || applyVars(campaign.template, job);

    // Personalização com IA se ainda não feita
    if (campaign.ai_personalize && !job.personalized_msg) {
      message = await personalizeWithAI(campaign.template, job);
      db.prepare('UPDATE crm_outbound_jobs SET personalized_msg = ? WHERE id = ?').run(message, job.id);
    }

    let sent = false, waMsgId = null, errorMsg = null;
    try {
      const result = await getWASend()(userId, job.phone, message);
      waMsgId = result?.key?.id || null;
      sent = true;

      // Log na conversa do lead
      const ts = new Date().toISOString();
      db.prepare(`
        INSERT INTO crm_message_log (lead_id, direction, body, wa_msg_id, occurred_at)
        VALUES (?, 'out', ?, ?, ?)
      `).run(job.lead_id, message, waMsgId, ts);
      db.prepare(`UPDATE crm_leads SET last_interaction_at = ? WHERE id = ?`).run(ts, job.lead_id);

      metrics.increment(userId, 'messages_sent');
    } catch (e) {
      errorMsg = e.message;
    }

    // Atualiza job
    db.prepare(`
      UPDATE crm_outbound_jobs
      SET status = ?, sent_at = CURRENT_TIMESTAMP, wa_msg_id = ?, error_msg = ?
      WHERE id = ?
    `).run(sent ? 'sent' : 'failed', waMsgId, errorMsg, job.id);

    // Atualiza contadores da campanha
    if (sent) {
      db.prepare('UPDATE crm_outbound_campaigns SET sent = sent + 1 WHERE id = ?').run(campaignId);
    } else {
      db.prepare('UPDATE crm_outbound_campaigns SET failed = failed + 1 WHERE id = ?').run(campaignId);
    }

    // Emite progresso via socket
    if (io) {
      const prog = db.prepare('SELECT sent, failed, total_leads FROM crm_outbound_campaigns WHERE id = ?').get(campaignId);
      io.to(`user:${userId}`).emit('outbound:progress', { campaign_id: campaignId, ...prog });
    }

    // Delay entre envios
    if (delaySecs > 0) await new Promise(r => setTimeout(r, delaySecs * 1000));
  }

  // Finaliza campanha
  const finalStatus = (() => {
    const c = db.prepare('SELECT status FROM crm_outbound_campaigns WHERE id = ?').get(campaignId);
    return c?.status === 'running' ? 'done' : c?.status;
  })();

  if (finalStatus === 'done') {
    db.prepare(`
      UPDATE crm_outbound_campaigns SET status = 'done', finished_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(campaignId);
    if (io) io.to(`user:${userId}`).emit('outbound:done', { campaign_id: campaignId });
    console.log(`[Outbound] ✅ Campanha #${campaignId} concluída`);
  }
}

module.exports = { runOutboundCampaign };
