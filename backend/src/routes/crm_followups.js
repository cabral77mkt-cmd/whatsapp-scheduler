const express = require('express');
const router = express.Router();
const db = require('../database');
const businessHours = require('../crm/businessHours');

function ownsLead(userId, leadId) {
  return db.prepare('SELECT id FROM crm_leads WHERE id = ? AND user_id = ?').get(leadId, userId);
}

router.get('/', (req, res) => {
  const userId = Number(req.user.sub);
  const { lead_id, status } = req.query;
  const where = ['l.user_id = ?'];
  const params = [userId];
  if (lead_id) { where.push('f.lead_id = ?'); params.push(lead_id); }
  if (status)  { where.push('f.status = ?');  params.push(status); }
  const rows = db.prepare(`
    SELECT f.*, l.name AS lead_name, l.phone AS lead_phone, l.stage AS lead_stage
    FROM crm_followups f JOIN crm_leads l ON l.id = f.lead_id
    WHERE ${where.join(' AND ')}
    ORDER BY f.scheduled_at ASC
  `).all(...params);
  res.json(rows);
});

router.post('/', (req, res) => {
  const userId = Number(req.user.sub);
  const { lead_id, message, scheduled_at, automation_type = 'manual' } = req.body || {};
  if (!lead_id || !message || !scheduled_at) return res.status(400).json({ error: 'Campos obrigatórios faltando' });
  if (!ownsLead(userId, lead_id)) return res.status(404).json({ error: 'Lead não encontrado' });
  const lead = db.prepare('SELECT stage FROM crm_leads WHERE id = ?').get(lead_id);
  const info = db.prepare(`
    INSERT INTO crm_followups
      (lead_id, user_id, message, scheduled_at, stage_at_schedule, automation_type)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(lead_id, userId, message, scheduled_at, lead.stage, automation_type);
  res.status(201).json(db.prepare('SELECT * FROM crm_followups WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const userId = Number(req.user.sub);
  const f = db.prepare('SELECT * FROM crm_followups WHERE id = ? AND user_id = ?').get(req.params.id, userId);
  if (!f) return res.status(404).json({ error: 'Follow-up não encontrado' });
  if (f.status !== 'pending') return res.status(400).json({ error: 'Apenas follow-ups pendentes podem ser editados' });
  const b = req.body || {};
  db.prepare(`UPDATE crm_followups SET message = ?, scheduled_at = ? WHERE id = ?`)
    .run(b.message ?? f.message, b.scheduled_at ?? f.scheduled_at, f.id);
  res.json(db.prepare('SELECT * FROM crm_followups WHERE id = ?').get(f.id));
});

router.post('/:id/cancel', (req, res) => {
  const userId = Number(req.user.sub);
  const f = db.prepare('SELECT * FROM crm_followups WHERE id = ? AND user_id = ?').get(req.params.id, userId);
  if (!f) return res.status(404).json({ error: 'Follow-up não encontrado' });
  if (f.status !== 'pending') return res.status(400).json({ error: 'Só pendentes podem ser cancelados' });
  db.prepare("UPDATE crm_followups SET status = 'canceled' WHERE id = ?").run(f.id);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  const userId = Number(req.user.sub);
  const f = db.prepare('SELECT id FROM crm_followups WHERE id = ? AND user_id = ?').get(req.params.id, userId);
  if (!f) return res.status(404).json({ error: 'Follow-up não encontrado' });
  db.prepare('DELETE FROM crm_followups WHERE id = ?').run(f.id);
  res.json({ ok: true });
});

// POST /preview-time — devolve horário válido considerando janela comercial
router.post('/preview-time', (req, res) => {
  const userId = Number(req.user.sub);
  const { scheduled_at } = req.body || {};
  if (!scheduled_at) return res.status(400).json({ error: 'scheduled_at obrigatório' });
  const adjusted = businessHours.nextAllowedSlot(userId, new Date(scheduled_at));
  res.json({
    requested: scheduled_at,
    adjusted: adjusted.toISOString(),
    moved: adjusted.toISOString() !== new Date(scheduled_at).toISOString()
  });
});

module.exports = router;
