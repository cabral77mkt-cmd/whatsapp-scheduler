'use strict';

const express = require('express');
const router  = express.Router();
const db      = require('../database');

// ── Listar projetos ───────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const userId   = Number(req.user.sub);
  const entityId = req.query.entity_id ? Number(req.query.entity_id) : null;
  const status   = req.query.status || null;

  let sql = `
    SELECT p.*,
           e.name as entity_name, e.icon as entity_icon, e.color as entity_color,
           COALESCE(SUM(CASE WHEN t.type='income'  THEN t.amount ELSE 0 END), 0) as total_income,
           COALESCE(SUM(CASE WHEN t.type='expense' THEN t.amount ELSE 0 END), 0) as total_expense,
           COUNT(t.id) as tx_count
    FROM finance_projects p
    LEFT JOIN finance_entities e ON e.id = p.entity_id
    LEFT JOIN finance_transactions t ON t.project_id = p.id AND t.user_id = p.user_id
    WHERE p.user_id = ?
  `;
  const params = [userId];

  if (entityId) { sql += ' AND p.entity_id = ?'; params.push(entityId); }
  if (status)   { sql += ' AND p.status = ?';    params.push(status); }

  sql += ' GROUP BY p.id ORDER BY p.status ASC, p.start_date DESC';

  try {
    const rows = db.prepare(sql).all(...params).map(r => ({
      ...r,
      result:  r.total_income - r.total_expense,
      margin:  r.total_income > 0
        ? Math.round(((r.total_income - r.total_expense) / r.total_income) * 100)
        : null,
      budget_used: r.budget > 0
        ? Math.round((r.total_expense / r.budget) * 100)
        : null,
    }));
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Criar projeto ─────────────────────────────────────────────────────────────
router.post('/', (req, res) => {
  const userId = Number(req.user.sub);
  const { entity_id, name, type, start_date, end_date, budget, description } = req.body;

  if (!entity_id || !name) {
    return res.status(400).json({ error: 'entity_id e name são obrigatórios' });
  }

  try {
    const result = db.prepare(`
      INSERT INTO finance_projects
        (user_id, entity_id, name, type, start_date, end_date, budget, description)
      VALUES (?,?,?,?,?,?,?,?)
    `).run(
      userId, entity_id, name, type || 'event',
      start_date || null, end_date || null,
      budget || 0, description || null
    );
    res.status(201).json(db.prepare('SELECT * FROM finance_projects WHERE id = ?').get(result.lastInsertRowid));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Editar projeto ────────────────────────────────────────────────────────────
router.put('/:id', (req, res) => {
  const userId = Number(req.user.sub);
  const id     = Number(req.params.id);
  const { name, type, start_date, end_date, budget, description, status } = req.body;

  const existing = db.prepare('SELECT * FROM finance_projects WHERE id = ? AND user_id = ?').get(id, userId);
  if (!existing) return res.status(404).json({ error: 'Projeto não encontrado' });

  try {
    db.prepare(`
      UPDATE finance_projects SET
        name        = COALESCE(?, name),
        type        = COALESCE(?, type),
        start_date  = ?,
        end_date    = ?,
        budget      = COALESCE(?, budget),
        description = ?,
        status      = COALESCE(?, status)
      WHERE id = ? AND user_id = ?
    `).run(
      name || null, type || null,
      start_date !== undefined ? start_date : existing.start_date,
      end_date   !== undefined ? end_date   : existing.end_date,
      budget || null,
      description !== undefined ? description : existing.description,
      status || null,
      id, userId
    );
    res.json(db.prepare('SELECT * FROM finance_projects WHERE id = ?').get(id));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Fechar projeto ────────────────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  const userId = Number(req.user.sub);
  const id     = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM finance_projects WHERE id = ? AND user_id = ?').get(id, userId);
  if (!existing) return res.status(404).json({ error: 'Projeto não encontrado' });

  db.prepare("UPDATE finance_projects SET status = 'closed' WHERE id = ?").run(id);
  res.json({ ok: true });
});

// ── P&L detalhado ─────────────────────────────────────────────────────────────
router.get('/:id/pl', (req, res) => {
  const userId = Number(req.user.sub);
  const id     = Number(req.params.id);

  const project = db.prepare('SELECT * FROM finance_projects WHERE id = ? AND user_id = ?').get(id, userId);
  if (!project) return res.status(404).json({ error: 'Projeto não encontrado' });

  try {
    const totals = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN type='income'  THEN amount ELSE 0 END), 0) as total_income,
        COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END), 0) as total_expense,
        COUNT(*) as tx_count
      FROM finance_transactions
      WHERE project_id = ? AND user_id = ?
    `).get(id, userId);

    const byCategory = db.prepare(`
      SELECT fc.name, fc.icon, fc.color, t.type,
             SUM(t.amount) as total, COUNT(*) as count
      FROM finance_transactions t
      LEFT JOIN finance_categories fc ON fc.id = t.category_id
      WHERE t.project_id = ? AND t.user_id = ?
      GROUP BY t.category_id, t.type
      ORDER BY total DESC
    `).all(id, userId);

    const transactions = db.prepare(`
      SELECT t.*, fc.name as category_name, fc.icon as category_icon
      FROM finance_transactions t
      LEFT JOIN finance_categories fc ON fc.id = t.category_id
      WHERE t.project_id = ? AND t.user_id = ?
      ORDER BY t.date DESC
    `).all(id, userId);

    const result = totals.total_income - totals.total_expense;
    const margin = totals.total_income > 0
      ? Math.round((result / totals.total_income) * 100)
      : null;
    const budgetUsed = project.budget > 0
      ? Math.round((totals.total_expense / project.budget) * 100)
      : null;

    res.json({
      project,
      totals: { ...totals, result, margin, budget_used: budgetUsed },
      by_category: byCategory,
      transactions,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
