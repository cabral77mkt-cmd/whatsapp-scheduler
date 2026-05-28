const express = require('express');
const router = express.Router();
const db = require('../database');

router.get('/', (req, res) => {
  const userId = Number(req.user.sub);
  db.ensureCrmSeeds(userId);
  const tags = db.prepare('SELECT * FROM crm_tags WHERE user_id = ? ORDER BY name').all(userId);
  res.json(tags);
});

router.post('/', (req, res) => {
  const userId = Number(req.user.sub);
  const { name, color = '#F97316' } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: 'Nome obrigatório' });
  try {
    const info = db.prepare('INSERT INTO crm_tags (user_id, name, color) VALUES (?, ?, ?)')
      .run(userId, name.trim(), color);
    res.status(201).json(db.prepare('SELECT * FROM crm_tags WHERE id = ?').get(info.lastInsertRowid));
  } catch (err) {
    res.status(400).json({ error: 'Tag já existe' });
  }
});

router.put('/:id', (req, res) => {
  const userId = Number(req.user.sub);
  const t = db.prepare('SELECT * FROM crm_tags WHERE id = ? AND user_id = ?').get(req.params.id, userId);
  if (!t) return res.status(404).json({ error: 'Tag não encontrada' });
  const b = req.body || {};
  db.prepare('UPDATE crm_tags SET name = ?, color = ? WHERE id = ?')
    .run(b.name?.trim() || t.name, b.color || t.color, t.id);
  res.json(db.prepare('SELECT * FROM crm_tags WHERE id = ?').get(t.id));
});

router.delete('/:id', (req, res) => {
  const userId = Number(req.user.sub);
  const t = db.prepare('SELECT id FROM crm_tags WHERE id = ? AND user_id = ?').get(req.params.id, userId);
  if (!t) return res.status(404).json({ error: 'Tag não encontrada' });
  db.prepare('DELETE FROM crm_tags WHERE id = ?').run(t.id);
  res.json({ ok: true });
});

module.exports = router;
