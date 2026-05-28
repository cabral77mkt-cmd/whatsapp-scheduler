'use strict';

const express = require('express');
const router  = express.Router();
const db      = require('../database');

/* ── GET / — lista cards (usuário + templates sistema) ──────────────── */
router.get('/', (req, res) => {
  const userId   = Number(req.user.sub);
  const { q, category } = req.query;

  let where  = '(user_id = ? OR user_id = 0)';
  const params = [userId];

  if (q) {
    where += ' AND (LOWER(objection) LIKE ? OR LOWER(response) LIKE ? OR LOWER(trigger_keywords) LIKE ?)';
    const like = `%${q.toLowerCase()}%`;
    params.push(like, like, like);
  }
  if (category) {
    where += ' AND category = ?';
    params.push(category);
  }

  const cards = db.prepare(`
    SELECT *, (CASE WHEN user_id = 0 THEN 1 ELSE 0 END) AS is_system
    FROM crm_battle_cards
    WHERE ${where}
    ORDER BY user_id DESC, uses_count DESC, created_at DESC
  `).all(...params);

  const categories = db.prepare(`
    SELECT DISTINCT category FROM crm_battle_cards
    WHERE user_id = ? OR user_id = 0 ORDER BY category
  `).all(userId).map(r => r.category);

  res.json({ cards, categories });
});

/* ── POST / — criar card personalizado ──────────────────────────────── */
router.post('/', (req, res) => {
  const userId = Number(req.user.sub);
  const { category, objection, response, tips, trigger_keywords } = req.body;

  if (!objection?.trim()) return res.status(400).json({ error: 'Objeção é obrigatória' });
  if (!response?.trim())  return res.status(400).json({ error: 'Resposta é obrigatória' });

  const keys = Array.isArray(trigger_keywords)
    ? JSON.stringify(trigger_keywords)
    : (trigger_keywords || '[]');

  const info = db.prepare(`
    INSERT INTO crm_battle_cards (user_id, org_id, category, objection, response, tips, trigger_keywords)
    VALUES (?, 1, ?, ?, ?, ?, ?)
  `).run(userId, category || 'geral', objection.trim(), response.trim(), tips || null, keys);

  res.status(201).json(db.prepare('SELECT * FROM crm_battle_cards WHERE id = ?').get(info.lastInsertRowid));
});

/* ── PUT /:id — atualizar card ───────────────────────────────────────── */
router.put('/:id', (req, res) => {
  const userId = Number(req.user.sub);
  const id = Number(req.params.id);
  const card = db.prepare('SELECT id FROM crm_battle_cards WHERE id = ? AND user_id = ?').get(id, userId);
  if (!card) return res.status(404).json({ error: 'Card não encontrado ou é um template do sistema' });

  const { category, objection, response, tips, trigger_keywords } = req.body;
  const keys = Array.isArray(trigger_keywords) ? JSON.stringify(trigger_keywords) : (trigger_keywords || '[]');

  db.prepare(`
    UPDATE crm_battle_cards SET category = ?, objection = ?, response = ?, tips = ?, trigger_keywords = ?
    WHERE id = ?
  `).run(category || 'geral', objection || '', response || '', tips || null, keys, id);

  res.json(db.prepare('SELECT * FROM crm_battle_cards WHERE id = ?').get(id));
});

/* ── DELETE /:id ─────────────────────────────────────────────────────── */
router.delete('/:id', (req, res) => {
  const userId = Number(req.user.sub);
  const id = Number(req.params.id);
  const card = db.prepare('SELECT id FROM crm_battle_cards WHERE id = ? AND user_id = ?').get(id, userId);
  if (!card) return res.status(404).json({ error: 'Card não encontrado ou é um template do sistema' });
  db.prepare('DELETE FROM crm_battle_cards WHERE id = ?').run(id);
  res.json({ ok: true });
});

/* ── POST /:id/use — incrementa uses_count ───────────────────────────── */
router.post('/:id/use', (req, res) => {
  const id = Number(req.params.id);
  db.prepare('UPDATE crm_battle_cards SET uses_count = uses_count + 1 WHERE id = ?').run(id);
  res.json({ ok: true });
});

module.exports = router;
