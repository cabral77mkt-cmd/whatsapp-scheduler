'use strict';

/**
 * commissionService.js — Onda 5: Comissões por fechamento de negócio
 *
 * Quando um lead é marcado como 'fechado', calcula a comissão do vendedor
 * responsável e registra na tabela crm_commissions.
 *
 * Configuração de percentual:
 *   1. Busca config específica para o vendedor (crm_commission_config.user_id)
 *   2. Fallback: config global (user_id = 0)
 *   3. Fallback final: 0% (sem comissão)
 */

const db = require('../database');

/**
 * maybeCreateCommission(lead, closedValue)
 * lead: objeto com id, user_id, responsible_user_id, name
 * closedValue: valor do negócio fechado (número)
 */
function maybeCreateCommission(lead, closedValue) {
  try {
    const dealValue = parseFloat(closedValue);
    if (!dealValue || dealValue <= 0) return;

    // Vendedor responsável: responsible_user_id > user_id (dono do WA)
    const sellerId = lead.responsible_user_id || lead.user_id;
    if (!sellerId) return;

    // Busca percentual: config do vendedor → config global (0) → 0
    const cfg = db.prepare(`
      SELECT percentage, active FROM crm_commission_config
      WHERE user_id = ? AND active = 1
    `).get(sellerId)
      || db.prepare(`
      SELECT percentage, active FROM crm_commission_config
      WHERE user_id = 0 AND active = 1
    `).get();

    if (!cfg) return; // sem configuração = sem comissão

    const percentage      = parseFloat(cfg.percentage) || 0;
    if (percentage <= 0) return;

    const commissionValue = Math.round((dealValue * percentage / 100) * 100) / 100;

    db.prepare(`
      INSERT INTO crm_commissions
        (org_id, user_id, lead_id, deal_value, percentage, commission_value, status)
      VALUES (1, ?, ?, ?, ?, ?, 'pending')
    `).run(sellerId, lead.id, dealValue, percentage, commissionValue);

    console.log(`[Commission] 💰 R$${commissionValue.toFixed(2)} (${percentage}%) → user #${sellerId} — lead #${lead.id}`);
  } catch (e) {
    console.warn('[Commission] Erro:', e.message);
  }
}

/**
 * getSummary(userId) — resumo de comissões do vendedor
 */
function getSummary(userId) {
  const monthStart = new Date().toISOString().slice(0, 8) + '01';
  const yearStart  = new Date().getFullYear() + '-01-01';

  const totals = db.prepare(`
    SELECT
      SUM(CASE WHEN status = 'pending' THEN commission_value ELSE 0 END) AS pending,
      SUM(CASE WHEN status = 'paid'    THEN commission_value ELSE 0 END) AS paid,
      SUM(commission_value)                                               AS total,
      COUNT(*)                                                            AS deals
    FROM crm_commissions WHERE user_id = ?
  `).get(userId) || {};

  const thisMonth = db.prepare(`
    SELECT COALESCE(SUM(commission_value), 0) AS value
    FROM crm_commissions WHERE user_id = ? AND DATE(created_at) >= ?
  `).get(userId, monthStart)?.value || 0;

  const monthlyChart = db.prepare(`
    SELECT STRFTIME('%Y-%m', created_at) AS month,
           SUM(commission_value) AS value,
           COUNT(*) AS deals
    FROM crm_commissions
    WHERE user_id = ? AND DATE(created_at) >= ?
    GROUP BY month ORDER BY month ASC
  `).all(userId, yearStart);

  return {
    pending:     totals.pending || 0,
    paid:        totals.paid    || 0,
    total:       totals.total   || 0,
    deals:       totals.deals   || 0,
    this_month:  thisMonth,
    monthly_chart: monthlyChart,
  };
}

module.exports = { maybeCreateCommission, getSummary };
