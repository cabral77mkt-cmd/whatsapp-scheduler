const express = require('express');
const router = express.Router();
const db = require('../database');

// GET / — dados completos do dashboard
router.get('/', (req, res) => {
  const userId = Number(req.user.sub);
  const now = new Date();
  const curMonth = now.getMonth() + 1;
  const curYear  = now.getFullYear();
  const entity_id = req.query.entity_id ? Number(req.query.entity_id) : null;

  const entityFilter = entity_id ? 'AND t.entity_id = ?' : '';
  const entityParam  = entity_id ? [entity_id] : [];

  // 1. Saldo por entidade
  const entities_balance = db.prepare(`
    SELECT
      e.id, e.name, e.color, e.icon,
      COALESCE(SUM(CASE WHEN t.type='income'  THEN t.amount ELSE 0 END), 0) AS total_income,
      COALESCE(SUM(CASE WHEN t.type='expense' THEN t.amount ELSE 0 END), 0) AS total_expense,
      COALESCE(SUM(CASE WHEN t.type='income' THEN t.amount WHEN t.type='expense' THEN -t.amount ELSE 0 END), 0) AS balance
    FROM finance_entities e
    LEFT JOIN finance_transactions t ON t.entity_id = e.id
    WHERE e.user_id = ?
    GROUP BY e.id ORDER BY e.name
  `).all(userId);

  // 2. Gráfico mensal — últimos 6 meses
  const monthly_chart = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(curYear, curMonth - 1 - i, 1);
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const y = d.getFullYear();
    const label = `${m}/${String(y).slice(2)}`;

    const base = [userId, `${y}-${m}`];
    const ep   = entity_id ? [...base, entity_id] : base;
    const eWhere = entity_id ? 'AND entity_id = ?' : '';

    const income  = db.prepare(`SELECT COALESCE(SUM(amount),0) AS v FROM finance_transactions WHERE user_id=? AND type='income'  AND strftime('%Y-%m',date)=? ${eWhere}`).get(...ep)?.v || 0;
    const expense = db.prepare(`SELECT COALESCE(SUM(amount),0) AS v FROM finance_transactions WHERE user_id=? AND type='expense' AND strftime('%Y-%m',date)=? ${eWhere}`).get(...ep)?.v || 0;
    monthly_chart.push({ label, month: Number(m), year: y, income, expense, balance: income - expense });
  }

  // 3. Últimas 20 transações
  const recentParams = entity_id ? [userId, entity_id] : [userId];
  const recentWhere  = entity_id ? 'AND t.entity_id = ?' : '';
  const recent_transactions = db.prepare(`
    SELECT t.*, e.name AS entity_name, e.color AS entity_color, e.icon AS entity_icon,
           c.name AS category_name, c.color AS category_color, c.icon AS category_icon
    FROM finance_transactions t
    LEFT JOIN finance_entities e ON e.id = t.entity_id
    LEFT JOIN finance_categories c ON c.id = t.category_id
    WHERE t.user_id = ? ${recentWhere}
    ORDER BY t.date DESC, t.created_at DESC LIMIT 20
  `).all(...recentParams);

  // 4. Top categorias de despesa (mês atual)
  const topParams = entity_id
    ? [userId, `${curYear}-${String(curMonth).padStart(2,'0')}`, entity_id]
    : [userId, `${curYear}-${String(curMonth).padStart(2,'0')}`];
  const topWhere = entity_id ? 'AND t.entity_id = ?' : '';
  const topRows = db.prepare(`
    SELECT c.id, c.name, c.color, c.icon,
           COALESCE(SUM(t.amount),0) AS total
    FROM finance_transactions t
    LEFT JOIN finance_categories c ON c.id = t.category_id
    WHERE t.user_id = ? AND t.type='expense' AND strftime('%Y-%m',t.date)=? ${topWhere}
    GROUP BY t.category_id ORDER BY total DESC LIMIT 5
  `).all(...topParams);

  const totalExpMonth = topRows.reduce((s, r) => s + r.total, 0);
  const top_categories = topRows.map(r => ({
    ...r,
    percent: totalExpMonth > 0 ? Math.round((r.total / totalExpMonth) * 100) : 0,
  }));

  // 5. Totais do mês atual
  const totMonth = String(curMonth).padStart(2, '0');
  const totParams = entity_id ? [userId, `${curYear}-${totMonth}`, entity_id] : [userId, `${curYear}-${totMonth}`];
  const totWhere  = entity_id ? 'AND entity_id = ?' : '';
  const income_month  = db.prepare(`SELECT COALESCE(SUM(amount),0) AS v FROM finance_transactions WHERE user_id=? AND type='income'  AND strftime('%Y-%m',date)=? ${totWhere}`).get(...totParams)?.v || 0;
  const expense_month = db.prepare(`SELECT COALESCE(SUM(amount),0) AS v FROM finance_transactions WHERE user_id=? AND type='expense' AND strftime('%Y-%m',date)=? ${totWhere}`).get(...totParams)?.v || 0;

  // 6. Orçamentos com % gasto (mês atual)
  const budgets = db.prepare(`
    SELECT b.*, c.name AS category_name, c.color AS category_color, c.icon AS category_icon,
           COALESCE(SUM(t.amount),0) AS spent
    FROM finance_budgets b
    LEFT JOIN finance_categories c ON c.id = b.category_id
    LEFT JOIN finance_transactions t
      ON t.category_id = b.category_id AND t.user_id = b.user_id AND t.type='expense'
      AND strftime('%m',t.date) = printf('%02d', b.month)
      AND strftime('%Y',t.date) = CAST(b.year AS TEXT)
      AND (b.entity_id IS NULL OR t.entity_id = b.entity_id)
    WHERE b.user_id = ? AND b.month = ? AND b.year = ?
    GROUP BY b.id ORDER BY c.name
  `).all(userId, curMonth, curYear).map(b => ({
    ...b,
    percent: b.amount > 0 ? Math.round((b.spent / b.amount) * 100) : 0,
  }));

  // 7. Comparativo mês a mês por categoria
  const prevMonth = curMonth === 1 ? 12 : curMonth - 1;
  const prevYear  = curMonth === 1 ? curYear - 1 : curYear;
  const prevMM    = String(prevMonth).padStart(2,'0');
  const curMM     = String(curMonth).padStart(2,'0');

  const compParams = entity_id
    ? [userId, `${curYear}-${curMM}`,  entity_id,
       userId, `${prevYear}-${prevMM}`, entity_id]
    : [userId, `${curYear}-${curMM}`,
       userId, `${prevYear}-${prevMM}`];
  const compWhere = entity_id ? 'AND t.entity_id = ?' : '';

  const curCats  = db.prepare(`SELECT c.id, c.name, c.color, c.icon, COALESCE(SUM(t.amount),0) AS total FROM finance_transactions t LEFT JOIN finance_categories c ON c.id=t.category_id WHERE t.user_id=? AND t.type='expense' AND strftime('%Y-%m',t.date)=? ${compWhere} GROUP BY t.category_id`).all(...(entity_id ? [userId, `${curYear}-${curMM}`, entity_id] : [userId, `${curYear}-${curMM}`]));
  const prevCats = db.prepare(`SELECT t.category_id AS id, COALESCE(SUM(t.amount),0) AS total FROM finance_transactions t WHERE t.user_id=? AND t.type='expense' AND strftime('%Y-%m',t.date)=? ${compWhere} GROUP BY t.category_id`).all(...(entity_id ? [userId, `${prevYear}-${prevMM}`, entity_id] : [userId, `${prevYear}-${prevMM}`]));

  const prevMap = new Map(prevCats.map(r => [r.id, r.total]));
  const comparison = curCats.map(r => {
    const prev = prevMap.get(r.id) || 0;
    const diff = r.total - prev;
    const diffPct = prev > 0 ? Math.round((diff / prev) * 100) : null;
    return { ...r, prev_total: prev, diff, diff_pct: diffPct };
  });

  // 8. Fluxo de caixa projetado (próximos 3 meses)
  // Detecta recorrências: categoria com gastos em ≥2 dos últimos 3 meses
  const cashflow = [];
  const recurrencyBase = [];
  for (let i = 3; i >= 1; i--) {
    const d2 = new Date(curYear, curMonth - 1 - i, 1);
    const mm2 = String(d2.getMonth() + 1).padStart(2,'0');
    const yy2 = d2.getFullYear();
    const ep2 = entity_id ? [userId, `${yy2}-${mm2}`, entity_id] : [userId, `${yy2}-${mm2}`];
    const eW2 = entity_id ? 'AND entity_id=?' : '';
    const rows2 = db.prepare(`SELECT category_id, type, SUM(amount) AS total FROM finance_transactions WHERE user_id=? AND strftime('%Y-%m',date)=? ${eW2} GROUP BY category_id, type`).all(...ep2);
    recurrencyBase.push(rows2);
  }

  // Conta quantas vezes cada (category_id, type) apareceu
  const recurrMap = new Map();
  for (const monthData of recurrencyBase) {
    for (const row of monthData) {
      const key = `${row.category_id}:${row.type}`;
      if (!recurrMap.has(key)) recurrMap.set(key, { count: 0, totals: [], category_id: row.category_id, type: row.type });
      const entry = recurrMap.get(key);
      entry.count++;
      entry.totals.push(row.total);
    }
  }

  const recurring = [];
  for (const [, v] of recurrMap) {
    if (v.count >= 2) {
      const avg = v.totals.reduce((a, b) => a + b, 0) / v.totals.length;
      recurring.push({ category_id: v.category_id, type: v.type, avg });
    }
  }

  for (let i = 1; i <= 3; i++) {
    const d3 = new Date(curYear, curMonth - 1 + i, 1);
    const projIncome  = recurring.filter(r => r.type === 'income').reduce((s, r) => s + r.avg, 0);
    const projExpense = recurring.filter(r => r.type === 'expense').reduce((s, r) => s + r.avg, 0);
    cashflow.push({
      label: `${String(d3.getMonth()+1).padStart(2,'0')}/${String(d3.getFullYear()).slice(2)}`,
      month: d3.getMonth() + 1,
      year: d3.getFullYear(),
      projected_income: Math.round(projIncome * 100) / 100,
      projected_expense: Math.round(projExpense * 100) / 100,
      projected_balance: Math.round((projIncome - projExpense) * 100) / 100,
    });
  }

  // 9. Health Score (0–100)
  const saldoTotal = entities_balance.reduce((s, e) => s + e.balance, 0);
  const saldoPositivo = saldoTotal >= 0 ? 40 : Math.max(0, 40 + Math.round((saldoTotal / Math.abs(saldoTotal || 1)) * 20));

  const orcamentosEstourados = budgets.filter(b => b.percent >= 100).length;
  const orcamentosOk = budgets.length === 0 ? 30 :
    Math.round(30 * (1 - (orcamentosEstourados / budgets.length)));

  let inadimplenciaScore = 30;
  try {
    const today2 = new Date().toISOString().split('T')[0];
    const eWhere2 = entity_id ? 'AND entity_id = ?' : '';
    const vencidas = db.prepare(`
      SELECT COUNT(*) as cnt FROM finance_payables
      WHERE user_id = ? AND paid_date IS NULL AND due_date < ? ${eWhere2}
    `).get(...[userId, today2, ...(entity_id ? [entity_id] : [])]);
    if (vencidas.cnt > 0) inadimplenciaScore = Math.max(0, 30 - vencidas.cnt * 5);
  } catch (_) {}

  const health_score = Math.min(100, saldoPositivo + orcamentosOk + inadimplenciaScore);

  // 10. Contas urgentes (vencidas + vencendo hoje + próximas 3 dias)
  let urgent_payables = [];
  try {
    const todayStr = new Date().toISOString().split('T')[0];
    const in3days  = new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0];
    const eWhere3  = entity_id ? 'AND p.entity_id = ?' : '';
    urgent_payables = db.prepare(`
      SELECT p.id, p.type, p.amount, p.description, p.due_date, p.counterpart
      FROM finance_payables p
      WHERE p.user_id = ? AND p.paid_date IS NULL AND p.due_date <= ?
        ${eWhere3}
      ORDER BY p.due_date ASC LIMIT 5
    `).all(userId, in3days, ...(entity_id ? [entity_id] : []));
  } catch (_) {}

  res.json({
    entities_balance,
    monthly_chart,
    recent_transactions,
    top_categories,
    totals_current_month: { income: income_month, expense: expense_month, balance: income_month - expense_month },
    budgets,
    comparison,
    cashflow,
    health_score,
    urgent_payables,
  });
});

module.exports = router;
