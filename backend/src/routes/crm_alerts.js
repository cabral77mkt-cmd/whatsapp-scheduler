'use strict';

const express = require('express');
const router  = express.Router();
const db      = require('../database');
const { generateAlertsForUser, getUnread } = require('../crm/alertsService');

/* ── GET / — alertas ativos (não descartados) ────────────────────────── */
router.get('/', (req, res) => {
  const userId = Number(req.user.sub);
  const alerts = getUnread(userId);
  const unread_count = alerts.filter(a => !a.read_at).length;
  res.json({ alerts, unread_count });
});

/* ── PATCH /:id/read — marca como lido ──────────────────────────────── */
router.patch('/:id/read', (req, res) => {
  const userId = Number(req.user.sub);
  const id     = Number(req.params.id);
  db.prepare(`
    UPDATE crm_alerts SET read_at = CURRENT_TIMESTAMP
    WHERE id = ? AND user_id = ? AND read_at IS NULL
  `).run(id, userId);
  res.json({ ok: true });
});

/* ── PATCH /read-all — marca todos como lidos ────────────────────────── */
router.patch('/read-all', (req, res) => {
  const userId = Number(req.user.sub);
  db.prepare(`
    UPDATE crm_alerts SET read_at = CURRENT_TIMESTAMP
    WHERE user_id = ? AND read_at IS NULL AND dismissed_at IS NULL
  `).run(userId);
  res.json({ ok: true });
});

/* ── DELETE /:id — descarta alerta ───────────────────────────────────── */
router.delete('/:id', (req, res) => {
  const userId = Number(req.user.sub);
  const id     = Number(req.params.id);
  db.prepare(`
    UPDATE crm_alerts SET dismissed_at = CURRENT_TIMESTAMP
    WHERE id = ? AND user_id = ?
  `).run(id, userId);
  res.json({ ok: true });
});

/* ── DELETE / — descarta todos os lidos ──────────────────────────────── */
router.delete('/', (req, res) => {
  const userId = Number(req.user.sub);
  db.prepare(`
    UPDATE crm_alerts SET dismissed_at = CURRENT_TIMESTAMP
    WHERE user_id = ? AND read_at IS NOT NULL AND dismissed_at IS NULL
  `).run(userId);
  res.json({ ok: true });
});

/* ── POST /generate — gera alertas sob demanda ───────────────────────── */
router.post('/generate', (req, res) => {
  const userId = Number(req.user.sub);
  const count  = generateAlertsForUser(userId);
  res.json({ ok: true, generated: count });
});

module.exports = router;
