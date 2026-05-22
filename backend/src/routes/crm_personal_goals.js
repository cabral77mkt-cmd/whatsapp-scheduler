'use strict';

const express = require('express');
const router  = express.Router();
const db      = require('../database');

/** Calcula o progresso real do usuário no período (YYYY-MM). */
function calcProgress(userId, period) {
  const monthStart = period + '-01';
  // Próximo mês para limitar a query
  const [y, m] = period.split('-').map(Number);
  const nextMonth = m === 12
    ? `${y + 1}-01-01`
    : `${y}-${String(m + 1).padStart(2, '0')}-01`;

  const deals = db.prepare(`
    SELECT COUNT(*) AS c, COALESCE(SUM(closed_value), 0) AS revenue
    FROM crm_leads
    WHERE user_id = ? AND stage = 'fechado'
      AND stage_changed_at >= ? AND stage_changed_at < ?
  `).get(userId, monthStart, nextMonth) || { c: 0, revenue: 0 };

  // crm_meetings não tem user_id direto — join via crm_leads
  const meetings = db.prepare(`
    SELECT COUNT(*) AS c FROM crm_meetings m
    JOIN crm_leads l ON l.id = m.lead_id
    WHERE l.user_id = ? AND m.status IN ('done','realizada')
      AND DATE(m.meeting_at) >= ? AND DATE(m.meeting_at) < ?
  `).get(userId, monthStart, nextMonth)?.c || 0;

  const followups = db.prepare(`
    SELECT COUNT(*) AS c FROM crm_followups
    WHERE user_id = ? AND status = 'sent'
      AND DATE(sent_at) >= ? AND DATE(sent_at) < ?
  `).get(userId, monthStart, nextMonth)?.c || 0;

  const newLeads = db.prepare(`
    SELECT COUNT(*) AS c FROM crm_leads
    WHERE user_id = ?
      AND first_contact_at >= ? AND first_contact_at < ?
  `).get(userId, monthStart, nextMonth)?.c || 0;

  return {
    actual_revenue:   deals.revenue  || 0,
    actual_deals:     deals.c        || 0,
    actual_meetings:  meetings,
    actual_followups: followups,
    actual_new_leads: newLeads,
  };
}

/* ── GET / — meta do mês atual + progresso ───────────────────────────── */
router.get('/', (req, res) => {
  const userId = Number(req.user.sub);
  const period = req.query.period || new Date().toISOString().slice(0, 7);

  const goal = db.prepare('SELECT * FROM crm_personal_goals WHERE user_id = ? AND period = ?').get(userId, period)
    || { user_id: userId, period, target_revenue: 0, target_deals: 0, target_meetings: 0, target_followups: 0, target_new_leads: 0 };

  const progress = calcProgress(userId, period);

  // Histórico dos últimos 6 meses
  const history = db.prepare(`
    SELECT * FROM crm_personal_goals WHERE user_id = ? ORDER BY period DESC LIMIT 6
  `).all(userId).map(g => ({
    ...g,
    ...calcProgress(userId, g.period),
  }));

  res.json({ goal, progress, history });
});

/* ── PUT / — salvar metas ────────────────────────────────────────────── */
router.put('/', (req, res) => {
  const userId = Number(req.user.sub);
  const period = req.body.period || new Date().toISOString().slice(0, 7);
  const {
    target_revenue    = 0,
    target_deals      = 0,
    target_meetings   = 0,
    target_followups  = 0,
    target_new_leads  = 0,
  } = req.body;

  db.prepare(`
    INSERT INTO crm_personal_goals
      (user_id, org_id, period, target_revenue, target_deals, target_meetings, target_followups, target_new_leads, updated_at)
    VALUES (?, 1, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id, period) DO UPDATE SET
      target_revenue   = excluded.target_revenue,
      target_deals     = excluded.target_deals,
      target_meetings  = excluded.target_meetings,
      target_followups = excluded.target_followups,
      target_new_leads = excluded.target_new_leads,
      updated_at       = CURRENT_TIMESTAMP
  `).run(
    userId, period,
    parseFloat(target_revenue)   || 0,
    parseInt(target_deals)       || 0,
    parseInt(target_meetings)    || 0,
    parseInt(target_followups)   || 0,
    parseInt(target_new_leads)   || 0,
  );

  res.json({ ok: true });
});

/* ── GET /leaderboard — ranking de metas do mês (admin/manager) ──────── */
router.get('/leaderboard', (req, res) => {
  if (!req.user.isAdmin && req.user.role !== 'manager') {
    return res.status(403).json({ error: 'Sem permissão' });
  }
  const period = req.query.period || new Date().toISOString().slice(0, 7);

  const goals = db.prepare(`
    SELECT g.*, COALESCE(u.display_name, u.username) AS seller_name
    FROM crm_personal_goals g
    JOIN users u ON u.id = g.user_id
    WHERE g.period = ?
    ORDER BY seller_name
  `).all(period);

  const result = goals.map(g => ({
    ...g,
    ...calcProgress(g.user_id, period),
  }));

  res.json(result);
});

module.exports = router;
