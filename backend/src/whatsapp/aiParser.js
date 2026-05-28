'use strict';

const Anthropic = require('@anthropic-ai/sdk');
const db = require('../database');

// Lazy-init: só falha se ANTHROPIC_API_KEY ausente na hora da 1ª chamada
let _client = null;
function getClient() {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY não configurada. Defina no ecosystem.config.cjs ou variável de ambiente.');
    }
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

// ── Pending context ──────────────────────────────────────────────────────────
// key = `${userId}:${groupJid}:${sender}`
// value = { partialData: { type, amount, desc }, waitingFor, expiresAt, txId? }
const pending = new Map();

function setPending(key, data) {
  pending.set(key, { ...data, expiresAt: Date.now() + 30 * 60 * 1000 }); // 30 min
}

function getPending(key) {
  cleanExpired();
  return pending.get(key) || null;
}

function clearPending(key) {
  pending.delete(key);
}

function cleanExpired() {
  const now = Date.now();
  for (const [k, e] of pending.entries()) {
    if (e.expiresAt < now) pending.delete(k);
  }
}

// ── Prompt ───────────────────────────────────────────────────────────────────
function buildPrompt(userId) {
  // Busca categorias do usuário para passar como contexto
  const cats = db.prepare('SELECT name, type FROM finance_categories WHERE user_id = ?').all(userId);
  const catList = cats.map(c => `${c.name}(${c.type})`).join(', ');

  return `Você é um extrator de transações financeiras para um grupo WhatsApp brasileiro.
Categorias disponíveis: ${catList || 'Alimentação, Transporte, Aluguel, Marketing, Vendas, Outros'}

Analise a mensagem e responda APENAS com JSON:
{"type":"income"|"expense"|null,"amount":number|null,"desc":"descrição limpa"|null,"category_hint":"nome da categoria se possível"|null,"vendor":"nome do fornecedor/estabelecimento se presente"|null,"confidence":0.0-1.0,"is_financial":true|false}

Regras:
- "type": "income" para entradas/receitas, "expense" para saídas/gastos
- "amount": valor numérico sem R$ (ex: 150.00). CRÍTICO: "5k"=5000, "2mil"=2000, "4 mil"=4000, "1.5k"=1500, "10k"=10000. Qualquer número seguido de "k", "mil" ou "K" deve ser multiplicado por 1000
- "desc": descrição limpa em português, 2-5 palavras
- "confidence": quão certo você está de que é transação financeira
- "is_financial": false se claramente não for financeiro (saudação, emoji, texto aleatório)
- Se não for financeiro: {"is_financial":false}`;
}

// ── AI Parser ─────────────────────────────────────────────────────────────────
/**
 * Interpreta texto livre como transação financeira via Claude Haiku.
 *
 * Retorna:
 *   { type, amount, desc, category_hint, vendor, confidence }  — dado completo
 *   { needsClarification: true, question, unclear, partialData } — precisa de info
 *   null — não é mensagem financeira
 */
async function parseWithAI(text, userId) {
  let raw;
  try {
    const res = await getClient().messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 128,
      system: buildPrompt(userId),
      messages: [{ role: 'user', content: `Mensagem: "${text}"` }],
    });
    raw = res.content[0]?.text?.trim();
  } catch (err) {
    console.error('[aiParser] Erro na API Claude:', err.message);
    throw err; // propaga para client.js usar regex como fallback
  }

  let p;
  try {
    // Remove possíveis marcadores de código
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    p = JSON.parse(cleaned);
  } catch {
    console.error('[aiParser] JSON inválido recebido:', raw);
    return null;
  }

  // Não é financeiro
  if (p.is_financial === false) return null;

  const { type, amount, desc, category_hint, vendor, confidence } = p;

  // Dados completos — pode registrar
  if (type && amount && amount > 0) {
    return { type, amount, desc: desc || text, category_hint, vendor, confidence: confidence || 0.7 };
  }

  // Falta informação essencial — precisa perguntar
  let unclear;
  if (!type && !amount) unclear = 'both';
  else if (!type) unclear = 'type';
  else unclear = 'amount';

  const questions = {
    type:   '📊 Entrada ou saída?',
    amount: `💰 Qual o valor${desc ? ' de ' + desc : ''}?`,
    both:   '💬 Pode me informar o valor e se é entrada ou saída?',
  };

  return {
    needsClarification: true,
    question: questions[unclear],
    unclear,
    partialData: { type: type || null, amount: amount || null, desc: desc || text, vendor: vendor || null },
  };
}

// ── Completar pending ─────────────────────────────────────────────────────────
/**
 * Tenta completar uma transação pendente com a resposta do usuário.
 * Retorna { type, amount, desc, vendor } se completo, null se ainda incompleto.
 */
function completePending(entry, replyText) {
  const { partialData, waitingFor } = entry;
  const reply = replyText.trim().toLowerCase();

  if (waitingFor === 'type') {
    let t = null;
    if (/^(entrada|e|\+|income|recebi|receb|ganh|sim|s)/.test(reply)) t = 'income';
    else if (/^(sa[ií]da|s|-|expense|gast|pag|compra|n[aã]o|n)/.test(reply)) t = 'expense';
    if (!t) return null;
    return { type: t, amount: partialData.amount, desc: partialData.desc, vendor: partialData.vendor };
  }

  if (waitingFor === 'amount') {
    const m = reply.match(/r?\$?\s*(\d+(?:[.,]\d{1,2})?)/i);
    if (!m) return null;
    const a = parseFloat(m[1].replace(',', '.'));
    if (!a || a <= 0) return null;
    return { type: partialData.type, amount: a, desc: partialData.desc, vendor: partialData.vendor };
  }

  // 'both': caller re-roda o parse chain com o texto da resposta
  return null;
}

module.exports = {
  parseWithAI,
  setPending,
  getPending,
  clearPending,
  completePending,
};
