const https = require('https');
const http = require('http');
const db = require('../database');
const { sendMessage, getStatus } = require('../whatsapp/client');

const STATUS_LABELS = {
  PG: 'Pago',
  NP: 'Não Pago',
  EA: 'Em Análise',
  DV: 'Devolvido',
  CA: 'Cancelado',
};

function normalizePhone(phone) {
  if (!phone) return null;
  const digits = phone.replace(/[^0-9]/g, '');
  if (digits.length === 10 || digits.length === 11) return '55' + digits;
  if (digits.length >= 12) return digits;
  return null;
}

function formatCurrency(value) {
  // API retorna "25,48" (formato brasileiro) — normaliza para float
  const num = parseFloat(String(value).replace(',', '.'));
  if (isNaN(num)) return value || '';
  return 'R$ ' + num.toFixed(2).replace('.', ',');
}

function parseValor(value) {
  if (!value) return 0;
  return parseFloat(String(value).replace(',', '.')) || 0;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  // Aceita formatos como "04-04-26" (DD-MM-YY), "2026-04-04" (ISO), ou timestamp
  try {
    let d;
    if (/^\d{2}-\d{2}-\d{2}$/.test(dateStr)) {
      const [dd, mm, yy] = dateStr.split('-');
      d = new Date(`20${yy}-${mm}-${dd}`);
    } else {
      d = new Date(dateStr);
    }
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('pt-BR');
  } catch {
    return dateStr;
  }
}

function applyTemplate(message, data) {
  return message
    .replace(/\{nome\}/gi, data.nome || '')
    .replace(/\{evento\}/gi, data.evento || '')
    .replace(/\{valor\}/gi, data.valor || '')
    .replace(/\{data\}/gi, data.data || '');
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    lib.get(url, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch (e) { reject(new Error('Resposta inválida do servidor: ' + raw.slice(0, 100))); }
      });
    }).on('error', reject);
  });
}

async function fetchPayment(linkSistema, apiKey, trnId) {
  // Garante que o link não tem protocolo duplicado
  const base = linkSistema.replace(/^https?:\/\//, '');
  const url = `https://${base}/ws/geral/pagamento.asp?key=${encodeURIComponent(apiKey)}&gmet=1&par1=${trnId}`;
  try {
    const data = await fetchJson(url);
    return data;
  } catch (err) {
    // Tenta HTTP como fallback
    try {
      const urlHttp = `http://${base}/ws/geral/pagamento.asp?key=${encodeURIComponent(apiKey)}&gmet=1&par1=${trnId}`;
      return await fetchJson(urlHttp);
    } catch {
      throw err;
    }
  }
}

async function runTickfyPoll(userId) {
  const config = db.prepare('SELECT * FROM tickfy_config WHERE user_id = ?').get(userId);
  if (!config || !config.active || !config.link_sistema || !config.api_key) return;

  const eventIds = JSON.parse(config.event_ids || '[]');
  let currentId = config.last_trn_id || 0;
  let consecutiveErrors = 0;
  const MAX_ERRORS = 100; // TRN é global — pode haver muitos TRNs de outros produtores entre os seus
  const MAX_PER_POLL = 300; // máximo de TRNs testados por ciclo
  let processed = 0;

  console.log(`[TICKFY] Polling usuário ${userId} a partir do TRN ${currentId + 1}`);

  while (consecutiveErrors < MAX_ERRORS && processed < MAX_PER_POLL) {
    const trnId = currentId + 1;
    let data;

    try {
      data = await fetchPayment(config.link_sistema, config.api_key, trnId);
    } catch (err) {
      console.warn(`[TICKFY] Erro de rede no TRN ${trnId}:`, err.message);
      break;
    }

    // statusId != "00" → pagamento não existe
    if (!data || data.statusId !== '00') {
      consecutiveErrors++;
      currentId = trnId;
      processed++;
      continue;
    }

    consecutiveErrors = 0;
    currentId = trnId;
    processed++;

    // Verifica se já processamos este TRN
    const existing = db.prepare('SELECT id FROM tickfy_sales WHERE trn_id = ? AND user_id = ?').get(trnId, userId);
    if (existing) continue;

    // Campos conforme documentação real do pagamento.asp gmet=1:
    // usu_nome, eve_nome, telefone, status, valor (com vírgula), data_compra
    const eveCod    = String(data.eve_cod   || data.EVE_COD   || '');
    const eveName   = data.eve_nome  || data.evento   || data.EVE_NOME  || '';
    const statusCode= data.status    || data.STATUS   || '';
    const compradorNome = data.usu_nome || data.nome_comprador || data.NOME_COMPRADOR || data.nome || '';
    const rawPhone  = data.telefone  || data.TELEFONE || data.celular   || data.CELULAR || '';
    const email     = data.email     || data.EMAIL    || '';
    const rawValor  = data.valor     || data.VALOR    || 0;
    const rawData   = data.data_compra || data.DATA   || '';

    console.log(`[TICKFY] TRN ${trnId} | status=${statusCode} | nome=${compradorNome} | tel=${rawPhone} | evento=${eveName} | valor=${rawValor}`);

    // Filtra por evento se configurado
    if (eventIds.length > 0 && eveCod && !eventIds.includes(eveCod)) {
      console.log(`[TICKFY] TRN ${trnId} evento ${eveCod} ignorado (não monitorado)`);
      continue;
    }

    const phone = normalizePhone(rawPhone);

    // Salva a venda detectada
    const waInitial = phone ? 0 : 4; // 4 = sem telefone (maquininha/PDV)
    db.prepare(`
      INSERT INTO tickfy_sales
        (user_id, trn_id, eve_cod, evento, comprador_nome, comprador_telefone, comprador_email, valor, status_code, wa_sent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(userId, trnId, eveCod, eveName, compradorNome, phone || rawPhone, email, parseValor(rawValor), statusCode, waInitial);

    const saleDbId = db.prepare('SELECT last_insert_rowid() as id').get().id;

    console.log(`[TICKFY] Nova venda detectada: TRN ${trnId} | ${compradorNome} | ${statusCode} | ${phone}`);

    // Onda 6: sincroniza com CRM se integração estiver ativa
    try {
      const sale = db.prepare('SELECT * FROM tickfy_sales WHERE id = ?').get(saleDbId);
      if (sale) require('../crm/tickfyCrmSync').syncSale(sale, userId);
    } catch (e) { console.warn('[TickfyCRM] Hook error:', e.message); }

    // Envia WhatsApp se tiver telefone válido
    if (!phone) {
      console.log(`[TICKFY] TRN ${trnId} sem telefone, pulando envio`);
      continue;
    }

    // Busca template para o status
    const template = db.prepare(
      'SELECT * FROM tickfy_message_templates WHERE user_id = ? AND status_code = ? AND active = 1'
    ).get(userId, statusCode);

    if (!template || !template.message.trim()) {
      db.prepare('UPDATE tickfy_sales SET wa_sent = 3 WHERE id = ?').run(saleDbId);
      console.log(`[TICKFY] TRN ${trnId} sem template para status ${statusCode}`);
      continue;
    }

    if (getStatus(userId) !== 'connected') {
      db.prepare("UPDATE tickfy_sales SET wa_sent = 2, wa_error = 'WhatsApp não conectado' WHERE id = ?").run(saleDbId);
      console.log(`[TICKFY] WhatsApp não conectado, TRN ${trnId} marcado como falha`);
      continue;
    }

    const mensagem = applyTemplate(template.message, {
      nome: compradorNome,
      evento: eveName,
      valor: formatCurrency(rawValor),
      data: formatDate(rawData),
    });

    try {
      const result = await sendMessage(userId, phone, mensagem);
      db.prepare('UPDATE tickfy_sales SET wa_sent = 1, wa_msg_id = ? WHERE id = ?').run(result?.msgId || null, saleDbId);
      console.log(`[TICKFY] ✓ WhatsApp enviado para ${phone} (TRN ${trnId})`);
    } catch (err) {
      db.prepare('UPDATE tickfy_sales SET wa_sent = 2, wa_error = ? WHERE id = ?').run(err.message, saleDbId);
      console.error(`[TICKFY] ✗ Falha ao enviar WhatsApp TRN ${trnId}:`, err.message);
    }

    // Pequena pausa entre envios para não sobreacarregar
    await new Promise((r) => setTimeout(r, 1000));
  }

  // Atualiza o último TRN processado
  db.prepare('UPDATE tickfy_config SET last_trn_id = ? WHERE user_id = ?').run(currentId, userId);
  console.log(`[TICKFY] Polling finalizado. Último TRN: ${currentId}`);
}

// Exposta para diagnóstico — retorna JSON bruto da API
async function fetchPaymentRaw(linkSistema, apiKey, pagId) {
  return fetchPayment(linkSistema, apiKey, pagId);
}

module.exports = { runTickfyPoll, fetchPaymentRaw };
