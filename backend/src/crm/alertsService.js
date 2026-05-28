'use strict';

/**
 * alertsService.js — Onda 7: Geração de alertas inteligentes
 *
 * Gera alertas proativos para cada usuário:
 *   - Leads frios (sem interação > 3 dias)
 *   - Follow-ups vencidos
 *   - Meta em risco (progresso < 50% a menos de 30% do mês restante)
 *   - Leads quentes sem contato hoje
 *   - Propostas vencendo em 2 dias
 */

const db = require('../database');

/**
 * Insere alerta evitando duplicatas recentes (mesmo tipo + entidade nas últimas 24h).
 */
function insertAlert(userId, { type, title, body, entity_type, entity_id, priority = 'normal' }) {
  try {
    const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const dup = db.prepare(`
      SELECT id FROM crm_alerts
      WHERE user_id = ? AND type = ?
        AND (entity_id IS NULL OR entity_id = ?)
        AND dismissed_at IS NULL
        AND created_at >= ?
    `).get(userId, type, entity_id ?? null, cutoff);
    if (dup) return; // já existe alerta recente do mesmo tipo para esta entidade

    db.prepare(`
      INSERT INTO crm_alerts (user_id, type, title, body, entity_type, entity_id, priority)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(userId, type, title, body ?? null, entity_type ?? null, entity_id ?? null, priority);
  } catch (e) {
    console.warn('[Alerts] Erro ao inserir:', e.message);
  }
}

/**
 * generateAlertsForUser(userId) — roda uma vez por dia (ou sob demanda).
 * Retorna a contagem de alertas gerados.
 */
function generateAlertsForUser(userId) {
  let count = 0;
  const now  = new Date();
  const today = now.toISOString().split('T')[0];

  // ── 1. Leads frios (sem interação há mais de 3 dias, ativos) ──────────
  const COLD_DAYS = 3;
  const coldThreshold = new Date(Date.now() - COLD_DAYS * 86400000).toISOString();
  const coldLeads = db.prepare(`
    SELECT id, name, phone, last_interaction_at FROM crm_leads
    WHERE user_id = ?
      AND stage NOT IN ('fechado','perdido')
      AND (last_interaction_at IS NULL OR last_interaction_at < ?)
    LIMIT 10
  `).all(userId, coldThreshold);

  for (const lead of coldLeads) {
    const daysAgo = lead.last_interaction_at
      ? Math.floor((Date.now() - new Date(lead.last_interaction_at).getTime()) / 86400000)
      : null;
    const label = daysAgo !== null ? `${daysAgo}d sem contato` : 'sem contato registrado';
    insertAlert(userId, {
      type:        'cold_lead',
      title:       `❄️ Lead frio: ${lead.name || lead.phone}`,
      body:        `${label} — considere retomar o contato.`,
      entity_type: 'lead',
      entity_id:   lead.id,
      priority:    daysAgo >= 7 ? 'high' : 'normal',
    });
    count++;
  }

  // ── 2. Follow-ups vencidos (ainda pending, já passou a hora) ──────────
  const overdueFollowups = db.prepare(`
    SELECT f.id, f.message, l.name AS lead_name, l.phone
    FROM crm_followups f
    JOIN crm_leads l ON l.id = f.lead_id
    WHERE f.user_id = ?
      AND f.status = 'pending'
      AND f.scheduled_at < ?
    LIMIT 10
  `).all(userId, now.toISOString());

  for (const fu of overdueFollowups) {
    insertAlert(userId, {
      type:        'followup_overdue',
      title:       `⏰ Follow-up atrasado: ${fu.lead_name || fu.phone}`,
      body:        fu.message?.slice(0, 100) || 'Follow-up pendente',
      entity_type: 'followup',
      entity_id:   fu.id,
      priority:    'high',
    });
    count++;
  }

  // ── 3. Leads quentes sem contato hoje ────────────────────────────────
  const hotWithoutContact = db.prepare(`
    SELECT l.id, l.name, l.phone FROM crm_leads l
    WHERE l.user_id = ?
      AND l.temperature = 'quente'
      AND l.stage NOT IN ('fechado','perdido')
      AND NOT EXISTS (
        SELECT 1 FROM crm_message_log m
        WHERE m.lead_id = l.id AND m.direction = 'out'
          AND DATE(m.occurred_at) = ?
      )
    LIMIT 5
  `).all(userId, today);

  for (const lead of hotWithoutContact) {
    insertAlert(userId, {
      type:        'hot_no_contact',
      title:       `🔥 Lead quente sem contato hoje: ${lead.name || lead.phone}`,
      body:        'Lead quente que ainda não foi contactado hoje.',
      entity_type: 'lead',
      entity_id:   lead.id,
      priority:    'high',
    });
    count++;
  }

  // ── 4. Propostas vencendo em até 2 dias ──────────────────────────────
  const soonDue = new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0];
  const expiringProposals = db.prepare(`
    SELECT p.id, p.amount, p.due_date, l.name AS lead_name
    FROM crm_proposals p
    JOIN crm_leads l ON l.id = p.lead_id
    WHERE l.user_id = ?
      AND p.status IN ('pending','sent')
      AND p.due_date IS NOT NULL
      AND p.due_date <= ?
      AND p.due_date >= ?
      AND l.stage NOT IN ('fechado','perdido')
    LIMIT 5
  `).all(userId, soonDue, today);

  for (const prop of expiringProposals) {
    const valor = prop.amount
      ? `R$ ${Number(prop.amount).toFixed(2).replace('.', ',')}`
      : '';
    insertAlert(userId, {
      type:        'proposal_expiring',
      title:       `📋 Proposta vencendo: ${prop.lead_name}`,
      body:        `${valor ? valor + ' — ' : ''}vence em ${new Date(prop.due_date + 'T12:00:00').toLocaleDateString('pt-BR')}`,
      entity_type: 'proposal',
      entity_id:   prop.id,
      priority:    'high',
    });
    count++;
  }

  // ── 5. Meta em risco ──────────────────────────────────────────────────
  const period = today.slice(0, 7); // 'YYYY-MM'
  const goal = db.prepare(`
    SELECT * FROM crm_personal_goals WHERE user_id = ? AND period = ?
  `).get(userId, period);

  if (goal && goal.target_revenue > 0) {
    const daysInMonth  = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const dayOfMonth   = now.getDate();
    const monthPctDone = dayOfMonth / daysInMonth;

    // Valor fechado no mês (leads com closed_value)
    const closed = db.prepare(`
      SELECT COALESCE(SUM(closed_value), 0) AS total
      FROM crm_leads
      WHERE user_id = ? AND stage = 'fechado'
        AND DATE(stage_changed_at) >= ?
    `).get(userId, period + '-01')?.total || 0;

    const goalPct = closed / goal.target_revenue;

    // Alerta se: progresso < 50% do esperado E já passou 70% do mês
    if (monthPctDone >= 0.7 && goalPct < 0.5) {
      const faltam = goal.target_revenue - closed;
      insertAlert(userId, {
        type:        'goal_at_risk',
        title:       '🎯 Meta em risco!',
        body:        `Você atingiu ${Math.round(goalPct * 100)}% da meta. Faltam R$ ${faltam.toFixed(2).replace('.', ',')} em ${daysInMonth - dayOfMonth} dias.`,
        entity_type: 'goal',
        entity_id:   goal.id,
        priority:    'urgent',
      });
      count++;
    }

    // Alerta positivo: meta batida!
    if (goalPct >= 1) {
      insertAlert(userId, {
        type:        'goal_achieved',
        title:       '🏆 Meta atingida!',
        body:        `Parabéns! Você bateu a meta de R$ ${goal.target_revenue.toFixed(2).replace('.', ',')} este mês!`,
        priority:    'normal',
      });
      count++;
    }
  }

  if (count > 0) {
    console.log(`[Alerts] ${count} alerta(s) gerado(s) para user #${userId}`);
  }
  return count;
}

/**
 * generateAlertsForAll() — roda via cron para todos os usuários.
 */
function generateAlertsForAll() {
  try {
    const users = db.prepare('SELECT id FROM users').all();
    let total = 0;
    for (const u of users) {
      total += generateAlertsForUser(u.id);
    }
    if (total > 0) console.log(`[Alerts] Total gerado: ${total} alertas`);
  } catch (e) {
    console.error('[Alerts] Erro em generateAlertsForAll:', e.message);
  }
}

/**
 * getUnread(userId) — alertas não lidos e não descartados (últimos 7 dias).
 */
function getUnread(userId) {
  return db.prepare(`
    SELECT * FROM crm_alerts
    WHERE user_id = ?
      AND dismissed_at IS NULL
      AND created_at >= datetime('now', '-7 days')
    ORDER BY
      CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
      created_at DESC
    LIMIT 30
  `).all(userId);
}

module.exports = { generateAlertsForUser, generateAlertsForAll, getUnread, insertAlert };
