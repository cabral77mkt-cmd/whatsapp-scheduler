const express = require('express');
const router = express.Router();
const db = require('../database');
const { VALID_STAGES } = require('../crm/leadService');

/* ── Helpers ─────────────────────────────────────────────── */
function periodParam(req) {
  const now = new Date();
  const month = Number(req.query.month) || (now.getMonth() + 1);
  const year  = Number(req.query.year)  || now.getFullYear();
  const padM  = String(month).padStart(2, '0');
  return { month, year, periodStr: `${year}-${padM}` };
}

/* ── GET /overview — KPIs globais do mês ─────────────────── */
router.get('/overview', (req, res) => {
  const { periodStr, month, year } = periodParam(req);

  const activeLeads = db.prepare(`
    SELECT COUNT(*) AS c FROM crm_leads
    WHERE stage NOT IN ('fechado','perdido')
  `).get().c;

  const closed = db.prepare(`
    SELECT COUNT(*) AS deals, COALESCE(SUM(closed_value),0) AS revenue
    FROM crm_leads
    WHERE stage = 'fechado'
      AND strftime('%Y-%m', stage_changed_at) = ?
  `).get(periodStr);

  const prevPeriod = (() => {
    const d = new Date(year, month - 2, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  })();

  const prevClosed = db.prepare(`
    SELECT COUNT(*) AS deals, COALESCE(SUM(closed_value),0) AS revenue
    FROM crm_leads
    WHERE stage = 'fechado'
      AND strftime('%Y-%m', stage_changed_at) = ?
  `).get(prevPeriod);

  const meetings = db.prepare(`
    SELECT COUNT(*) AS c FROM crm_meetings
    WHERE strftime('%Y-%m', meeting_at) = ?
  `).get(periodStr).c;

  const staleCount = db.prepare(`
    SELECT COUNT(*) AS c FROM crm_leads
    WHERE stage NOT IN ('fechado','perdido')
      AND (last_interaction_at IS NULL OR last_interaction_at < datetime('now','-7 days'))
  `).get().c;

  // Forecast: propostas abertas × probabilidade por estágio
  const STAGE_PROB = {
    negociacao: 0.70, analisando_proposta: 0.50,
    proposta_enviada: 0.30, aguardando_proposta: 0.15,
  };
  const proposals = db.prepare(`
    SELECT p.amount, p.negotiated_amount, l.stage
    FROM crm_proposals p
    JOIN crm_leads l ON l.id = p.lead_id
    WHERE p.status IN ('pending','sent') AND l.stage NOT IN ('fechado','perdido')
  `).all();

  const forecast = proposals.reduce((sum, p) => {
    const val = p.negotiated_amount || p.amount || 0;
    const prob = STAGE_PROB[p.stage] || 0.10;
    return sum + val * prob;
  }, 0);

  res.json({
    active_leads: activeLeads,
    deals_closed: closed.deals,
    revenue: closed.revenue,
    prev_deals: prevClosed.deals,
    prev_revenue: prevClosed.revenue,
    meetings,
    stale_count: staleCount,
    forecast,
    period: periodStr,
  });
});

/* ── GET /ranking — ranking por receita no mês ───────────── */
router.get('/ranking', (req, res) => {
  const { periodStr, month, year } = periodParam(req);

  const users = db.prepare(`
    SELECT id, username, COALESCE(display_name, username) AS name
    FROM users ORDER BY name
  `).all();

  const goals = db.prepare(`
    SELECT * FROM crm_goals WHERE period_month = ? AND period_year = ?
  `).all(month, year);
  const goalMap = Object.fromEntries(goals.map((g) => [g.assignee_user_id, g]));

  const ranking = users.map((u) => {
    const closed = db.prepare(`
      SELECT COUNT(*) AS deals, COALESCE(SUM(closed_value),0) AS revenue
      FROM crm_leads
      WHERE user_id = ? AND stage = 'fechado'
        AND strftime('%Y-%m', stage_changed_at) = ?
    `).get(u.id, periodStr);

    const activeLeads = db.prepare(`
      SELECT COUNT(*) AS c FROM crm_leads
      WHERE user_id = ? AND stage NOT IN ('fechado','perdido')
    `).get(u.id).c;

    const meetings = db.prepare(`
      SELECT COUNT(*) AS c FROM crm_meetings m
      JOIN crm_leads l ON l.id = m.lead_id
      WHERE l.user_id = ? AND strftime('%Y-%m', m.meeting_at) = ?
    `).get(u.id, periodStr).c;

    const goal = goalMap[u.id] || null;

    return {
      id: u.id,
      name: u.name,
      deals_closed: closed.deals,
      revenue: closed.revenue,
      active_leads: activeLeads,
      meetings,
      target_revenue: goal?.target_revenue || 0,
      target_deals: goal?.target_deals || 0,
      target_meetings: goal?.target_meetings || 0,
      pct_revenue: goal?.target_revenue > 0 ? Math.round((closed.revenue / goal.target_revenue) * 100) : null,
    };
  });

  ranking.sort((a, b) => b.revenue - a.revenue);
  res.json(ranking);
});

/* ── GET /forecast — propostas abertas com probabilidade ─── */
router.get('/forecast', (req, res) => {
  const STAGE_PROB = {
    negociacao: 0.70, analisando_proposta: 0.50,
    proposta_enviada: 0.30, aguardando_proposta: 0.15,
  };

  const rows = db.prepare(`
    SELECT p.id, p.amount, p.negotiated_amount, p.due_date, p.status,
           l.id AS lead_id, l.name AS lead_name, l.phone, l.stage,
           COALESCE(u.display_name, u.username) AS seller
    FROM crm_proposals p
    JOIN crm_leads l ON l.id = p.lead_id
    LEFT JOIN users u ON u.id = l.user_id
    WHERE p.status IN ('pending','sent') AND l.stage NOT IN ('fechado','perdido')
    ORDER BY p.due_date ASC NULLS LAST
    LIMIT 50
  `).all();

  const items = rows.map((r) => {
    const val = r.negotiated_amount || r.amount || 0;
    const prob = STAGE_PROB[r.stage] || 0.10;
    return { ...r, value: val, probability: Math.round(prob * 100), weighted: Math.round(val * prob) };
  });

  const total_weighted = items.reduce((s, i) => s + i.weighted, 0);
  res.json({ items, total_weighted });
});

/* ── GET /stale — leads parados >7 dias ──────────────────── */
router.get('/stale', (req, res) => {
  const days = Number(req.query.days) || 7;

  const leads = db.prepare(`
    SELECT l.id, l.name, l.phone, l.stage, l.temperature, l.last_interaction_at, l.potential_value,
           COALESCE(u.display_name, u.username) AS seller
    FROM crm_leads l
    LEFT JOIN users u ON u.id = l.user_id
    WHERE l.stage NOT IN ('fechado','perdido')
      AND (l.last_interaction_at IS NULL OR l.last_interaction_at < datetime('now','-${days} days'))
    ORDER BY l.last_interaction_at ASC NULLS FIRST
    LIMIT 50
  `).all();

  res.json(leads);
});

/* ── GET /funnel — contagem + valor por estágio (todos users) */
router.get('/funnel', (req, res) => {
  const rows = db.prepare(`
    SELECT stage, COUNT(*) AS count, COALESCE(SUM(potential_value),0) AS total_value
    FROM crm_leads
    WHERE stage NOT IN ('fechado','perdido')
    GROUP BY stage
  `).all();

  const byStage = {};
  for (const s of VALID_STAGES.filter((s) => !['fechado','perdido'].includes(s))) {
    byStage[s] = { count: 0, total_value: 0 };
  }
  for (const r of rows) byStage[r.stage] = { count: r.count, total_value: r.total_value };
  res.json(byStage);
});

/* ── GET /goals — metas do mês ───────────────────────────── */
router.get('/goals', (req, res) => {
  const { month, year } = periodParam(req);
  const goals = db.prepare(`
    SELECT g.*, COALESCE(u.display_name, u.username) AS assignee_name
    FROM crm_goals g
    JOIN users u ON u.id = g.assignee_user_id
    WHERE g.period_month = ? AND g.period_year = ?
  `).all(month, year);
  res.json(goals);
});

/* ── POST /goals — criar/atualizar meta ──────────────────── */
router.post('/goals', (req, res) => {
  const managerId = Number(req.user.sub);
  const { assignee_user_id, month, year, target_revenue, target_deals, target_meetings } = req.body;

  if (!assignee_user_id) return res.status(400).json({ error: 'assignee_user_id obrigatório' });

  const now = new Date();
  const m = Number(month) || (now.getMonth() + 1);
  const y = Number(year)  || now.getFullYear();

  db.prepare(`
    INSERT INTO crm_goals
      (assignee_user_id, manager_user_id, period_month, period_year, target_revenue, target_deals, target_meetings)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(assignee_user_id, period_month, period_year) DO UPDATE SET
      target_revenue  = excluded.target_revenue,
      target_deals    = excluded.target_deals,
      target_meetings = excluded.target_meetings,
      manager_user_id = excluded.manager_user_id
  `).run(assignee_user_id, managerId, m, y,
    Number(target_revenue) || 0,
    Number(target_deals) || 0,
    Number(target_meetings) || 0);

  res.json({ ok: true });
});

module.exports = router;
