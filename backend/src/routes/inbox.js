const express = require('express');
const router = express.Router();
const db = require('../database');
const { sendMessage, getStatus } = require('../whatsapp/client');
const autoLead = require('../crm/autoLead');
const leadService = require('../crm/leadService');

/* ── GET /api/inbox/conversations ────────────────────────────
   Lista leads com histórico de mensagens, ordenados pela
   última interação. Inclui unread_count e next_followup_at.   */
router.get('/conversations', (req, res) => {
  const userId = Number(req.user.sub);

  const conversations = db.prepare(`
    SELECT
      l.id, l.name, l.phone, l.stage, l.temperature, l.last_interaction_at,
      ml.body         AS last_message,
      ml.occurred_at  AS last_message_at,
      ml.direction    AS last_direction,
      (
        SELECT COUNT(*)
        FROM crm_message_log m2
        WHERE m2.lead_id = l.id
          AND m2.direction = 'in'
          AND m2.occurred_at > COALESCE(
            (SELECT MAX(m3.occurred_at) FROM crm_message_log m3
             WHERE m3.lead_id = l.id AND m3.direction = 'out'),
            '1970-01-01T00:00:00'
          )
      ) AS unread_count,
      (
        SELECT MIN(scheduled_at) FROM crm_followups
        WHERE lead_id = l.id AND status = 'pending'
      ) AS next_followup_at
    FROM crm_leads l
    LEFT JOIN crm_message_log ml
      ON ml.id = (
        SELECT id FROM crm_message_log
        WHERE lead_id = l.id
        ORDER BY occurred_at DESC
        LIMIT 1
      )
    WHERE l.user_id = ?
      AND ml.id IS NOT NULL
    ORDER BY ml.occurred_at DESC
    LIMIT 100
  `).all(userId);

  res.json(conversations);
});

/* ── GET /api/inbox/conversations/:leadId ────────────────────
   Detalhes do lead para o painel de contexto lateral.         */
router.get('/conversations/:leadId', (req, res) => {
  const userId = Number(req.user.sub);
  const leadId = Number(req.params.leadId);

  const lead = db.prepare(`
    SELECT l.*,
      (SELECT event_name FROM crm_lead_event WHERE lead_id = l.id LIMIT 1) AS event_name,
      (SELECT event_date FROM crm_lead_event WHERE lead_id = l.id LIMIT 1) AS event_date,
      (SELECT city       FROM crm_lead_event WHERE lead_id = l.id LIMIT 1) AS city
    FROM crm_leads l
    WHERE l.id = ? AND l.user_id = ?
  `).get(leadId, userId);

  if (!lead) return res.status(404).json({ error: 'Lead não encontrado' });

  const proposals = db.prepare(`
    SELECT id, service AS title, amount AS value, status, created_at
    FROM crm_proposals
    WHERE lead_id = ?
    ORDER BY created_at DESC
    LIMIT 5
  `).all(leadId);

  const followups = db.prepare(`
    SELECT id, automation_type AS type, message, scheduled_at, status
    FROM crm_followups
    WHERE lead_id = ? AND status = 'pending'
    ORDER BY scheduled_at ASC
    LIMIT 3
  `).all(leadId);

  const tags = db.prepare(`
    SELECT t.id, t.name, t.color
    FROM crm_tags t
    JOIN crm_lead_tags lt ON lt.tag_id = t.id
    WHERE lt.lead_id = ?
    ORDER BY t.name
  `).all(leadId);

  res.json({ ...lead, proposals, followups, tags });
});

/* ── GET /api/inbox/conversations/:leadId/messages ───────────
   Thread completa de mensagens do lead.                       */
router.get('/conversations/:leadId/messages', (req, res) => {
  const userId = Number(req.user.sub);
  const leadId = Number(req.params.leadId);

  const lead = db.prepare('SELECT id FROM crm_leads WHERE id = ? AND user_id = ?').get(leadId, userId);
  if (!lead) return res.status(404).json({ error: 'Lead não encontrado' });

  const messages = db.prepare(`
    SELECT id, direction, body, occurred_at, wa_msg_id, followup_id
    FROM crm_message_log
    WHERE lead_id = ?
    ORDER BY occurred_at ASC
  `).all(leadId);

  res.json(messages);
});

/* ── POST /api/inbox/conversations/:leadId/send ──────────────
   Envia mensagem WhatsApp ao lead e registra no log.          */
router.post('/conversations/:leadId/send', async (req, res) => {
  const userId = Number(req.user.sub);
  const leadId = Number(req.params.leadId);
  const { message } = req.body;

  if (!message?.trim()) return res.status(400).json({ error: 'Mensagem obrigatória' });

  const lead = db.prepare('SELECT id, phone FROM crm_leads WHERE id = ? AND user_id = ?').get(leadId, userId);
  if (!lead) return res.status(404).json({ error: 'Lead não encontrado' });

  if (getStatus(userId) !== 'connected') {
    return res.status(400).json({ error: 'WhatsApp não está conectado' });
  }

  try {
    const result = await sendMessage(userId, lead.phone, message.trim());
    autoLead.logOutboundMessage(leadId, message.trim(), result.msgId);

    // Retorna a mensagem recém-inserida
    const inserted = db.prepare(`
      SELECT id, direction, body, occurred_at, wa_msg_id
      FROM crm_message_log
      WHERE lead_id = ? AND direction = 'out'
      ORDER BY occurred_at DESC LIMIT 1
    `).get(leadId);

    res.json({ ok: true, message: inserted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── PATCH /api/inbox/conversations/:leadId/stage ────────────
   Move o lead para um novo estágio direto do inbox.           */
router.patch('/conversations/:leadId/stage', (req, res) => {
  const userId = Number(req.user.sub);
  const leadId = Number(req.params.leadId);
  const { stage } = req.body;

  try {
    leadService.moveStage(leadId, userId, stage);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
