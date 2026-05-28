'use strict';

const Anthropic = require('@anthropic-ai/sdk');

let _client = null;
function getClient() {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY não configurada');
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

// MIME types suportados por Claude Vision
const SUPPORTED_IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

function detectMimeType(msg) {
  if (msg.message?.imageMessage)
    return msg.message.imageMessage.mimetype || 'image/jpeg';
  if (msg.message?.documentMessage)
    return msg.message.documentMessage.mimetype || 'application/pdf';
  if (msg.message?.documentWithCaptionMessage)
    return msg.message.documentWithCaptionMessage.message?.documentMessage?.mimetype || 'application/pdf';
  return 'image/jpeg';
}

/**
 * Extrai dados financeiros de um buffer de imagem via Claude Vision.
 * @param {Buffer} buffer  — buffer da imagem já baixada
 * @param {object} msg     — mensagem Baileys (para detectar MIME)
 * @returns {object|null}  — { amount, date, vendor, type_hint, confidence, raw_text } ou null
 */
async function extract(buffer, msg) {
  const mimeType = detectMimeType(msg);

  // Claude Vision aceita imagens — PDFs não são suportados diretamente
  if (!SUPPORTED_IMAGE_MIMES.includes(mimeType)) {
    console.log(`[ocrService] MIME ${mimeType} não suportado pelo Vision — pulando OCR`);
    return null;
  }

  const base64 = buffer.toString('base64');

  let raw;
  try {
    const res = await getClient().messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mimeType, data: base64 },
          },
          {
            type: 'text',
            text: `Analise esta imagem e extraia dados financeiros se for um comprovante, recibo, nota fiscal ou print de pagamento.
Responda APENAS com JSON:
{"amount":number|null,"date":"YYYY-MM-DD"|null,"vendor":"nome do estabelecimento/pessoa"|null,"type_hint":"expense"|"income"|null,"confidence":0.0-1.0,"raw_text":"texto principal extraído"}

Regras:
- "amount": valor em reais como número (ex: 186.40). "5k"=5000, "4 mil"=4000
- "type_hint": "expense" para pagamentos/compras, "income" para recebimentos/depósitos
- "confidence": 0 se não for comprovante financeiro
- Se não for comprovante: {"amount":null,"confidence":0,"raw_text":""}`,
          },
        ],
      }],
    });
    raw = res.content[0]?.text?.trim();
  } catch (err) {
    console.error('[ocrService] Erro na API Claude Vision:', err.message);
    return null;
  }

  let p;
  try {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    p = JSON.parse(cleaned);
  } catch {
    console.error('[ocrService] JSON inválido:', raw);
    return null;
  }

  if (!p.amount || p.confidence < 0.3) {
    console.log('[ocrService] Confiança baixa ou sem valor — imagem não reconhecida como comprovante');
    return null;
  }

  console.log(`[ocrService] ✅ OCR: R$${p.amount} | ${p.vendor || '?'} | conf=${p.confidence}`);
  return p;
}

module.exports = { extract };
