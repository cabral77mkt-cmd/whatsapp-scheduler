const express = require('express');
const router = express.Router();
const db = require('../database');

// GET / — lista categorias
router.get('/', (req, res) => {
  const userId = Number(req.user.sub);
  const categories = db.prepare(
    'SELECT * FROM finance_categories WHERE user_id = ? ORDER BY type, name'
  ).all(userId);
  res.json(categories);
});

// POST / — cria categoria
router.post('/', (req, res) => {
  const userId = Number(req.user.sub);
  const { name, type = 'both', color = '#6B7280', icon = '📂' } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Nome é obrigatório' });
  if (!['income', 'expense', 'both'].includes(type)) {
    return res.status(400).json({ error: 'Tipo inválido (income/expense/both)' });
  }
  const result = db.prepare(
    'INSERT INTO finance_categories (user_id, name, type, color, icon) VALUES (?, ?, ?, ?, ?)'
  ).run(userId, name.trim(), type, color, icon);
  res.status(201).json(db.prepare('SELECT * FROM finance_categories WHERE id = ?').get(result.lastInsertRowid));
});

// PUT /:id — atualiza
router.put('/:id', (req, res) => {
  const userId = Number(req.user.sub);
  const cat = db.prepare('SELECT * FROM finance_categories WHERE id = ? AND user_id = ?').get(req.params.id, userId);
  if (!cat) return res.status(404).json({ error: 'Categoria não encontrada' });
  const { name, type, color, icon } = req.body;
  db.prepare(
    'UPDATE finance_categories SET name = ?, type = ?, color = ?, icon = ? WHERE id = ? AND user_id = ?'
  ).run(name ?? cat.name, type ?? cat.type, color ?? cat.color, icon ?? cat.icon, req.params.id, userId);
  res.json(db.prepare('SELECT * FROM finance_categories WHERE id = ?').get(req.params.id));
});

// DELETE /:id
router.delete('/:id', (req, res) => {
  const userId = Number(req.user.sub);
  const cat = db.prepare('SELECT * FROM finance_categories WHERE id = ? AND user_id = ?').get(req.params.id, userId);
  if (!cat) return res.status(404).json({ error: 'Categoria não encontrada' });
  // Desvincula transações ao invés de bloquear
  db.prepare('UPDATE finance_transactions SET category_id = NULL WHERE category_id = ? AND user_id = ?').run(req.params.id, userId);
  db.prepare('DELETE FROM finance_categories WHERE id = ? AND user_id = ?').run(req.params.id, userId);
  res.json({ ok: true });
});

module.exports = router;
