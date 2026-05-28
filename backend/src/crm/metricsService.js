'use strict';

/**
 * metricsService.js — Streak & Métricas Pessoais (Onda 1 - F6)
 *
 * Registra ações do vendedor no dia e calcula streak de dias produtivos.
 *
 * Tabelas:
 *   user_metrics_daily — colunas: messages_sent, followups_done, hot_recovery_total,
 *                                  leads_created, deals_closed, leads_resgatados
 *   user_streaks       — current_streak, longest_streak, last_active_date
 */

const db = require('../database');

/* ─── Campos válidos para incremento ─────────────────────────────────────── */
const VALID_FIELDS = new Set([
  'messages_sent', 'followups_done', 'hot_recovery_total',
  'leads_created', 'deals_closed', 'leads_resgatados',
]);

/* ─── Incrementa uma métrica do dia ──────────────────────────────────────── */
function increment(userId, field, by = 1) {
  if (!VALID_FIELDS.has(field)) {
    console.warn(`[Metrics] Campo inválido: ${field}`);
    return;
  }
  const today = new Date().toISOString().slice(0, 10);
  try {
    db.prepare(`
      INSERT INTO user_metrics_daily (user_id, org_id, metric_date, ${field})
      VALUES (?, 1, ?, ?)
      ON CONFLICT(user_id, metric_date)
      DO UPDATE SET ${field} = ${field} + excluded.${field}
    `).run(userId, today, by);

    updateStreak(userId, today);
  } catch (e) {
    console.warn(`[Metrics] Erro ao incrementar ${field} para user ${userId}:`, e.message);
  }
}

/* ─── Atualiza streak do usuário ─────────────────────────────────────────── */
function updateStreak(userId, today) {
  try {
    const streak = db.prepare('SELECT * FROM user_streaks WHERE user_id = ?').get(userId);

    if (!streak) {
      db.prepare(`
        INSERT INTO user_streaks (user_id, current_streak, longest_streak, last_active_date)
        VALUES (?, 1, 1, ?)
      `).run(userId, today);
      return;
    }

    if (streak.last_active_date === today) return; // já atualizado hoje

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yStr = yesterday.toISOString().slice(0, 10);

    const wasActiveYesterday = streak.last_active_date === yStr;
    const newStreak  = wasActiveYesterday ? streak.current_streak + 1 : 1;
    const newLongest = Math.max(streak.longest_streak || 0, newStreak);

    db.prepare(`
      UPDATE user_streaks
      SET current_streak = ?, longest_streak = ?, last_active_date = ?, last_increment_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `).run(newStreak, newLongest, today, userId);
  } catch (e) {
    console.warn(`[Metrics] Erro ao atualizar streak user ${userId}:`, e.message);
  }
}

/* ─── Retorna métricas pessoais ────────────────────────────────────────────  */
function getPersonalMetrics(userId) {
  const today      = new Date().toISOString().slice(0, 10);
  const weekAgo    = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const monthStart = today.slice(0, 8) + '01';

  const todayRow = db.prepare(
    'SELECT * FROM user_metrics_daily WHERE user_id = ? AND metric_date = ?'
  ).get(userId, today) || {};

  const weekRows = db.prepare(
    'SELECT * FROM user_metrics_daily WHERE user_id = ? AND metric_date >= ? ORDER BY metric_date ASC'
  ).all(userId, weekAgo);

  const monthRow = db.prepare(`
    SELECT
      COALESCE(SUM(messages_sent),     0) AS messages_sent,
      COALESCE(SUM(followups_done),    0) AS followups_done,
      COALESCE(SUM(hot_recovery_total),0) AS hot_recoveries,
      COALESCE(SUM(leads_created),     0) AS leads_created,
      COALESCE(SUM(deals_closed),      0) AS deals_closed,
      COALESCE(SUM(leads_resgatados),  0) AS leads_resgatados
    FROM user_metrics_daily WHERE user_id = ? AND metric_date >= ?
  `).get(userId, monthStart) || {};

  const streak = db.prepare('SELECT * FROM user_streaks WHERE user_id = ?').get(userId) || {
    current_streak: 0, longest_streak: 0, last_active_date: null,
  };

  // Pipeline summary
  const pipeline = db.prepare(`
    SELECT
      COUNT(*) FILTER (WHERE stage NOT IN ('fechado','perdido'))                   AS active,
      COUNT(*) FILTER (WHERE stage = 'fechado' AND DATE(stage_changed_at) >= ?)   AS closed_month,
      COUNT(*) FILTER (WHERE stage = 'perdido' AND DATE(stage_changed_at) >= ?)   AS lost_month
    FROM crm_leads WHERE user_id = ?
  `).get(monthStart, monthStart, userId) || {};

  return {
    today: {
      messages_sent:   todayRow.messages_sent   || 0,
      followups_done:  todayRow.followups_done  || 0,
      hot_recoveries:  todayRow.hot_recovery_total || 0,
    },
    week: {
      messages_sent:   weekRows.reduce((s, r) => s + (r.messages_sent   || 0), 0),
      followups_done:  weekRows.reduce((s, r) => s + (r.followups_done  || 0), 0),
      hot_recoveries:  weekRows.reduce((s, r) => s + (r.hot_recovery_total || 0), 0),
      days_active:     weekRows.filter(r => (r.messages_sent || 0) + (r.followups_done || 0) > 0).length,
    },
    month: {
      messages_sent:   monthRow.messages_sent   || 0,
      followups_done:  monthRow.followups_done  || 0,
      hot_recoveries:  monthRow.hot_recoveries  || 0,
      leads_created:   monthRow.leads_created   || 0,
      deals_closed:    monthRow.deals_closed    || 0,
      leads_resgatados: monthRow.leads_resgatados || 0,
    },
    pipeline: {
      active:       pipeline.active       || 0,
      closed_month: pipeline.closed_month || 0,
      lost_month:   pipeline.lost_month   || 0,
    },
    streak: {
      current:     streak.current_streak  || 0,
      longest:     streak.longest_streak  || 0,
      last_active: streak.last_active_date,
    },
    chart: weekRows.map(r => ({
      date:          r.metric_date,
      messages_sent: r.messages_sent  || 0,
      followups_done: r.followups_done || 0,
    })),
  };
}

module.exports = { increment, updateStreak, getPersonalMetrics };
