'use strict';

const db = require('../database');

// ── Padrões que indicam intenção de corrigir ──────────────────────────────────
const CORRECTION_PATTERNS = [
  /^(não|nao|errei|errado|mentira|calma|perae|espera)/i,
  /^(na verdade|foi de|foi um|foi uma|era de|era um|era uma|era para|era do|era da)/i,
  /^(corrige|muda|altera|atualiza|troca)\b/i,
  /^(isso foi|aquilo foi|esse foi|esse era|esse é|isso é)/i,
  /^(valor era|valor correto|valor certo|valor é|o valor)/i,
  /^(foi do|foi da|foi no|foi na|foi em)\b/i,
];

// Padrões de confirmação (retorna { confirm: true })
const CONFIRM_PATTERNS = [
  /^(sim|s|isso|exato|exatamente|correto|certo|ok|isso mesmo|tá|ta|é isso)$/i,
];

// ── Detect: verifica se o texto é uma correção de tx recente ─────────────────
/**
 * @returns {{ transaction, correctionText, isConfirm } | null}
 */
function detect(userId, groupJid, sender, text) {
  if (!text || text.trim().length < 2) return null;

  const trimmed = text.trim();

  const isCorrection = CORRECTION_PATTERNS.some((p) => p.test(trimmed));
  const isConfirm    = CONFIRM_PATTERNS.some((p) => p.test(trimmed));

  if (!isCorrection && !isConfirm) return null;

  // Normaliza sender para só dígitos
  const senderDigits = sender.split('@')[0].replace(/[^0-9]/g, '');

  // Busca última transação do mesmo sender nas últimas 2 horas (janela de correção)
  const recent = db.prepare(`
    SELECT ft.*, fc.name AS category_name
    FROM finance_transactions ft
    LEFT JOIN finance_categories fc ON ft.category_id = fc.id
    WHERE ft.user_id = ?
      AND ft.wa_sender = ?
      AND ft.source = 'whatsapp'
      AND ft.created_at >= datetime('now', '-2 hours')
    ORDER BY ft.created_at DESC
    LIMIT 1
  `).get(userId, senderDigits);

  if (!recent) return null;

  return { transaction: recent, correctionText: trimmed, isConfirm: isConfirm && !isCorrection };
}

// ── Parse correction: extrai o que o usuário quer corrigir ───────────────────
/**
 * Retorna { field, newValue } ou null se não entendeu.
 */
function parseCorrection(correctionText, transaction) {
  const t = correctionText.trim().toLowerCase();

  // Correção de valor: "valor era 80", "foi de 150", "era 200,50"
  const amountMatch = t.match(/(?:valor|foi de|era de?|é de?|de?)\s+r?\$?\s*(\d+(?:[.,]\d{1,2})?)/i);
  if (amountMatch) {
    const newAmount = parseFloat(amountMatch[1].replace(',', '.'));
    if (newAmount > 0) return { field: 'amount', newValue: newAmount };
  }

  // Correção de tipo: "foi entrada", "era receita", "não foi gasto"
  if (/\b(entrada|receita|recebimento|income)\b/i.test(t)) {
    return { field: 'type', newValue: 'income' };
  }
  if (/\b(saída|gasto|despesa|pagamento|expense)\b/i.test(t)) {
    return { field: 'type', newValue: 'expense' };
  }

  // Correção de descrição: "foi para aluguel", "era almoço", "é combustível"
  const descMatch = t.match(/(?:foi para|era|é|foi|foi um|foi uma)\s+(.{3,40})$/i);
  if (descMatch) {
    const candidate = descMatch[1].trim();
    // Verifica se é uma categoria existente
    if (transaction) {
      const cats = db.prepare(
        "SELECT id, name FROM finance_categories WHERE user_id = ? AND (type = ? OR type = 'both')"
      ).all(transaction.user_id, transaction.type);
      const norm = normalizeKey(candidate);
      const catMatch = cats.find((c) => normalizeKey(c.name).includes(norm) || norm.includes(normalizeKey(c.name)));
      if (catMatch) {
        return { field: 'category_id', newValue: catMatch.id, displayValue: catMatch.name };
      }
    }
    // Senão: atualiza descrição
    return { field: 'description', newValue: candidate };
  }

  return null;
}

// ── Apply: aplica a correção no banco ────────────────────────────────────────
/**
 * @returns {{ field, displayValue } | null}
 */
function apply(correction) {
  const { transaction, correctionText } = correction;

  const parsed = parseCorrection(correctionText, transaction);
  if (!parsed) return null;

  const { field, newValue, displayValue } = parsed;

  // Atualiza a transação
  db.prepare(`UPDATE finance_transactions SET ${field} = ? WHERE id = ?`)
    .run(newValue, transaction.id);

  // Registra no log de correções
  try {
    db.prepare(`
      INSERT INTO ai_corrections (user_id, transaction_id, field_changed, old_value, new_value, correction_msg)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      transaction.user_id,
      transaction.id,
      field,
      String(transaction[field] ?? ''),
      String(newValue),
      correctionText
    );
  } catch (e) {
    // Se a tabela não existir ainda, ignora silenciosamente
    if (!e.message?.includes('no such table')) {
      console.error('[correctionHandler] Erro ao registrar correção:', e.message);
    }
  }

  return { field, newValue, displayValue: displayValue || String(newValue) };
}

function normalizeKey(str) {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, '')
    .trim();
}

module.exports = { detect, apply };
