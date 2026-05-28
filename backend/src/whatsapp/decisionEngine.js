'use strict';

const db = require('../database');

// ── MVT — Minimum Viable Transaction ─────────────────────────────────────────
// Retorna true se há dados suficientes para registrar imediatamente.
// Regra: amount > 0  E  type inferível
function isMVT(data) {
  if (!data) return false;
  const amount = data.amount ?? data.ocr_amount ?? null;
  const type   = data.type ?? null;
  return amount && amount > 0 && (type === 'income' || type === 'expense');
}

// ── Mescla dados de texto + OCR ───────────────────────────────────────────────
// text: { type, amount, desc, confidence, category_hint, vendor }
// ocr:  { amount, date, vendor, type_hint, confidence, raw_text }  ou null
function merge(textParsed, ocrData) {
  if (!textParsed && !ocrData) return null;

  const result = {
    type:          null,
    amount:        null,
    desc:          null,
    category_hint: null,
    vendor:        null,
    confidence:    0,
    source:        'none',
    ocr_raw:       null,
    ocr_date:      null,
  };

  // Aplica dados de texto
  if (textParsed && !textParsed.needsClarification) {
    result.type          = textParsed.type   || null;
    result.amount        = textParsed.amount || null;
    result.desc          = textParsed.desc   || null;
    result.category_hint = textParsed.category_hint || null;
    result.vendor        = textParsed.vendor || null;
    result.confidence    = textParsed.confidence || 0.5;
    result.source        = 'text';
  }

  // Enriquece / substitui com dados do OCR (OCR tem prioridade para amount quando presente)
  if (ocrData) {
    if (ocrData.amount && ocrData.amount > 0) {
      result.amount  = ocrData.amount;
      result.source  = result.source === 'text' ? 'both' : 'ocr';
    }
    if (ocrData.type_hint && !result.type) {
      result.type = ocrData.type_hint;
    }
    if (ocrData.vendor && !result.vendor) {
      result.vendor = ocrData.vendor;
    }
    if (ocrData.date) {
      result.ocr_date = ocrData.date;
    }
    if (ocrData.raw_text) {
      result.ocr_raw = ocrData.raw_text;
    }
    // OCR geralmente são despesas (comprovantes de pagamento)
    if (!result.type && result.source === 'ocr') {
      result.type = 'expense';
    }
    const ocrConf = ocrData.confidence || 0.7;
    result.confidence = Math.max(result.confidence, ocrConf);
  }

  return result;
}

// ── Campos fallback ───────────────────────────────────────────────────────────
// Preenche campos faltantes com fallbacks e determina enrichment_status.
function applyFallbacks(merged, entity, userId, msgId, sender, originalText) {
  const type   = merged.type || 'expense';  // fallback: maioria é gasto
  const amount = merged.amount;
  const date   = merged.ocr_date || new Date().toISOString().split('T')[0];

  // Descrição: usa desc da IA, depois vendor, depois texto original, depois fallback genérico
  const desc = merged.desc
    || (merged.vendor ? `Pagamento ${merged.vendor}` : null)
    || originalText
    || (type === 'income' ? 'Receita via WhatsApp' : 'Pagamento via WhatsApp');

  // Categoria: tenta encontrar por category_hint ou vendor
  let categoryId = null;
  const hint = merged.category_hint || merged.vendor || null;
  if (hint) {
    const cats = db.prepare(
      "SELECT id, name FROM finance_categories WHERE user_id = ? AND (type = ? OR type = 'both')"
    ).all(userId, type);
    const hintLower = normalizeKey(hint);
    const match = cats.find(c => {
      const n = normalizeKey(c.name);
      return n.includes(hintLower) || hintLower.includes(n);
    });
    if (match) categoryId = match.id;
  }

  // Fallback de categoria
  if (!categoryId) {
    const fallbackName = type === 'income' ? 'Outras Rendas' : 'Outros Gastos';
    const fallback = db.prepare(
      "SELECT id FROM finance_categories WHERE user_id = ? AND name = ? LIMIT 1"
    ).get(userId, fallbackName);
    categoryId = fallback?.id || null;
  }

  // Determina enrichment_status
  let enrichmentStatus = 'complete';
  const pendingFields = [];
  if (!merged.type) {
    enrichmentStatus = 'pending_type';
    pendingFields.push('type');
  }
  if (!merged.category_hint && !categoryId) {
    if (enrichmentStatus === 'complete') enrichmentStatus = 'pending_category';
    pendingFields.push('category');
  }

  return {
    entity_id:         entity.id,
    user_id:           userId,
    type,
    amount,
    description:       desc,
    category_id:       categoryId,
    date,
    source:            'whatsapp',
    wa_msg_id:         msgId,
    wa_sender:         sender.split('@')[0].replace(/[^0-9]/g, ''),  // normalizado — só dígitos
    receipt_requested: 0,
    confidence:        merged.confidence || 0.7,
    enrichment_status: enrichmentStatus,
    pending_fields:    pendingFields.length > 0 ? JSON.stringify(pendingFields) : null,
    ocr_raw:           merged.ocr_raw || null,
    ai_notes:          merged.vendor ? `vendor: ${merged.vendor}` : null,
    _vendor:           merged.vendor || null,    // auxiliar — não vai pro DB direto
    _source:           merged.source,            // auxiliar
  };
}

// ── Normaliza chave para comparação ──────────────────────────────────────────
function normalizeKey(str) {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, '')
    .trim();
}

module.exports = { isMVT, merge, applyFallbacks, normalizeKey };
