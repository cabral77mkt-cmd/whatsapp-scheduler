const express = require('express');
const router = express.Router();
const db = require('../database');
const automationRules = require('../crm/automationRules');

function ownsLead(userId, leadId) {
  return db.prepare('SELECT id FROM crm_leads WHERE id = ? AND user_id = ?').get(leadId, userId);
}

// GET /?lead_id=&from=&to=
router.get('/', (req, res) => {
  const userId = Number(req.user.sub);
  const { lead_id } = req.query;
  let rows;
  if (lead_id) {
    if (!ownsLead(userId, lead_id)) return res.status(404).json({ error: 'Lead não encontrado' });
    rows = db.prepare(`SELECT * FROM crm_meetings WHERE lead_id = ? ORDER BY meeting_at DESC`).all(lead_id);
  } else {
    rows = db.prepare(`
      SELECT m.*, l.name AS lead_name, l.phone AS lead_phone
      FROM crm_meetings m JOIN crm_leads l ON l.id = m.lead_id
      WHERE l.user_id = ? ORDER BY m.meeting_at DESC
    `).all(userId);
  }
  res.json(rows);
});

// POST / — cria reunião e agenda lembretes
router.post('/', (req, res) => {
  const userId = Number(req.user.sub);
  const { lead_id, meeting_at, format, link, notes, schedule_reminders = true } = req.body || {};
  if (!lead_id || !meeting_at) return res.status(400).json({ error: 'lead_id e meeting_at obrigatórios' });
  if (!ownsLead(userId, lead_id)) return res.status(404).json({ error: 'Lead não encontrado' });

  const info = db.prepare(`
    INSERT INTO crm_meetings (lead_id, meeting_at, format, link, notes)
    VALUES (?, ?, ?, ?, ?)
  `).run(lead_id, meeting_at, format || null, link || null, notes || null);

  db.prepare(`
    UPDATE crm_leads SET stage = 'reuniao_agendada', stage_changed_at = CURRENT_TIMESTAMP
    WHERE id = ? AND stage NOT IN ('fechado','perdido')
  `).run(lead_id);

  if (schedule_reminders) {
    const meetingId = info.lastInsertRowid;
    automationRules.scheduleMeetingConfirmation(lead_id, meetingId);
    automationRules.scheduleMeetingReminders(lead_id, meetingId, meeting_at);
  }

  res.status(201).json(db.prepare('SELECT * FROM crm_meetings WHERE id = ?').get(info.lastInsertRowid));
});

// PUT /:id — atualiza reunião (resumo, dores, etc.)
router.put('/:id', (req, res) => {
  const userId = Number(req.user.sub);
  const meeting = db.prepare(`
    SELECT m.* FROM crm_meetings m JOIN crm_leads l ON l.id = m.lead_id
    WHERE m.id = ? AND l.user_id = ?
  `).get(req.params.id, userId);
  if (!meeting) return res.status(404).json({ error: 'Reunião não encontrada' });

  const b = req.body || {};
  db.prepare(`
    UPDATE crm_meetings SET
      meeting_at = ?, format = ?, link = ?, notes = ?, status = ?,
      summary = ?, client_pains = ?, client_needs = ?,
      estimated_budget = ?, close_probability = ?, next_step = ?, next_followup_at = ?
    WHERE id = ?
  `).run(
    b.meeting_at ?? meeting.meeting_at,
    b.format ?? meeting.format,
    b.link ?? meeting.link,
    b.notes ?? meeting.notes,
    b.status ?? meeting.status,
    b.summary ?? meeting.summary,
    b.client_pains ?? meeting.client_pains,
    b.client_needs ?? meeting.client_needs,
    b.estimated_budget ?? meeting.estimated_budget,
    b.close_probability ?? meeting.close_probability,
    b.next_step ?? meeting.next_step,
    b.next_followup_at ?? meeting.next_followup_at,
    meeting.id
  );

  if (b.status === 'done') {
    db.prepare(`
      UPDATE crm_leads SET stage = 'reuniao_realizada', stage_changed_at = CURRENT_TIMESTAMP
      WHERE id = ? AND stage = 'reuniao_agendada'
    `).run(meeting.lead_id);
  }
  res.json(db.prepare('SELECT * FROM crm_meetings WHERE id = ?').get(meeting.id));
});

router.delete('/:id', (req, res) => {
  const userId = Number(req.user.sub);
  const meeting = db.prepare(`
    SELECT m.id FROM crm_meetings m JOIN crm_leads l ON l.id = m.lead_id
    WHERE m.id = ? AND l.user_id = ?
  `).get(req.params.id, userId);
  if (!meeting) return res.status(404).json({ error: 'Reunião não encontrada' });
  db.prepare('DELETE FROM crm_meetings WHERE id = ?').run(meeting.id);
  res.json({ ok: true });
});

module.exports = router;
