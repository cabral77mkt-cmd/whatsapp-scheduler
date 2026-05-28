const express = require('express');
const router = express.Router();
const db = require('../database');

function ownsLead(userId, leadId) {
  return db.prepare('SELECT id FROM crm_leads WHERE id = ? AND user_id = ?').get(leadId, userId);
}

router.get('/', (req, res) => {
  const userId = Number(req.user.sub);
  const { lead_id, open } = req.query;
  const where = ['user_id = ?'];
  const params = [userId];
  if (lead_id) { where.push('lead_id = ?'); params.push(lead_id); }
  if (open === '1') where.push('done_at IS NULL');
  const rows = db.prepare(`
    SELECT * FROM crm_tasks WHERE ${where.join(' AND ')}
    ORDER BY done_at IS NOT NULL, due_date ASC NULLS LAST, created_at DESC
  `).all(...params);
  res.json(rows);
});

router.post('/', (req, res) => {
  const userId = Number(req.user.sub);
  const { lead_id, title, due_date, notes } = req.body || {};
  if (!lead_id || !title?.trim()) return res.status(400).json({ error: 'lead_id e title obrigatórios' });
  if (!ownsLead(userId, lead_id)) return res.status(404).json({ error: 'Lead não encontrado' });
  const info = db.prepare(`
    INSERT INTO crm_tasks (lead_id, user_id, title, due_date, notes) VALUES (?, ?, ?, ?, ?)
  `).run(lead_id, userId, title.trim(), due_date || null, notes || null);
  res.status(201).json(db.prepare('SELECT * FROM crm_tasks WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const userId = Number(req.user.sub);
  const t = db.prepare('SELECT * FROM crm_tasks WHERE id = ? AND user_id = ?').get(req.params.id, userId);
  if (!t) return res.status(404).json({ error: 'Tarefa não encontrada' });
  const b = req.body || {};
  db.prepare(`UPDATE crm_tasks SET title = ?, due_date = ?, notes = ?, done_at = ? WHERE id = ?`)
    .run(
      b.title ?? t.title,
      b.due_date ?? t.due_date,
      b.notes ?? t.notes,
      b.done === true ? (t.done_at || new Date().toISOString()) : (b.done === false ? null : t.done_at),
      t.id
    );
  res.json(db.prepare('SELECT * FROM crm_tasks WHERE id = ?').get(t.id));
});

router.delete('/:id', (req, res) => {
  const userId = Number(req.user.sub);
  const t = db.prepare('SELECT id FROM crm_tasks WHERE id = ? AND user_id = ?').get(req.params.id, userId);
  if (!t) return res.status(404).json({ error: 'Tarefa não encontrada' });
  db.prepare('DELETE FROM crm_tasks WHERE id = ?').run(t.id);
  res.json({ ok: true });
});

module.exports = router;
