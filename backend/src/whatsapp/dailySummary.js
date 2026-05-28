'use strict';

const db = require('../database');
const { sendMessageToGroup, getStatus } = require('./client');

const fmt = (v) => `R$ ${(v || 0).toFixed(2).replace('.', ',')}`;

async function sendDailySummary(userId) {
  const entities = db.prepare(
    "SELECT * FROM finance_entities WHERE user_id = ? AND wa_group_id IS NOT NULL AND wa_group_id != ''"
  ).all(userId);

  for (const entity of entities) {
    if (getStatus(userId) !== 'connected') continue;

    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    // Balanço de ontem
    const day = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN type='income'  THEN amount ELSE 0 END), 0) AS income,
        COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END), 0) AS expense,
        COUNT(*) as total_txs
      FROM finance_transactions
      WHERE user_id = ? AND entity_id = ? AND date = ?
    `).get(userId, entity.id, yesterday);

    // Saldo total acumulado
    const balance = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN type='income'  THEN amount ELSE 0 END), 0) AS income,
        COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END), 0) AS expense
      FROM finance_transactions
      WHERE user_id = ? AND entity_id = ?
    `).get(userId, entity.id);
    const saldo = balance.income - balance.expense;

    // Contas a pagar vencendo hoje
    let vencendo = { cnt: 0, total: 0 };
    try {
      vencendo = db.prepare(`
        SELECT COUNT(*) as cnt, COALESCE(SUM(amount), 0) as total
        FROM finance_payables
        WHERE user_id = ? AND entity_id = ? AND type = 'payable' AND due_date = ? AND paid_date IS NULL
      `).get(userId, entity.id, today) || { cnt: 0, total: 0 };
    } catch (_) { /* tabela pode não existir ainda */ }

    // Top gasto de ontem por categoria
    const topCat = db.prepare(`
      SELECT fc.name, SUM(ft.amount) as total
      FROM finance_transactions ft
      LEFT JOIN finance_categories fc ON ft.category_id = fc.id
      WHERE ft.user_id = ? AND ft.entity_id = ? AND ft.date = ? AND ft.type = 'expense'
      GROUP BY ft.category_id ORDER BY total DESC LIMIT 1
    `).get(userId, entity.id, yesterday);

    // Anomalia: gasto de ontem > 150% da média dos últimos 7 dias
    const avg7 = db.prepare(`
      SELECT AVG(daily_expense) as avg FROM (
        SELECT date, SUM(amount) as daily_expense
        FROM finance_transactions
        WHERE user_id = ? AND entity_id = ? AND type = 'expense'
          AND date >= date(?, '-7 days') AND date < ?
        GROUP BY date
      )
    `).get(userId, entity.id, yesterday, yesterday);
    const anomaly = avg7?.avg > 0 && day.expense > avg7.avg * 1.5;

    // Montar mensagem
    const saldoEmoji = saldo >= 0 ? '✅' : '🔴';
    const dateLabel = new Date(yesterday + 'T12:00:00').toLocaleDateString('pt-BR', {
      weekday: 'long', day: 'numeric', month: 'short'
    });

    const lines = [
      `📊 *Resumo ${entity.icon || '💰'} ${entity.name}*`,
      `📅 ${dateLabel}`,
      '',
    ];

    if (day.total_txs > 0) {
      lines.push(`💚 Entradas: ${fmt(day.income)}`);
      lines.push(`🔴 Saídas: ${fmt(day.expense)}`);
      const resultado = day.income - day.expense;
      lines.push(`📈 Resultado do dia: ${resultado >= 0 ? '+' : ''}${fmt(resultado)}`);
    } else {
      lines.push('_Nenhuma movimentação ontem._');
    }

    if (topCat) {
      lines.push(`📌 Maior gasto: ${topCat.name} (${fmt(topCat.total)})`);
    }

    if (anomaly) {
      lines.push(`⚠️ *Gasto acima do normal!* (${fmt(day.expense)} vs média ${fmt(avg7.avg)})`);
    }

    lines.push('');
    lines.push(`${saldoEmoji} *Saldo geral: ${fmt(saldo)}*`);

    if (vencendo.cnt > 0) {
      lines.push('');
      lines.push(`⏰ *${vencendo.cnt} conta(s) vencem HOJE:* ${fmt(vencendo.total)}`);
    }

    try {
      await sendMessageToGroup(userId, entity.wa_group_id, lines.join('\n'));
      console.log(`[DailySummary] ✓ Enviado para ${entity.name} (user:${userId})`);
    } catch (e) {
      console.error(`[DailySummary] Erro em ${entity.name}:`, e.message);
    }
  }
}

module.exports = { sendDailySummary };
