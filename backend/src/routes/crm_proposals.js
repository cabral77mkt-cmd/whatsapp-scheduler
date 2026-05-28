const express = require('express');
const router = express.Router();
const db = require('../database');
const automationRules = require('../crm/automationRules');
const { logAudit } = require('../middleware/audit');
const { dispatch: dispatchWebhook } = require('../webhooks/outbound');

function ownsLead(userId, leadId) {
  return db.prepare('SELECT id FROM crm_leads WHERE id = ? AND user_id = ?').get(leadId, userId);
}

router.get('/', (req, res) => {
  const userId = Number(req.user.sub);
  const { lead_id } = req.query;
  if (lead_id) {
    if (!ownsLead(userId, lead_id)) return res.status(404).json({ error: 'Lead não encontrado' });
    return res.json(db.prepare('SELECT * FROM crm_proposals WHERE lead_id = ? ORDER BY created_at DESC').all(lead_id));
  }
  const rows = db.prepare(`
    SELECT p.*, l.name AS lead_name, l.phone AS lead_phone
    FROM crm_proposals p JOIN crm_leads l ON l.id = p.lead_id
    WHERE l.user_id = ? ORDER BY p.created_at DESC
  `).all(userId);
  res.json(rows);
});

// POST / — cria proposta. Se sent_at preenchido, marca como 'sent' e agenda follow-ups.
router.post('/', (req, res) => {
  const userId = Number(req.user.sub);
  const b = req.body || {};
  if (!b.lead_id) return res.status(400).json({ error: 'lead_id obrigatório' });
  if (!ownsLead(userId, b.lead_id)) return res.status(404).json({ error: 'Lead não encontrado' });

  const isSent = !!b.sent_at;
  const info = db.prepare(`
    INSERT INTO crm_proposals
      (lead_id, status, due_date, sent_at, amount, payment_terms, scope, service, file_url, expected_response_at, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    b.lead_id, isSent ? 'sent' : 'pending',
    b.due_date || null, b.sent_at || null, b.amount || null,
    b.payment_terms || null, b.scope || null, b.service || null,
    b.file_url || null, b.expected_response_at || null, b.notes || null
  );

  const newStage = isSent ? 'proposta_enviada' : 'aguardando_proposta';
  db.prepare(`
    UPDATE crm_leads SET stage = ?, stage_changed_at = CURRENT_TIMESTAMP
    WHERE id = ? AND stage NOT IN ('fechado','perdido')
  `).run(newStage, b.lead_id);

  if (isSent && b.schedule_followups !== false) {
    automationRules.scheduleProposalFollowups(b.lead_id, info.lastInsertRowid, b.sent_at);
  }
  const newProposal = db.prepare('SELECT * FROM crm_proposals WHERE id = ?').get(info.lastInsertRowid);
  logAudit({ userId, entityType: 'crm_proposal', entityId: newProposal.id, action: 'create', after: newProposal, ip: req.ip });
  if (isSent) {
    dispatchWebhook(userId, 'proposal.sent', { id: newProposal.id, lead_id: b.lead_id, amount: newProposal.amount }).catch(() => {});
  }
  res.status(201).json(newProposal);
});

router.put('/:id', (req, res) => {
  const userId = Number(req.user.sub);
  const proposal = db.prepare(`
    SELECT p.* FROM crm_proposals p JOIN crm_leads l ON l.id = p.lead_id
    WHERE p.id = ? AND l.user_id = ?
  `).get(req.params.id, userId);
  if (!proposal) return res.status(404).json({ error: 'Proposta não encontrada' });
  const b = req.body || {};
  const wasUnsent = !proposal.sent_at;
  const isNowSent = !!b.sent_at;

  db.prepare(`
    UPDATE crm_proposals SET
      status = ?, due_date = ?, sent_at = ?, amount = ?, negotiated_amount = ?,
      payment_terms = ?, commission = ?, scope = ?, service = ?,
      file_url = ?, expected_response_at = ?, notes = ?
    WHERE id = ?
  `).run(
    b.status ?? proposal.status,
    b.due_date ?? proposal.due_date,
    b.sent_at ?? proposal.sent_at,
    b.amount ?? proposal.amount,
    b.negotiated_amount ?? proposal.negotiated_amount,
    b.payment_terms ?? proposal.payment_terms,
    b.commission ?? proposal.commission,
    b.scope ?? proposal.scope,
    b.service ?? proposal.service,
    b.file_url ?? proposal.file_url,
    b.expected_response_at ?? proposal.expected_response_at,
    b.notes ?? proposal.notes,
    proposal.id
  );

  if (wasUnsent && isNowSent) {
    db.prepare(`
      UPDATE crm_leads SET stage = 'proposta_enviada', stage_changed_at = CURRENT_TIMESTAMP
      WHERE id = ? AND stage NOT IN ('fechado','perdido')
    `).run(proposal.lead_id);
    if (b.schedule_followups !== false) {
      automationRules.scheduleProposalFollowups(proposal.lead_id, proposal.id, b.sent_at);
    }
  }
  res.json(db.prepare('SELECT * FROM crm_proposals WHERE id = ?').get(proposal.id));
});

router.delete('/:id', (req, res) => {
  const userId = Number(req.user.sub);
  const proposal = db.prepare(`
    SELECT p.id FROM crm_proposals p JOIN crm_leads l ON l.id = p.lead_id
    WHERE p.id = ? AND l.user_id = ?
  `).get(req.params.id, userId);
  if (!proposal) return res.status(404).json({ error: 'Proposta não encontrada' });
  db.prepare('DELETE FROM crm_proposals WHERE id = ?').run(proposal.id);
  res.json({ ok: true });
});

module.exports = router;
