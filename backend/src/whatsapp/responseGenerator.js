'use strict';

const fmt = (v) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

// Escolhe aleatoriamente entre os templates para variar o tom
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ── Templates por situação ────────────────────────────────────────────────────

function registeredComplete(txData, entityName) {
  const { type, amount, description } = txData;
  const sign  = type === 'income' ? '✅' : '🔴';
  const label = type === 'income' ? 'entrada' : 'saída';
  const val   = fmt(amount);
  const desc  = description ? ` — ${description}` : '';

  return pick([
    `${sign} Registrei ${label} de *${val}*${desc}.`,
    `${sign} *${val}* registrado em ${entityName}.${description ? ' (' + description + ')' : ''}`,
    `${sign} Anotado aqui: ${label} de *${val}*.${description ? ' ' + description : ''}`,
  ]);
}

function registeredPendingCategory(txData) {
  const { type, amount } = txData;
  const sign  = type === 'income' ? '✅' : '🔴';
  const val   = fmt(amount);

  return pick([
    `${sign} Registrei *${val}* aqui. Em qual categoria entra isso?`,
    `${sign} Anotado *${val}*! Qual categoria devo usar?`,
    `${sign} *${val}* salvo, mas fiquei sem categoria. O que foi exatamente?`,
  ]);
}

function registeredFromOCR(txData, vendor) {
  const { type, amount } = txData;
  const sign = type === 'income' ? '✅' : '🔴';
  const val  = fmt(amount);
  const v    = vendor ? `do ${vendor}` : '';

  return pick([
    `${sign} Identifiquei o comprovante${v ? ' ' + v : ''}. Registrei *${val}*. Tá certo?`,
    `${sign} Esse comprovante parece ser ${vendor ? 'do ' + vendor : 'um pagamento'}. Registrei *${val}*.`,
    `${sign} Vi aqui *${val}*${v ? ' ' + v : ''}. Registrei. Correto?`,
  ]);
}

function registeredWithHypothesis(txData, hypothesis) {
  const { type, amount } = txData;
  const sign = type === 'income' ? '✅' : '🔴';
  const val  = fmt(amount);

  return pick([
    `${sign} *${val}* registrado como *${hypothesis}*. Tá certo isso?`,
    `${sign} Salvei como *${hypothesis}* — *${val}*. Se precisar ajustar, só me fala.`,
    `${sign} Anotado como *${hypothesis}*: *${val}*. Correto?`,
  ]);
}

function clarificationNeeded(question) {
  // Pergunta já vem formatada do aiParser
  return question;
}

function correctionApplied(field, newValue) {
  return pick([
    `Perfeito, ajustei para *${newValue}*.`,
    `Feito! Corrigi para *${newValue}*.`,
    `Ok, atualizado.`,
    `Ajustado! ✓`,
  ]);
}

function correctionNotUnderstood() {
  return pick([
    `Não entendi bem. Pode me dizer o que precisa corrigir?`,
    `Pode detalhar a correção? Ex: "valor era 80" ou "foi alimentação".`,
  ]);
}

// ── Builder principal ─────────────────────────────────────────────────────────
/**
 * Monta a resposta de confirmação de registro.
 * @param {Object} txData   — dados da transação inserida
 * @param {Object|null} ocrData — dados do OCR (se houver)
 * @param {string} entityName
 * @returns {string}
 */
function buildRegistrationResponse(txData, ocrData, entityName) {
  const vendor = txData._vendor || ocrData?.vendor || null;

  if (ocrData && ocrData.amount > 0) {
    return registeredFromOCR(txData, vendor);
  }

  if (txData.enrichment_status === 'pending_category') {
    return registeredPendingCategory(txData);
  }

  // Tem categoria inferida — usa hypothesis se a confiança é baixa
  if (txData.confidence < 0.65 && txData.description) {
    return registeredWithHypothesis(txData, txData.description);
  }

  return registeredComplete(txData, entityName);
}

module.exports = {
  buildRegistrationResponse,
  clarificationNeeded,
  correctionApplied,
  correctionNotUnderstood,
};
