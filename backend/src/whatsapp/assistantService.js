'use strict';

const Anthropic = require('@anthropic-ai/sdk');
const db = require('../database');

let _client = null;
function getClient() {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY não configurada');
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

const fmt = (v) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

// ── Monta contexto financeiro da entidade para o assistente ──────────────────
function buildContext(entity, userId) {
  // Saldo atual
  const balance = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN type='income'  THEN amount ELSE 0 END), 0) AS total_income,
      COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END), 0) AS total_expense
    FROM finance_transactions
    WHERE entity_id = ? AND user_id = ?
  `).get(entity.id, userId);

  const saldo = (balance.total_income - balance.total_expense);

  // Últimas 10 transações
  const txs = db.prepare(`
    SELECT ft.type, ft.amount, ft.description, ft.date, fc.name AS category
    FROM finance_transactions ft
    LEFT JOIN finance_categories fc ON ft.category_id = fc.id
    WHERE ft.entity_id = ? AND ft.user_id = ?
    ORDER BY ft.created_at DESC LIMIT 10
  `).all(entity.id, userId);

  // Orçamentos do mês atual
  const now = new Date();
  const budgets = db.prepare(`
    SELECT fb.amount AS limite, fc.name AS categoria,
      COALESCE(SUM(ft.amount), 0) AS gasto
    FROM finance_budgets fb
    JOIN finance_categories fc ON fb.category_id = fc.id
    LEFT JOIN finance_transactions ft
      ON ft.category_id = fb.category_id
      AND ft.entity_id = fb.entity_id
      AND ft.type = 'expense'
      AND strftime('%m', ft.date) = ?
      AND strftime('%Y', ft.date) = ?
    WHERE fb.entity_id = ? AND fb.user_id = ?
    GROUP BY fb.id
  `).all(
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getFullYear()),
    entity.id, userId
  );

  const txList = txs.map(t =>
    `  - ${t.date} | ${t.type === 'income' ? '+' : '-'}${fmt(t.amount)} | ${t.description}${t.category ? ' [' + t.category + ']' : ''}`
  ).join('\n') || '  (nenhuma transação ainda)';

  const budgetList = budgets.map(b => {
    const pct = b.limite > 0 ? Math.round((b.gasto / b.limite) * 100) : 0;
    return `  - ${b.categoria}: gasto ${fmt(b.gasto)} / limite ${fmt(b.limite)} (${pct}%)`;
  }).join('\n') || '  (sem orçamentos definidos)';

  return `
Entidade: ${entity.name}
Saldo atual: ${fmt(saldo)} (entradas: ${fmt(balance.total_income)} | saídas: ${fmt(balance.total_expense)})

Últimas transações:
${txList}

Orçamentos do mês atual:
${budgetList}
`.trim();
}

// ── Responde como assistente financeiro ──────────────────────────────────────
async function reply(question, entity, userId) {
  const context = buildContext(entity, userId);

  let raw;
  try {
    const res = await getClient().messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 300,
      system: `Você é um assistente financeiro do WhatsApp para a entidade "${entity.name}".
Responda sempre em português, de forma direta e concisa (máximo 4 linhas).
Use emojis com moderação. Nunca invente dados — use apenas o contexto fornecido.

CONTEXTO FINANCEIRO ATUAL:
${context}`,
      messages: [{ role: 'user', content: question }],
    });
    raw = res.content[0]?.text?.trim();
  } catch (err) {
    console.error('[assistantService] Erro na API:', err.message);
    return null;
  }

  return raw || null;
}

module.exports = { reply };
