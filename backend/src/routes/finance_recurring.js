'use strict';

const express = require('express');
const router  = express.Router();
const db      = require('../database');

// ── Listar recorrências ───────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const userId   = Number(req.user.sub);
  const entityId = req.query.entity_id ? Number(req.query.entity_id) : null;

  let sql = `
    SELECT r.*,
           e.name as entity_name, e.icon as entity_icon,
           fc.name as category_name, fc.icon as category_icon
    FROM finance_recurring r
    LEFT JOIN finance_entities e ON e.id = r.entity_id
    LEFT JOIN finance_categories fc ON fc.id = r.category_id
    WHERE r.user_id = ?
  `;
  const params = [userId];

  if (entityId) { sql += ' AND r.entity_id = ?'; params.push(entityId); }
  sql += ' ORDER BY r.active DESC, r.description ASC';

  try {
    res.json(db.prepare(sql).all(...params));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Criar recorrência ─────────────────────────────────────────────────────────
router.post('/', (req, res) => {
  const userId = Number(req.user.sub);
  const {
    entity_id, type, amount, description, category_id,
    frequency, day_of_month, day_of_week, start_date, end_date
  } = req.body;

  if (!entity_id || !type || !amount || !description || !frequency || !start_date) {
    return res.status(400).json({ error: 'Campos obrigatórios: entity_id, type, amount, description, frequency, start_date' });
  }

  try {
    const result = db.prepare(`
      INSERT INTO finance_recurring
        (user_id, entity_id, type, amount, description, category_id,
         frequency, day_of_month, day_of_week, start_date, end_date)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      userId, entity_id, type, amount, description,
      category_id || null, frequency,
      day_of_month || null, day_of_week || null,
      start_date, end_date || null
    );

    const created = db.prepare('SELECT * FROM finance_recurring WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(created);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Editar recorrência ────────────────────────────────────────────────────────
router.put('/:id', (req, res) => {
  const userId = Number(req.user.sub);
  const id     = Number(req.params.id);
  const {
    amount, description, category_id, frequency,
    day_of_month, day_of_week, end_date, active
  } = req.body;

  const existing = db.prepare('SELECT * FROM finance_recurring WHERE id = ? AND user_id = ?').get(id, userId);
  if (!existing) return res.status(404).json({ error: 'Recorrência não encontrada' });

  try {
    db.prepare(`
      UPDATE finance_recurring SET
        amount       = COALESCE(?, amount),
        description  = COALESCE(?, description),
        category_id  = ?,
        frequency    = COALESCE(?, frequency),
        day_of_month = ?,
        day_of_week  = ?,
        end_date     = ?,
        active       = COALESCE(?, active)
      WHERE id = ? AND user_id = ?
    `).run(
      amount || null, description || null,
      category_id !== undefined ? category_id : existing.category_id,
      frequency || null,
      day_of_month !== undefined ? day_of_month : existing.day_of_month,
      day_of_week  !== undefined ? day_of_week  : existing.day_of_week,
      end_date     !== undefined ? end_date     : existing.end_date,
      active !== undefined ? (active ? 1 : 0) : null,
      id, userId
    );

    res.json(db.prepare('SELECT * FROM finance_recurring WHERE id = ?').get(id));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Excluir (desativar) recorrência ───────────────────────────────────────────
router.delete('/:id', (req, res) => {
  const userId = Number(req.user.sub);
  const id     = Number(req.params.id);

  const existing = db.prepare('SELECT * FROM finance_recurring WHERE id = ? AND user_id = ?').get(id, userId);
  if (!existing) return res.status(404).json({ error: 'Recorrência não encontrada' });

  db.prepare('UPDATE finance_recurring SET active = 0 WHERE id = ?').run(id);
  res.json({ ok: true });
});

module.exports = router;
