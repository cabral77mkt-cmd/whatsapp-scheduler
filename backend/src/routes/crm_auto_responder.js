'use strict';

const express = require('express');
const router  = express.Router();
const db      = require('../database');

const DEFAULT_CFG = {
  enabled:             0,
  max_auto_msgs:       3,
  persona:             '',
  objectives:          '',
  response_delay_secs: 5,
  handoff_message:     '',
  sdr_enabled:         0,
  sdr_goal:            'Agendar uma reunião de 15 minutos',
  sdr_calendar_link:   '',
  sdr_max_attempts:    5,
};

/* ── GET / — configuração atual ───────────────────────────────────────── */
router.get('/', (req, res) => {
  const userId = Number(req.user.sub);
  const cfg = db.prepare('SELECT * FROM crm_auto_responder_config WHERE user_id = ?').get(userId);
  res.json(cfg || { user_id: userId, ...DEFAULT_CFG });
});

/* ── PUT / — salvar configuração ─────────────────────────────────────── */
router.put('/', (req, res) => {
  const userId = Number(req.user.sub);
  const {
    enabled, max_auto_msgs, persona, objectives,
    response_delay_secs, handoff_message,
    sdr_enabled, sdr_goal, sdr_calendar_link, sdr_max_attempts,
  } = req.body;

  db.prepare(`
    INSERT INTO crm_auto_responder_config
      (user_id, org_id, enabled, max_auto_msgs, persona, objectives, response_delay_secs,
       handoff_message, sdr_enabled, sdr_goal, sdr_calendar_link, sdr_max_attempts, updated_at)
    VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id) DO UPDATE SET
      enabled             = excluded.enabled,
      max_auto_msgs       = excluded.max_auto_msgs,
      persona             = excluded.persona,
      objectives          = excluded.objectives,
      response_delay_secs = excluded.response_delay_secs,
      handoff_message     = excluded.handoff_message,
      sdr_enabled         = excluded.sdr_enabled,
      sdr_goal            = excluded.sdr_goal,
      sdr_calendar_link   = excluded.sdr_calendar_link,
      sdr_max_attempts    = excluded.sdr_max_attempts,
      updated_at          = CURRENT_TIMESTAMP
  `).run(
    userId,
    enabled    ? 1 : 0,
    Number(max_auto_msgs)       || 3,
    persona            || '',
    objectives         || '',
    Number(response_delay_secs) || 5,
    handoff_message    || '',
    sdr_enabled ? 1 : 0,
    sdr_goal           || 'Agendar uma reunião de 15 minutos',
    sdr_calendar_link  || '',
    Number(sdr_max_attempts)    || 5,
  );

  res.json({ ok: true });
});

/* ── GET /stats — estatísticas de uso ────────────────────────────────── */
router.get('/stats', (req, res) => {
  const userId = Number(req.user.sub);
  const today  = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

  const totals = db.prepare(`
    SELECT
      SUM(CASE WHEN ml.auto_response = 1 THEN 1 ELSE 0 END) AS first_responder_total,
      SUM(CASE WHEN ml.auto_response = 2 THEN 1 ELSE 0 END) AS sdr_total,
      SUM(CASE WHEN ml.auto_response > 0 AND DATE(ml.occurred_at) = ? THEN 1 ELSE 0 END) AS today_total
    FROM crm_message_log ml
    JOIN crm_leads l ON l.id = ml.lead_id
    WHERE l.user_id = ? AND ml.direction = 'out' AND ml.auto_response > 0
  `).get(today, userId) || {};

  const weekly = db.prepare(`
    SELECT DATE(ml.occurred_at) AS day,
           SUM(CASE WHEN ml.auto_response = 1 THEN 1 ELSE 0 END) AS first,
           SUM(CASE WHEN ml.auto_response = 2 THEN 1 ELSE 0 END) AS sdr
    FROM crm_message_log ml
    JOIN crm_leads l ON l.id = ml.lead_id
    WHERE l.user_id = ? AND ml.direction = 'out' AND ml.auto_response > 0
      AND DATE(ml.occurred_at) >= ?
    GROUP BY DATE(ml.occurred_at)
    ORDER BY day ASC
  `).all(userId, weekAgo);

  // Leads actualmente em fase de auto-resposta (first responder ativo)
  const activeLeads = db.prepare(`
    SELECT COUNT(DISTINCT ml.lead_id) AS count
    FROM crm_message_log ml
    JOIN crm_leads l ON l.id = ml.lead_id
    WHERE l.user_id = ? AND ml.auto_response > 0
      AND l.stage NOT IN ('fechado', 'perdido')
  `).get(userId) || {};

  res.json({
    first_responder_total: totals.first_responder_total || 0,
    sdr_total:             totals.sdr_total             || 0,
    today_total:           totals.today_total           || 0,
    active_leads:          activeLeads.count            || 0,
    weekly,
  });
});

module.exports = router;
