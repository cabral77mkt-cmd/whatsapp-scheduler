'use strict';

const express = require('express');
const router  = express.Router();
const db      = require('../database');

/**
 * GET /api/finance/cashflow?entity_id=X&days=30
 *
 * Retorna projeção dia-a-dia dos próximos N dias com:
 *  - Saldo atual como base
 *  - Contas a pagar/receber com data de vencimento futura
 *  - Transações recorrentes projetadas para cada dia
 */
router.get('/', (req, res) => {
  const userId   = Number(req.user.sub);
  const entityId = req.query.entity_id ? Number(req.query.entity_id) : null;
  const days     = Math.min(Number(req.query.days) || 30, 90);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  try {
    // ── Saldo atual ──────────────────────────────────────────────────────────
    const eWhere = entityId ? 'AND entity_id = ?' : '';
    const eParam = entityId ? [entityId] : [];

    const balRow = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN type='income'  THEN amount ELSE 0 END), 0) AS income,
        COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END), 0) AS expense
      FROM finance_transactions
      WHERE user_id = ? ${eWhere}
    `).get(userId, ...eParam);
    let runningBalance = (balRow.income - balRow.expense);

    // ── Contas a pagar/receber pendentes com vencimento no período ───────────
    const dateEnd = new Date(today);
    dateEnd.setDate(dateEnd.getDate() + days);
    const dateEndStr = dateEnd.toISOString().split('T')[0];
    const todayStr   = today.toISOString().split('T')[0];

    const payablesWhere = entityId ? 'AND p.entity_id = ?' : '';
    const payables = db.prepare(`
      SELECT p.type, p.amount, p.due_date, p.description, p.counterpart
      FROM finance_payables p
      WHERE p.user_id = ? AND p.paid_date IS NULL
        AND p.due_date BETWEEN ? AND ?
        ${payablesWhere}
      ORDER BY p.due_date ASC
    `).all(userId, todayStr, dateEndStr, ...(entityId ? [entityId] : []));

    // ── Recorrências ativas ───────────────────────────────────────────────────
    const recurrWhere = entityId ? 'AND entity_id = ?' : '';
    const recurrings  = db.prepare(`
      SELECT * FROM finance_recurring
      WHERE user_id = ? AND active = 1
        AND (end_date IS NULL OR end_date >= ?)
        ${recurrWhere}
    `).all(userId, todayStr, ...(entityId ? [entityId] : []));

    // ── Montar mapa de eventos por dia ────────────────────────────────────────
    const eventsByDate = {};

    for (const p of payables) {
      const d = p.due_date;
      if (!eventsByDate[d]) eventsByDate[d] = [];
      eventsByDate[d].push({
        source:  'payable',
        type:    p.type === 'payable' ? 'expense' : 'income',
        amount:  p.amount,
        label:   p.description + (p.counterpart ? ` (${p.counterpart})` : ''),
        icon:    p.type === 'payable' ? '🔴' : '💚',
      });
    }

    // Projeta recorrências para cada dia do período
    for (let i = 0; i < days; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      const dStr = d.toISOString().split('T')[0];

      for (const r of recurrings) {
        let match = false;
        if (r.frequency === 'monthly' && d.getDate() === r.day_of_month) match = true;
        if (r.frequency === 'weekly'  && d.getDay() === r.day_of_week)   match = true;
        if (r.frequency === 'yearly') {
          const start = new Date(r.start_date + 'T12:00:00');
          if (d.getDate() === start.getDate() && d.getMonth() === start.getMonth()) match = true;
        }
        if (!match) continue;

        if (!eventsByDate[dStr]) eventsByDate[dStr] = [];
        eventsByDate[dStr].push({
          source: 'recurring',
          type:   r.type,
          amount: r.amount,
          label:  r.description,
          icon:   r.type === 'income' ? '🔄💚' : '🔄🔴',
        });
      }
    }

    // ── Construir projeção dia-a-dia ──────────────────────────────────────────
    const projection = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      const dStr = d.toISOString().split('T')[0];

      const events     = eventsByDate[dStr] || [];
      const dayIncome  = events.filter(e => e.type === 'income').reduce((s, e) => s + e.amount, 0);
      const dayExpense = events.filter(e => e.type === 'expense').reduce((s, e) => s + e.amount, 0);

      runningBalance += dayIncome - dayExpense;

      projection.push({
        date:         dStr,
        day_income:   dayIncome,
        day_expense:  dayExpense,
        balance:      Math.round(runningBalance * 100) / 100,
        events,
        is_today: i === 0,
      });
    }

    // ── Resumo ────────────────────────────────────────────────────────────────
    const totalIncoming = projection.reduce((s, d) => s + d.day_income,  0);
    const totalOutgoing = projection.reduce((s, d) => s + d.day_expense, 0);
    const finalBalance  = projection.length > 0 ? projection[projection.length - 1].balance : 0;
    const lowestBalance = Math.min(...projection.map(d => d.balance));

    res.json({
      current_balance: Math.round((balRow.income - balRow.expense) * 100) / 100,
      final_balance:   Math.round(finalBalance * 100) / 100,
      lowest_balance:  Math.round(lowestBalance * 100) / 100,
      total_incoming:  Math.round(totalIncoming * 100) / 100,
      total_outgoing:  Math.round(totalOutgoing * 100) / 100,
      days,
      projection,
    });
  } catch (e) {
    console.error('[cashflow]', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
