'use strict';

const db = require('../database');

// Normaliza nome de fornecedor para chave de busca
function normalizeKey(str) {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Aprende com uma transação registrada ─────────────────────────────────────
function learn({ vendor, category_id, type, amount }, userId) {
  if (!vendor || !vendor.trim()) return;

  const key     = normalizeKey(vendor);
  const display = vendor.trim();
  const today   = new Date().toISOString().split('T')[0];

  const existing = db.prepare(
    'SELECT * FROM ai_vendor_memory WHERE user_id = ? AND vendor_key = ?'
  ).get(userId, key);

  if (existing) {
    // Atualiza contagem e confiança (aumenta gradualmente até 1.0)
    db.prepare(`
      UPDATE ai_vendor_memory
      SET transaction_count = transaction_count + 1,
          last_seen = ?,
          category_id = COALESCE(?, category_id),
          confidence = MIN(1.0, confidence + 0.15)
      WHERE id = ?
    `).run(today, category_id || null, existing.id);
  } else {
    // Novo fornecedor
    db.prepare(`
      INSERT INTO ai_vendor_memory (user_id, vendor_key, vendor_display, category_id, type, last_seen, confidence)
      VALUES (?, ?, ?, ?, ?, ?, 0.5)
    `).run(userId, key, display, category_id || null, type || 'expense', today);
  }
}

// ── Enriquece dados com memória de fornecedores ───────────────────────────────
// Retorna { category_id, from_memory: true } se encontrar, ou {} se não
function enrich({ vendor, category_hint }, userId) {
  // 1. Tenta pelo fornecedor exato
  if (vendor) {
    const key = normalizeKey(vendor);
    const memory = db.prepare(`
      SELECT * FROM ai_vendor_memory
      WHERE user_id = ? AND vendor_key = ? AND confidence >= 0.5
      ORDER BY confidence DESC LIMIT 1
    `).get(userId, key);

    if (memory?.category_id) {
      return { category_id: memory.category_id, from_memory: true, vendor_display: memory.vendor_display };
    }

    // Busca parcial: verifica se a chave contém ou está contida em algum vendor salvo
    const partialMatch = db.prepare(`
      SELECT * FROM ai_vendor_memory
      WHERE user_id = ? AND (vendor_key LIKE ? OR ? LIKE '%' || vendor_key || '%')
        AND confidence >= 0.6
      ORDER BY confidence DESC LIMIT 1
    `).get(userId, `%${key}%`, key);

    if (partialMatch?.category_id) {
      return { category_id: partialMatch.category_id, from_memory: true, vendor_display: partialMatch.vendor_display };
    }
  }

  // 2. Tenta pelo category_hint nas categorias do usuário
  if (category_hint) {
    const hint = normalizeKey(category_hint);
    const cats = db.prepare(
      "SELECT id, name FROM finance_categories WHERE user_id = ?"
    ).all(userId);
    const match = cats.find(c => {
      const n = normalizeKey(c.name);
      return n.includes(hint) || hint.includes(n);
    });
    if (match) {
      return { category_id: match.id, from_memory: false };
    }
  }

  return {};
}

module.exports = { learn, enrich };
