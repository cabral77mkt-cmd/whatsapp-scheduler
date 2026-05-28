'use strict';

/**
 * crm_analytics.js — Onda 8: Analytics de Pipeline
 *
 * Endpoints (todos autenticados):
 *   GET /funnel          — leads por estágio + taxa de conversão
 *   GET /velocity        — tempo médio por estágio + ciclo total
 *   GET /lost-reasons    — breakdown de motivos de perda
 *   GET /sources         — leads por origem + taxa de conversão
 *   GET /trends          — criados/fechados/perdidos por mês (últimos 6)
 *   GET /summary         — KPIs rápidos para o dashboard
 */

const express = require('express');
const router  = express.Router();
const db      = require('../database');

const STAGE_ORDER = [
  'entrou_contato',
  'qualificado',
  'proposta',
  'negociacao',
  'fechado',
];

const STAGE_LABELS = {
  entrou_contato: 'Entrou em Contato',
  qualificado:    'Qualificado',
  proposta:       'Proposta',
  negociacao:     'Negociação',
  fechado:        'Fechado',
  perdido:        'Perdido',
};

const SOURCE_LABELS = {
  whatsapp_dm: 'WhatsApp DM',
  tickfy:      'Tickfy',
  csv_import:  'Importação CSV',
  manual:      'Manual',
  outbound:    'Campanha Outbound',
};

/* ── GET /funnel ─────────────────────────────────────────────────────── */
router.get('/funnel', (req, res) => {
  const userId = Number(req.user.sub);
  const { period } = req.query; // opcional: 'YYYY-MM' para filtrar por mês de criação

  let dateFilter = '';
  const params = [userId];
  if (period) {
    const [y, m] = period.split('-').map(Number);
    const nextMonth = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
    dateFilter = ' AND first_contact_at >= ? AND first_contact_at < ?';
    params.push(period + '-01', nextMonth);
  }

  const rows = db.prepare(`
    SELECT stage, COUNT(*) AS count
    FROM crm_leads
    WHERE user_id = ? ${dateFilter}
    GROUP BY stage
  `).all(...params);

  const byStage = Object.fromEntries(rows.map(r => [r.stage, r.count]));
  const total   = rows.reduce((s, r) => s + r.count, 0);

  // Funil ordenado (só estágios activos — excluindo 'perdido' do funil principal)
  const funnel = STAGE_ORDER.map((stage, i) => {
    const count = byStage[stage] || 0;
    const prev  = i === 0 ? (byStage['entrou_contato'] || count) : (byStage[STAGE_ORDER[i - 1]] || 1);
    return {
      stage,
      label:          STAGE_LABELS[stage] || stage,
      count,
      pct_of_total:   total > 0 ? Math.round((count / total) * 100) : 0,
      conversion_from_prev: i === 0 || prev === 0 ? null : Math.round((count / prev) * 100),
    };
  });

  const lost = byStage['perdido'] || 0;

  res.json({ funnel, total, lost });
});

/* ── GET /velocity ───────────────────────────────────────────────────── */
router.get('/velocity', (req, res) => {
  const userId = Number(req.user.sub);

  // Tempo médio (dias) de first_contact → stage_changed para leads fechados
  const avgCycle = db.prepare(`
    SELECT AVG(
      CAST(julianday(stage_changed_at) - julianday(first_contact_at) AS REAL)
    ) AS avg_days
    FROM crm_leads
    WHERE user_id = ? AND stage = 'fechado'
      AND first_contact_at IS NOT NULL AND stage_changed_at IS NOT NULL
  `).get(userId)?.avg_days;

  // Distribuição de tempo até fechamento (buckets)
  const buckets = db.prepare(`
    SELECT
      CASE
        WHEN julianday(stage_changed_at) - julianday(first_contact_at) < 1  THEN '< 1 dia'
        WHEN julianday(stage_changed_at) - julianday(first_contact_at) < 7  THEN '1–7 dias'
        WHEN julianday(stage_changed_at) - julianday(first_contact_at) < 30 THEN '1–4 semanas'
        WHEN julianday(stage_changed_at) - julianday(first_contact_at) < 90 THEN '1–3 meses'
        ELSE '3+ meses'
      END AS bucket,
      COUNT(*) AS count
    FROM crm_leads
    WHERE user_id = ? AND stage = 'fechado'
      AND first_contact_at IS NOT NULL AND stage_changed_at IS NOT NULL
    GROUP BY bucket
  `).all(userId);

  // Leads ativos mais antigos (parados há mais tempo)
  const stale = db.prepare(`
    SELECT id, name, phone, stage, last_interaction_at,
      CAST(julianday('now') - julianday(COALESCE(last_interaction_at, first_contact_at)) AS INTEGER) AS days_idle
    FROM crm_leads
    WHERE user_id = ? AND stage NOT IN ('fechado','perdido')
    ORDER BY days_idle DESC
    LIMIT 10
  `).all(userId);

  res.json({
    avg_cycle_days:  avgCycle ? Math.round(avgCycle) : null,
    buckets,
    most_stale: stale,
  });
});

/* ── GET /lost-reasons ───────────────────────────────────────────────── */
router.get('/lost-reasons', (req, res) => {
  const userId = Number(req.user.sub);
  const { months = 6 } = req.query;
  const since = new Date();
  since.setMonth(since.getMonth() - Number(months));

  const reasons = db.prepare(`
    SELECT
      COALESCE(loss_reason, 'Não informado') AS reason,
      COUNT(*) AS count
    FROM crm_leads
    WHERE user_id = ?
      AND stage = 'perdido'
      AND stage_changed_at >= ?
    GROUP BY loss_reason
    ORDER BY count DESC
    LIMIT 15
  `).all(userId, since.toISOString());

  const total = reasons.reduce((s, r) => s + r.count, 0);
  const enriched = reasons.map(r => ({
    ...r,
    pct: total > 0 ? Math.round((r.count / total) * 100) : 0,
  }));

  res.json({ reasons: enriched, total });
});

/* ── GET /sources ────────────────────────────────────────────────────── */
router.get('/sources', (req, res) => {
  const userId = Number(req.user.sub);

  const rows = db.prepare(`
    SELECT
      COALESCE(source, 'manual') AS source,
      COUNT(*) AS total,
      SUM(CASE WHEN stage = 'fechado' THEN 1 ELSE 0 END) AS closed,
      SUM(CASE WHEN stage = 'perdido' THEN 1 ELSE 0 END) AS lost,
      COALESCE(SUM(CASE WHEN stage = 'fechado' THEN closed_value ELSE 0 END), 0) AS revenue
    FROM crm_leads
    WHERE user_id = ?
    GROUP BY COALESCE(source, 'manual')
    ORDER BY total DESC
  `).all(userId);

  const enriched = rows.map(r => ({
    ...r,
    label:           SOURCE_LABELS[r.source] || r.source,
    conversion_rate: r.total > 0 ? Math.round((r.closed / r.total) * 100) : 0,
  }));

  res.json(enriched);
});

/* ── GET /trends ─────────────────────────────────────────────────────── */
router.get('/trends', (req, res) => {
  const userId = Number(req.user.sub);
  const { months = 6 } = req.query;

  const since = new Date();
  since.setMonth(since.getMonth() - Number(months) + 1);
  since.setDate(1);
  const sinceStr = since.toISOString().slice(0, 10);

  // Leads criados por mês
  const created = db.prepare(`
    SELECT STRFTIME('%Y-%m', first_contact_at) AS month, COUNT(*) AS count
    FROM crm_leads WHERE user_id = ? AND first_contact_at >= ?
    GROUP BY month ORDER BY month
  `).all(userId, sinceStr);

  // Leads fechados por mês
  const closed = db.prepare(`
    SELECT STRFTIME('%Y-%m', stage_changed_at) AS month, COUNT(*) AS count,
           COALESCE(SUM(closed_value), 0) AS revenue
    FROM crm_leads WHERE user_id = ? AND stage = 'fechado' AND stage_changed_at >= ?
    GROUP BY month ORDER BY month
  `).all(userId, sinceStr);

  // Leads perdidos por mês
  const lost = db.prepare(`
    SELECT STRFTIME('%Y-%m', stage_changed_at) AS month, COUNT(*) AS count
    FROM crm_leads WHERE user_id = ? AND stage = 'perdido' AND stage_changed_at >= ?
    GROUP BY month ORDER BY month
  `).all(userId, sinceStr);

  // Merge em array por mês
  const allMonths = [...new Set([
    ...created.map(r => r.month),
    ...closed.map(r => r.month),
    ...lost.map(r => r.month),
  ])].sort();

  const createdMap = Object.fromEntries(created.map(r => [r.month, r.count]));
  const closedMap  = Object.fromEntries(closed.map(r => [r.month, { count: r.count, revenue: r.revenue }]));
  const lostMap    = Object.fromEntries(lost.map(r => [r.month, r.count]));

  const trends = allMonths.map(m => ({
    month:   m,
    created: createdMap[m]        || 0,
    closed:  closedMap[m]?.count  || 0,
    lost:    lostMap[m]           || 0,
    revenue: closedMap[m]?.revenue || 0,
  }));

  res.json(trends);
});

/* ── GET /summary — KPIs rápidos ─────────────────────────────────────── */
router.get('/summary', (req, res) => {
  const userId = Number(req.user.sub);
  const monthStart = new Date().toISOString().slice(0, 8) + '01';
  const prevMonthStart = (() => {
    const d = new Date(); d.setMonth(d.getMonth() - 1); d.setDate(1);
    return d.toISOString().slice(0, 10);
  })();

  const thisMonth = db.prepare(`
    SELECT
      COUNT(*)                                                           AS leads_created,
      SUM(CASE WHEN stage = 'fechado' THEN 1 ELSE 0 END)                AS deals_closed,
      SUM(CASE WHEN stage = 'perdido' THEN 1 ELSE 0 END)                AS deals_lost,
      COALESCE(SUM(CASE WHEN stage = 'fechado' THEN closed_value END),0) AS revenue
    FROM crm_leads WHERE user_id = ? AND first_contact_at >= ?
  `).get(userId, monthStart);

  const prevMonth = db.prepare(`
    SELECT
      COUNT(*)                                                           AS leads_created,
      SUM(CASE WHEN stage = 'fechado' THEN 1 ELSE 0 END)                AS deals_closed,
      COALESCE(SUM(CASE WHEN stage = 'fechado' THEN closed_value END),0) AS revenue
    FROM crm_leads WHERE user_id = ?
      AND first_contact_at >= ? AND first_contact_at < ?
  `).get(userId, prevMonthStart, monthStart);

  const active = db.prepare(`
    SELECT COUNT(*) AS c FROM crm_leads
    WHERE user_id = ? AND stage NOT IN ('fechado','perdido')
  `).get(userId)?.c || 0;

  const avgDeal = db.prepare(`
    SELECT AVG(closed_value) AS avg FROM crm_leads
    WHERE user_id = ? AND stage = 'fechado' AND closed_value > 0
      AND stage_changed_at >= ?
  `).get(userId, monthStart)?.avg || 0;

  function delta(curr, prev) {
    if (!prev || prev === 0) return null;
    return Math.round(((curr - prev) / prev) * 100);
  }

  res.json({
    this_month: thisMonth,
    prev_month: prevMonth,
    active_leads: active,
    avg_deal_value: Math.round(avgDeal),
    deltas: {
      leads_created: delta(thisMonth.leads_created, prevMonth.leads_created),
      deals_closed:  delta(thisMonth.deals_closed,  prevMonth.deals_closed),
      revenue:       delta(thisMonth.revenue,        prevMonth.revenue),
    },
  });
});

module.exports = router;
