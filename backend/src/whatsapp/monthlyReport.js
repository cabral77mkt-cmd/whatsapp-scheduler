'use strict';

const db = require('../database');
const { sendMessageToGroup, getStatus } = require('./client');

const fmt = (v) => `R$ ${(v || 0).toFixed(2).replace('.', ',')}`;

const MONTH_NAMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

async function sendMonthlyReport(userId) {
  const now = new Date();
  // Relatório do mês anterior
  const prevMonth = now.getMonth() === 0 ? 12 : now.getMonth();
  const prevYear  = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const mm   = String(prevMonth).padStart(2, '0');
  const yyyy = String(prevYear);

  const entities = db.prepare(
    "SELECT * FROM finance_entities WHERE user_id = ? AND wa_group_id IS NOT NULL AND wa_group_id != ''"
  ).all(userId);

  for (const entity of entities) {
    if (getStatus(userId) !== 'connected') continue;

    const totals = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN type='income'  THEN amount ELSE 0 END), 0) as income,
        COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END), 0) as expense,
        COUNT(*) as txs
      FROM finance_transactions
      WHERE user_id = ? AND entity_id = ?
        AND strftime('%m', date) = ? AND strftime('%Y', date) = ?
    `).get(userId, entity.id, mm, yyyy);

    const topCats = db.prepare(`
      SELECT fc.name, fc.icon, SUM(ft.amount) as total
      FROM finance_transactions ft
      JOIN finance_categories fc ON ft.category_id = fc.id
      WHERE ft.user_id = ? AND ft.entity_id = ? AND ft.type = 'expense'
        AND strftime('%m', ft.date) = ? AND strftime('%Y', ft.date) = ?
      GROUP BY ft.category_id ORDER BY total DESC LIMIT 3
    `).all(userId, entity.id, mm, yyyy);

    const resultado = totals.income - totals.expense;
    const saldoEmoji = resultado >= 0 ? '✅' : '🔴';

    const lines = [
      `📆 *Relatório ${MONTH_NAMES[prevMonth - 1]}/${yyyy}*`,
      `${entity.icon || '💰'} *${entity.name}*`,
      '',
      `💚 Receitas: ${fmt(totals.income)}`,
      `🔴 Despesas: ${fmt(totals.expense)}`,
      `${saldoEmoji} Resultado: ${resultado >= 0 ? '+' : ''}${fmt(resultado)}`,
      `📝 ${totals.txs} transação(ões) no mês`,
    ];

    if (topCats.length > 0) {
      lines.push('');
      lines.push('📊 *Maiores gastos do mês:*');
      topCats.forEach((c, i) => {
        lines.push(`  ${i + 1}. ${c.icon || '•'} ${c.name}: ${fmt(c.total)}`);
      });
    }

    // Contas em aberto (se houver)
    let payablesOpen = { cnt: 0, total: 0 };
    try {
      payablesOpen = db.prepare(`
        SELECT COUNT(*) as cnt, COALESCE(SUM(amount), 0) as total
        FROM finance_payables
        WHERE user_id = ? AND entity_id = ? AND type = 'payable' AND paid_date IS NULL
      `).get(userId, entity.id) || { cnt: 0, total: 0 };
    } catch (_) {}

    if (payablesOpen.cnt > 0) {
      lines.push('');
      lines.push(`⏰ *${payablesOpen.cnt} conta(s) em aberto:* ${fmt(payablesOpen.total)}`);
    }

    try {
      await sendMessageToGroup(userId, entity.wa_group_id, lines.join('\n'));
      console.log(`[MonthlyReport] ✓ Enviado para ${entity.name} (user:${userId})`);
    } catch (e) {
      console.error(`[MonthlyReport] Erro em ${entity.name}:`, e.message);
    }
  }
}

module.exports = { sendMonthlyReport };
