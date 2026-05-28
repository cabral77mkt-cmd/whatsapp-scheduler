const express = require('express');
const router = express.Router();
const db = require('../database');

// GET /api/lancamentos - listar todos
router.get('/', (req, res) => {
  const userId = Number(req.user.sub);
  const lancamentos = db.prepare(`
    SELECT l.*, COUNT(vg.id) as total_grupos
    FROM lancamentos l
    LEFT JOIN vip_groups vg ON vg.lancamento_id = l.id
    WHERE l.user_id = ?
    GROUP BY l.id
    ORDER BY l.created_at DESC
  `).all(userId);
  res.json(lancamentos);
});

// POST /api/lancamentos - criar
router.post('/', (req, res) => {
  const { name } = req.body;
  const userId = Number(req.user.sub);
  if (!name || !name.trim()) return res.status(400).json({ error: 'Nome é obrigatório' });
  const result = db.prepare('INSERT INTO lancamentos (name, user_id) VALUES (?, ?)').run(name.trim(), userId);
  const novo = db.prepare('SELECT * FROM lancamentos WHERE id = ?').get(Number(result.lastInsertRowid));
  res.status(201).json(novo);
});

// PUT /api/lancamentos/:id - renomear
router.put('/:id', (req, res) => {
  const { name } = req.body;
  const userId = Number(req.user.sub);
  if (!name || !name.trim()) return res.status(400).json({ error: 'Nome é obrigatório' });
  const exists = db.prepare('SELECT id FROM lancamentos WHERE id = ? AND user_id = ?').get(req.params.id, userId);
  if (!exists) return res.status(404).json({ error: 'Lançamento não encontrado' });
  db.prepare('UPDATE lancamentos SET name = ? WHERE id = ?').run(name.trim(), req.params.id);
  res.json({ success: true });
});

// DELETE /api/lancamentos/:id - deletar (só se não tiver grupos)
router.delete('/:id', (req, res) => {
  const userId = Number(req.user.sub);
  const exists = db.prepare('SELECT id FROM lancamentos WHERE id = ? AND user_id = ?').get(req.params.id, userId);
  if (!exists) return res.status(404).json({ error: 'Lançamento não encontrado' });
  const grupos = db.prepare('SELECT COUNT(*) as c FROM vip_groups WHERE lancamento_id = ?').get(req.params.id);
  if (grupos.c > 0) return res.status(400).json({ error: 'Remova os grupos antes de excluir o lançamento' });
  db.prepare('DELETE FROM lancamentos WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
