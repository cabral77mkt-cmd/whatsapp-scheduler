const express = require('express');
const router = express.Router();
const db = require('../database');
const { runTickfyPoll } = require('../tickfy/poller');

const DEFAULT_TEMPLATES = [
  { status_code: 'PG', status_label: 'Pago', message: 'Olá {nome}! 🎉 Sua compra para *{evento}* foi confirmada no valor de *{valor}*. Até lá!' },
  { status_code: 'NP', status_label: 'Não Pago', message: 'Oi {nome}! Vimos que você começou a compra para *{evento}* mas não finalizou. Ainda tem ingressos disponíveis! 😊' },
  { status_code: 'EA', status_label: 'Em Análise', message: 'Olá {nome}! Seu pagamento para *{evento}* está em análise. Em breve você receberá a confirmação.' },
  { status_code: 'DV', status_label: 'Devolvido', message: 'Olá {nome}. O reembolso da sua compra para *{evento}* foi processado.' },
  { status_code: 'CA', status_label: 'Cancelado', message: 'Olá {nome}. Seu pedido para *{evento}* foi cancelado. Em caso de dúvidas, entre em contato.' },
];

function ensureConfig(userId) {
  const exists = db.prepare('SELECT id FROM tickfy_config WHERE user_id = ?').get(userId);
  if (!exists) {
    db.prepare('INSERT INTO tickfy_config (user_id) VALUES (?)').run(userId);
  }
}

function ensureTemplates(userId) {
  for (const t of DEFAULT_TEMPLATES) {
    const exists = db.prepare('SELECT id FROM tickfy_message_templates WHERE user_id = ? AND status_code = ?').get(userId, t.status_code);
    if (!exists) {
      db.prepare('INSERT INTO tickfy_message_templates (user_id, status_code, status_label, message) VALUES (?, ?, ?, ?)')
        .run(userId, t.status_code, t.status_label, t.message);
    }
  }
}

// GET /api/tickfy/config
router.get('/config', (req, res) => {
  const userId = Number(req.user.sub);
  ensureConfig(userId);
  const config = db.prepare('SELECT * FROM tickfy_config WHERE user_id = ?').get(userId);
  res.json(config);
});

// POST /api/tickfy/config
router.post('/config', (req, res) => {
  const userId = Number(req.user.sub);
  const { link_sistema, api_key, event_ids, last_trn_id, poll_interval, active } = req.body;

  ensureConfig(userId);

  const fields = [];
  const values = [];

  if (link_sistema !== undefined) { fields.push('link_sistema = ?'); values.push(link_sistema.trim()); }
  if (api_key !== undefined)      { fields.push('api_key = ?');      values.push(api_key.trim()); }
  if (event_ids !== undefined)    { fields.push('event_ids = ?');    values.push(JSON.stringify(event_ids)); }
  if (last_trn_id !== undefined)  { fields.push('last_trn_id = ?'); values.push(Number(last_trn_id)); }
  if (poll_interval !== undefined){ fields.push('poll_interval = ?'); values.push(Math.max(1, Math.min(60, Number(poll_interval)))); }
  if (active !== undefined)       { fields.push('active = ?');       values.push(active ? 1 : 0); }

  if (fields.length === 0) return res.status(400).json({ error: 'Nenhum campo enviado' });

  values.push(userId);
  db.prepare(`UPDATE tickfy_config SET ${fields.join(', ')} WHERE user_id = ?`).run(...values);

  const updated = db.prepare('SELECT * FROM tickfy_config WHERE user_id = ?').get(userId);
  res.json(updated);
});

// GET /api/tickfy/templates
router.get('/templates', (req, res) => {
  const userId = Number(req.user.sub);
  ensureTemplates(userId);
  const templates = db.prepare('SELECT * FROM tickfy_message_templates WHERE user_id = ? ORDER BY status_code').all(userId);
  res.json(templates);
});

// POST /api/tickfy/templates — cria ou atualiza um template
router.post('/templates', (req, res) => {
  const userId = Number(req.user.sub);
  const { status_code, status_label, message, active } = req.body;

  if (!status_code) return res.status(400).json({ error: 'status_code obrigatório' });

  const existing = db.prepare('SELECT id FROM tickfy_message_templates WHERE user_id = ? AND status_code = ?').get(userId, status_code);

  if (existing) {
    const fields = [];
    const values = [];
    if (message !== undefined)      { fields.push('message = ?');      values.push(message); }
    if (active !== undefined)       { fields.push('active = ?');        values.push(active ? 1 : 0); }
    if (status_label !== undefined) { fields.push('status_label = ?');  values.push(status_label); }
    if (fields.length > 0) {
      values.push(existing.id);
      db.prepare(`UPDATE tickfy_message_templates SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    }
  } else {
    const def = DEFAULT_TEMPLATES.find((t) => t.status_code === status_code) || {};
    db.prepare('INSERT INTO tickfy_message_templates (user_id, status_code, status_label, message, active) VALUES (?, ?, ?, ?, ?)')
      .run(userId, status_code, status_label || def.status_label || status_code, message || def.message || '', active !== undefined ? (active ? 1 : 0) : 1);
  }

  const updated = db.prepare('SELECT * FROM tickfy_message_templates WHERE user_id = ? AND status_code = ?').get(userId, status_code);
  res.json(updated);
});

// GET /api/tickfy/sales
router.get('/sales', (req, res) => {
  const userId = Number(req.user.sub);
  const { status, limit = 50, offset = 0 } = req.query;

  let query = 'SELECT * FROM tickfy_sales WHERE user_id = ?';
  const params = [userId];

  if (status) { query += ' AND status_code = ?'; params.push(status); }

  query += ' ORDER BY detected_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), parseInt(offset));

  const sales = db.prepare(query).all(...params);

  let countQuery = 'SELECT COUNT(*) as count FROM tickfy_sales WHERE user_id = ?';
  const countParams = [userId];
  if (status) { countQuery += ' AND status_code = ?'; countParams.push(status); }
  const total = db.prepare(countQuery).get(...countParams);

  res.json({ sales, total: total.count });
});

// POST /api/tickfy/sales/:id/resend — reenvia WhatsApp para uma venda
router.post('/sales/:id/resend', async (req, res) => {
  const userId = Number(req.user.sub);
  const saleId = parseInt(req.params.id);

  const sale = db.prepare('SELECT * FROM tickfy_sales WHERE id = ? AND user_id = ?').get(saleId, userId);
  if (!sale) return res.status(404).json({ error: 'Venda não encontrada' });
  if (!sale.comprador_telefone) return res.status(400).json({ error: 'Sem telefone para reenvio' });

  const template = db.prepare('SELECT * FROM tickfy_message_templates WHERE user_id = ? AND status_code = ? AND active = 1').get(userId, sale.status_code);
  if (!template || !template.message.trim()) return res.status(400).json({ error: 'Sem template ativo para este status' });

  const { sendMessage, getStatus } = require('../whatsapp/client');
  if (getStatus(userId) !== 'connected') return res.status(400).json({ error: 'WhatsApp não conectado' });

  function formatCurrency(value) {
    const num = parseFloat(value);
    if (isNaN(num)) return value || '';
    return 'R$ ' + num.toFixed(2).replace('.', ',');
  }

  const mensagem = template.message
    .replace(/\{nome\}/gi, sale.comprador_nome || '')
    .replace(/\{evento\}/gi, sale.evento || '')
    .replace(/\{valor\}/gi, formatCurrency(sale.valor))
    .replace(/\{data\}/gi, new Date(sale.detected_at).toLocaleDateString('pt-BR'));

  try {
    const result = await sendMessage(userId, sale.comprador_telefone, mensagem);
    db.prepare('UPDATE tickfy_sales SET wa_sent = 1, wa_msg_id = ?, wa_error = NULL WHERE id = ?').run(result?.msgId || null, saleId);
    res.json({ ok: true });
  } catch (err) {
    db.prepare('UPDATE tickfy_sales SET wa_sent = 2, wa_error = ? WHERE id = ?').run(err.message, saleId);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/tickfy/test?pag_id=X — testa a chamada bruta da API para um pag_id específico
router.get('/test', async (req, res) => {
  const userId = Number(req.user.sub);
  const pagId = parseInt(req.query.pag_id);

  if (!pagId) return res.status(400).json({ error: 'pag_id é obrigatório (?pag_id=8420)' });

  ensureConfig(userId);
  const config = db.prepare('SELECT * FROM tickfy_config WHERE user_id = ?').get(userId);

  if (!config.link_sistema || !config.api_key) {
    return res.status(400).json({ error: 'Configure LINK_SISTEMA e API_KEY antes de testar' });
  }

  const { fetchPaymentRaw } = require('../tickfy/poller');
  try {
    const raw = await fetchPaymentRaw(config.link_sistema, config.api_key, pagId);
    res.json({ pag_id: pagId, raw });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/tickfy/test-send — envia mensagem de teste para verificar se WhatsApp está funcionando
router.post('/test-send', async (req, res) => {
  const userId = Number(req.user.sub);
  const { phone, nome, evento, valor, status_code } = req.body;

  if (!phone) return res.status(400).json({ error: 'Telefone é obrigatório' });

  ensureTemplates(userId);

  const statusToUse = status_code || 'PG';
  const template = db.prepare('SELECT * FROM tickfy_message_templates WHERE user_id = ? AND status_code = ?').get(userId, statusToUse);

  const { sendMessage, getStatus } = require('../whatsapp/client');
  if (getStatus(userId) !== 'connected') {
    return res.status(400).json({ error: 'WhatsApp não está conectado. Conecte primeiro na página "Conectar".' });
  }

  function formatCurrency(value) {
    const num = parseFloat(String(value || '0').replace(',', '.'));
    if (isNaN(num)) return value || 'R$ 0,00';
    return 'R$ ' + num.toFixed(2).replace('.', ',');
  }

  const mensagem = template && template.message.trim()
    ? template.message
        .replace(/\{nome\}/gi, nome || 'Teste')
        .replace(/\{evento\}/gi, evento || 'Evento Teste')
        .replace(/\{valor\}/gi, formatCurrency(valor || '50'))
        .replace(/\{data\}/gi, new Date().toLocaleDateString('pt-BR'))
    : `[TESTE TICKFY] Olá ${nome || 'Teste'}! Esta é uma mensagem de teste do WhatsApp Scheduler.`;

  try {
    const result = await sendMessage(userId, phone, mensagem);
    res.json({ ok: true, msgId: result?.msgId || null, mensagem });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/tickfy/poll — polling manual
router.post('/poll', async (req, res) => {
  const userId = Number(req.user.sub);
  try {
    res.json({ ok: true, message: 'Polling iniciado' });
    // Executa em background
    runTickfyPoll(userId).catch((err) => console.error('[TICKFY] Erro no poll manual:', err.message));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
