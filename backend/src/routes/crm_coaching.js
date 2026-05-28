'use strict';

const express  = require('express');
const router   = express.Router();
const db       = require('../database');
const coaching = require('../crm/coachingService');

/* ── GET / — lista cards não descartados (mais recentes primeiro) ─────── */
router.get('/', (req, res) => {
  const userId = Number(req.user.sub);
  const { type, limit = 20, include_dismissed = 0 } = req.query;

  let where = 'user_id = ?';
  const params = [userId];

  if (!Number(include_dismissed)) {
    where += ' AND dismissed_at IS NULL';
  }
  if (type) {
    where += ' AND type = ?';
    params.push(type);
  }

  const cards = db.prepare(`
    SELECT cc.*, l.name AS lead_name, l.phone AS lead_phone, l.stage AS lead_stage
    FROM crm_coaching_cards cc
    LEFT JOIN crm_leads l ON l.id = cc.lead_id
    WHERE ${where}
    ORDER BY cc.created_at DESC
    LIMIT ${Number(limit) || 20}
  `).all(...params);

  const counts = db.prepare(`
    SELECT type, COUNT(*) AS count
    FROM crm_coaching_cards
    WHERE user_id = ? AND dismissed_at IS NULL
    GROUP BY type
  `).all(userId);

  res.json({ cards, counts });
});

/* ── POST /:id/dismiss — descarta um card ─────────────────────────────── */
router.post('/:id/dismiss', (req, res) => {
  const userId = Number(req.user.sub);
  const id = Number(req.params.id);
  const card = db.prepare('SELECT id FROM crm_coaching_cards WHERE id = ? AND user_id = ?').get(id, userId);
  if (!card) return res.status(404).json({ error: 'Card não encontrado' });
  db.prepare('UPDATE crm_coaching_cards SET dismissed_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
  res.json({ ok: true });
});

/* ── POST /generate/:leadId — força geração manual ───────────────────── */
router.post('/generate/:leadId', async (req, res) => {
  const userId = Number(req.user.sub);
  const leadId = Number(req.params.leadId);
  const { type = 'win' } = req.body;

  const lead = db.prepare('SELECT id, user_id FROM crm_leads WHERE id = ? AND user_id = ?').get(leadId, userId);
  if (!lead) return res.status(404).json({ error: 'Lead não encontrado' });

  const VALID_TYPES = ['win', 'loss', 'stale'];
  if (!VALID_TYPES.includes(type)) return res.status(400).json({ error: 'Tipo inválido' });

  try {
    const fn = type === 'win'   ? coaching.generateWinCoaching
             : type === 'loss'  ? coaching.generateLossCoaching
             :                    coaching.generateStaleCoaching;
    await fn(leadId, userId);

    const latest = db.prepare(`
      SELECT * FROM crm_coaching_cards WHERE lead_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 1
    `).get(leadId, userId);
    res.json(latest || { ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ── GET /summary — resumo da semana ─────────────────────────────────── */
router.get('/summary', (req, res) => {
  const userId  = Number(req.user.sub);
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

  const summary = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN type = 'win'   THEN 1 ELSE 0 END) AS wins,
      SUM(CASE WHEN type = 'loss'  THEN 1 ELSE 0 END) AS losses,
      SUM(CASE WHEN type = 'stale' THEN 1 ELSE 0 END) AS stale,
      AVG(CASE WHEN score IS NOT NULL THEN score ELSE NULL END) AS avg_score
    FROM crm_coaching_cards
    WHERE user_id = ? AND DATE(created_at) >= ?
  `).get(userId, weekAgo) || {};

  res.json(summary);
});

module.exports = router;
