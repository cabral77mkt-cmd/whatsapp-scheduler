/**
 * GET /api/dashboard/home — painel comercial unificado
 * Retorna todos os dados necessários para a página inicial em uma única chamada.
 * O vendedor vê seus próprios dados; admin vê resumo global + seus próprios dados.
 */
const express = require('express');
const router  = express.Router();
const db      = require('../database');
const metricsService = require('../crm/metricsService');

const STAGE_LABELS = {
  entrou_contato:      'Entrou Contato',
  conversando:         'Conversando',
  diagnostico:         'Diagnóstico',
  reuniao_agendada:    'Reunião Agendada',
  reuniao_realizada:   'Reunião Realizada',
  aguardando_proposta: 'Aguard. Proposta',
  proposta_enviada:    'Proposta Enviada',
  analisando_proposta: 'Analisando',
  negociacao:          'Negociação',
  fechado:             'Fechado',
  perdido:             'Perdido',
};

router.get('/home', (req, res) => {
  const userId   = Number(req.user.sub);
  const isAdmin  = !!req.user.isAdmin;
  const now      = new Date();
  const today    = now.toISOString().split('T')[0];
  const month    = now.getMonth() + 1;
  const year     = now.getFullYear();
  const monthStr = `${year}-${String(month).padStart(2, '0')}`;

  /* ── KPIs do usuário ──────────────────────────────────── */
  const activeLeads = db.prepare(`
    SELECT COUNT(*) AS c FROM crm_leads
    WHERE user_id = ? AND stage NOT IN ('fechado','perdido')
  `).get(userId).c;

  const closedMonth = db.prepare(`
    SELECT COUNT(*) AS deals, COALESCE(SUM(closed_value),0) AS revenue
    FROM crm_leads
    WHERE user_id = ? AND stage = 'fechado'
      AND strftime('%Y-%m', stage_changed_at) = ?
  `).get(userId, monthStr);

  const todayMeetingsCount = db.prepare(`
    SELECT COUNT(*) AS c FROM crm_meetings m
    JOIN crm_leads l ON l.id = m.lead_id
    WHERE l.user_id = ? AND date(m.meeting_at) = ?
  `).get(userId, today).c;

  const staleCount = db.prepare(`
    SELECT COUNT(*) AS c FROM crm_leads
    WHERE user_id = ? AND stage NOT IN ('fechado','perdido')
      AND (last_interaction_at IS NULL OR last_interaction_at < datetime('now','-7 days'))
  `).get(userId).c;

  const goal = db.prepare(`
    SELECT target_revenue, target_deals, target_meetings
    FROM crm_goals
    WHERE assignee_user_id = ? AND period_month = ? AND period_year = ?
  `).get(userId, month, year);

  /* ── Agenda de hoje ───────────────────────────────────── */
  const todayMeetingsList = db.prepare(`
    SELECT 'meeting' AS type, m.id, m.meeting_at AS scheduled_at,
           l.name AS lead_name, l.id AS lead_id,
           COALESCE(m.notes, m.link, '') AS description
    FROM crm_meetings m
    JOIN crm_leads l ON l.id = m.lead_id
    WHERE l.user_id = ? AND date(m.meeting_at) = ?
    ORDER BY m.meeting_at ASC
    LIMIT 10
  `).all(userId, today);

  const todayFollowups = db.prepare(`
    SELECT 'followup' AS type, f.id, f.scheduled_at,
           l.name AS lead_name, l.id AS lead_id,
           SUBSTR(f.message, 1, 80) AS description
    FROM crm_followups f
    JOIN crm_leads l ON l.id = f.lead_id
    WHERE l.user_id = ? AND date(f.scheduled_at) = ? AND f.status = 'pending'
    ORDER BY f.scheduled_at ASC
    LIMIT 10
  `).all(userId, today);

  const agenda = [...todayMeetingsList, ...todayFollowups]
    .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));

  /* ── Pipeline mini ────────────────────────────────────── */
  const pipelineRows = db.prepare(`
    SELECT stage, COUNT(*) AS count, COALESCE(SUM(potential_value),0) AS total_value
    FROM crm_leads
    WHERE user_id = ? AND stage NOT IN ('fechado','perdido')
    GROUP BY stage
  `).all(userId);

  const pipeline = pipelineRows.map(r => ({
    stage: r.stage,
    label: STAGE_LABELS[r.stage] || r.stage,
    count: r.count,
    total_value: r.total_value,
  }));

  /* ── IA: top 5 leads prioritizados ────────────────────── */
  const aiLeads = db.prepare(`
    SELECT l.id, l.name, l.phone, l.stage, l.temperature,
           a.score, a.next_step_text, a.next_step_action, a.score_reason
    FROM crm_leads l
    JOIN crm_lead_ai a ON a.lead_id = l.id
    WHERE l.user_id = ? AND l.stage NOT IN ('fechado','perdido') AND a.score > 0
    ORDER BY a.score DESC
    LIMIT 5
  `).all(userId);

  /* ── WA status ────────────────────────────────────────── */
  let waStatus = 'disconnected';
  try { waStatus = require('../whatsapp/client').getStatus(userId); } catch {}

  /* ── Admin extra: global KPIs ─────────────────────────── */
  let globalKpis = null;
  if (isAdmin) {
    const globalClosed = db.prepare(`
      SELECT COUNT(*) AS deals, COALESCE(SUM(closed_value),0) AS revenue
      FROM crm_leads WHERE stage='fechado' AND strftime('%Y-%m', stage_changed_at) = ?
    `).get(monthStr);
    const globalActive = db.prepare(`
      SELECT COUNT(*) AS c FROM crm_leads WHERE stage NOT IN ('fechado','perdido')
    `).get().c;
    const teamCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
    globalKpis = {
      deals: globalClosed.deals,
      revenue: globalClosed.revenue,
      active_leads: globalActive,
      team_count: teamCount,
    };
  }

  /* ── F6: Métricas pessoais & Streak ───────────────────────── */
  let personalMetrics = null;
  try { personalMetrics = metricsService.getPersonalMetrics(userId); } catch {}

  res.json({
    kpis: {
      active_leads:     activeLeads,
      deals_closed:     closedMonth.deals,
      revenue:          closedMonth.revenue,
      target_revenue:   goal?.target_revenue  || 0,
      target_deals:     goal?.target_deals    || 0,
      target_meetings:  goal?.target_meetings || 0,
      today_meetings:   todayMeetingsCount,
      stale_count:      staleCount,
      pct_revenue: goal?.target_revenue > 0
        ? Math.round((closedMonth.revenue / goal.target_revenue) * 100)
        : null,
    },
    agenda,
    pipeline,
    ai_leads: aiLeads,
    wa_status: waStatus,
    global_kpis: globalKpis,
    personal_metrics: personalMetrics,
    period: monthStr,
  });
});

// GET /api/dashboard/metrics — métricas pessoais standalone
router.get('/metrics', (req, res) => {
  const userId = Number(req.user.sub);
  try {
    res.json(metricsService.getPersonalMetrics(userId));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
