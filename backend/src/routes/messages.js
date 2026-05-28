const express = require('express');
const router = express.Router();
const db = require('../database');
const { sendMessage, sendMessageToGroup, getStatus } = require('../whatsapp/client');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Fix #7 — normaliza número (adiciona DDI 55 se ausente)
function normalizePhone(phone) {
  const digits = phone.replace(/[^0-9]/g, '');
  if (digits.length === 10 || digits.length === 11) {
    return '55' + digits;
  }
  return digits;
}

// GET /api/messages - listar todas as mensagens agendadas
router.get('/', (req, res) => {
  const { status, limit = 50, offset = 0 } = req.query;
  const userId = Number(req.user.sub);

  let query = 'SELECT * FROM scheduled_messages WHERE user_id = ?';
  const params = [userId];

  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }

  query += ' ORDER BY scheduled_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), parseInt(offset));

  const messages = db.prepare(query).all(...params);
  const countParams = [userId];
  let countQuery = 'SELECT COUNT(*) as count FROM scheduled_messages WHERE user_id = ?';
  if (status) { countQuery += ' AND status = ?'; countParams.push(status); }
  const total = db.prepare(countQuery).get(...countParams);

  res.json({ messages, total: total.count });
});

// GET /api/messages/stats - estatísticas
router.get('/stats', (req, res) => {
  const userId = Number(req.user.sub);
  const stats = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
    FROM scheduled_messages WHERE user_id = ?
  `).get(userId);

  res.json(stats);
});

// POST /api/messages/schedule - agendar mensagem
router.post('/schedule', (req, res) => {
  const { phone, message, scheduled_at, contact_name, recipient_type, recipient_id, group_name } = req.body;
  const userId = Number(req.user.sub);

  const type = recipient_type || 'number';

  if (type === 'group') {
    if (!recipient_id || !message || !scheduled_at) {
      return res.status(400).json({ error: 'recipient_id, message e scheduled_at são obrigatórios para grupos' });
    }
  } else {
    if (!phone || !message || !scheduled_at) {
      return res.status(400).json({ error: 'phone, message e scheduled_at são obrigatórios' });
    }
  }

  if (new Date(scheduled_at) <= new Date()) {
    return res.status(400).json({ error: 'A data de agendamento deve ser no futuro' });
  }

  const finalPhone = type === 'number' ? normalizePhone(phone) : null;
  const finalRecipientId = type === 'group' ? recipient_id : finalPhone;
  const finalContactName = type === 'group' ? (group_name || recipient_id) : (contact_name || null);

  const result = db.prepare(
    `INSERT INTO scheduled_messages (phone, contact_name, message, scheduled_at, recipient_type, recipient_id, user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(finalPhone, finalContactName, message, scheduled_at, type, finalRecipientId, userId);

  const newMsg = db.prepare('SELECT * FROM scheduled_messages WHERE id = ?').get(Number(result.lastInsertRowid));
  res.status(201).json(newMsg);
});

// POST /api/messages/:id/send-now - enviar imediatamente
router.post('/:id/send-now', async (req, res) => {
  const userId = Number(req.user.sub);
  const msg = db.prepare('SELECT * FROM scheduled_messages WHERE id = ? AND user_id = ?').get(req.params.id, userId);

  if (!msg) return res.status(404).json({ error: 'Mensagem não encontrada' });
  if (msg.status !== 'pending') return res.status(400).json({ error: 'Só é possível enviar mensagens pendentes' });
  if (getStatus(userId) !== 'connected') return res.status(503).json({ error: 'WhatsApp não está conectado' });

  try {
    if (msg.recipient_type === 'group') {
      await sendMessageToGroup(userId, msg.recipient_id, msg.message);
    } else {
      await sendMessage(userId, msg.phone || msg.recipient_id, msg.message);
    }

    db.prepare(
      "UPDATE scheduled_messages SET status = 'sent', sent_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).run(msg.id);

    res.json({ success: true });
  } catch (err) {
    db.prepare(
      "UPDATE scheduled_messages SET status = 'failed', error_msg = ? WHERE id = ?"
    ).run(err.message, msg.id);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/messages/:id - cancelar agendamento
router.delete('/:id', (req, res) => {
  const userId = Number(req.user.sub);
  const msg = db.prepare('SELECT * FROM scheduled_messages WHERE id = ? AND user_id = ?').get(req.params.id, userId);

  if (!msg) return res.status(404).json({ error: 'Mensagem não encontrada' });
  if (msg.status !== 'pending') return res.status(400).json({ error: 'Só é possível cancelar mensagens pendentes' });

  db.prepare('DELETE FROM scheduled_messages WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Função reutilizável para rodar o loop de envio em massa
async function runBulkLoop(userId, bulkId, phones, messagesArr, startIndex, delaySeconds, batchSize, batchDelaySeconds) {
  const bulkStart = db.prepare('SELECT sent, failed FROM bulk_messages WHERE id = ?').get(bulkId);
  let sent = bulkStart ? bulkStart.sent : 0;
  let failed = bulkStart ? bulkStart.failed : 0;
  let msgsThisBatch = 0;

  for (let i = startIndex; i < phones.length; i++) {
    const current = db.prepare('SELECT status, results FROM bulk_messages WHERE id = ?').get(bulkId);
    if (!current) break;

    if (current.status === 'cancelled') {
      console.log(`[Bulk ${bulkId}] Cancelado no índice ${i}`);
      break;
    }

    if (current.status === 'paused') {
      console.log(`[Bulk ${bulkId}] Pausado no índice ${i}`);
      db.prepare('UPDATE bulk_messages SET paused_index = ? WHERE id = ?').run(i, bulkId);
      break;
    }

    const phone = normalizePhone(phones[i]);
    const messageText = messagesArr[i % messagesArr.length];
    let phoneStatus = 'failed';

    if (getStatus(userId) !== 'connected') {
      console.log(`[Bulk ${bulkId}] WhatsApp desconectado, aguardando reconexão...`);
      let waited = 0;
      while (getStatus(userId) !== 'connected' && waited < 60) {
        await sleep(2000);
        waited += 2;
      }
      if (getStatus(userId) !== 'connected') {
        console.log(`[Bulk ${bulkId}] Sem reconexão após 60s, pausando envio.`);
        db.prepare("UPDATE bulk_messages SET status = 'paused', paused_index = ? WHERE id = ?").run(i, bulkId);
        break;
      }
      console.log(`[Bulk ${bulkId}] Reconectado, retomando...`);
    }

    let msgId = null;
    try {
      const result = await sendMessage(userId, phone, messageText);
      msgId = result?.msgId || null;
      sent++;
      msgsThisBatch++;
      phoneStatus = 'sent';
      console.log(`[Bulk ${bulkId}] ✓ ${phone} (${sent}/${phones.length})`);
    } catch (err) {
      failed++;
      console.error(`[Bulk ${bulkId}] ✗ ${phone}:`, err.message);
    }

    try {
      db.prepare(
        'INSERT INTO delivery_tracking (bulk_id, phone, msg_id, wa_status) VALUES (?, ?, ?, ?)'
      ).run(bulkId, phone, msgId, phoneStatus === 'sent' ? 1 : 0);
    } catch (_) {}

    try {
      const existingResults = JSON.parse(current.results || '[]');
      existingResults.push({ phone, status: phoneStatus, msgId });
      db.prepare('UPDATE bulk_messages SET sent = ?, failed = ?, results = ? WHERE id = ?')
        .run(sent, failed, JSON.stringify(existingResults), bulkId);
    } catch (dbErr) {
      console.error(`[Bulk ${bulkId}] Erro DB:`, dbErr.message);
    }

    if (i < phones.length - 1) {
      if (batchSize > 0 && msgsThisBatch >= batchSize) {
        console.log(`[Bulk ${bulkId}] Pausa de lote: aguardando ${batchDelaySeconds}s...`);
        await sleep(batchDelaySeconds * 1000);
        msgsThisBatch = 0;
      } else {
        await sleep(delaySeconds * 1000);
      }
    }
  }

  const finalStatus = db.prepare('SELECT status FROM bulk_messages WHERE id = ?').get(bulkId);
  if (finalStatus && finalStatus.status === 'running') {
    db.prepare("UPDATE bulk_messages SET status = 'completed' WHERE id = ?").run(bulkId);
    console.log(`[Bulk ${bulkId}] Concluído: ${sent} enviados, ${failed} falhas`);
  }
}

// POST /api/messages/bulk - envio em massa imediato
router.post('/bulk', async (req, res) => {
  const { phones, messages, message, delaySeconds = 2, batchSize = 0, batchDelaySeconds = 30 } = req.body;
  const userId = Number(req.user.sub);

  const messagesArr = Array.isArray(messages) && messages.length > 0
    ? messages.filter((m) => m && m.trim())
    : [message];

  if (!phones || !Array.isArray(phones) || phones.length === 0 || messagesArr.length === 0 || !messagesArr[0]) {
    return res.status(400).json({ error: 'phones (array) e ao menos uma mensagem são obrigatórios' });
  }

  if (getStatus(userId) !== 'connected') {
    return res.status(503).json({ error: 'WhatsApp não está conectado' });
  }

  const bulkResult = db.prepare(
    `INSERT INTO bulk_messages (phones, message, messages_json, total, status, results, paused_index, delay_seconds, batch_size, batch_delay_seconds, user_id)
     VALUES (?, ?, ?, ?, 'running', '[]', 0, ?, ?, ?, ?)`
  ).run(JSON.stringify(phones), messagesArr[0], JSON.stringify(messagesArr), phones.length, delaySeconds, batchSize, batchDelaySeconds, userId);

  const bulkId = Number(bulkResult.lastInsertRowid);

  res.status(202).json({ bulk_id: bulkId, total: phones.length, message: 'Envio em massa iniciado' });

  runBulkLoop(userId, bulkId, phones, messagesArr, 0, delaySeconds, batchSize, batchDelaySeconds).catch(console.error);
});

// POST /api/messages/bulk/:id/pause - pausar envio em massa
router.post('/bulk/:id/pause', (req, res) => {
  const userId = Number(req.user.sub);
  const bulk = db.prepare('SELECT * FROM bulk_messages WHERE id = ? AND user_id = ?').get(req.params.id, userId);
  if (!bulk) return res.status(404).json({ error: 'Envio não encontrado' });
  if (bulk.status !== 'running') return res.status(400).json({ error: 'Só é possível pausar envios em andamento' });
  db.prepare("UPDATE bulk_messages SET status = 'paused' WHERE id = ?").run(req.params.id);
  res.json({ success: true });
});

// POST /api/messages/bulk/:id/resume - continuar envio pausado
router.post('/bulk/:id/resume', (req, res) => {
  const userId = Number(req.user.sub);
  const bulk = db.prepare('SELECT * FROM bulk_messages WHERE id = ? AND user_id = ?').get(req.params.id, userId);
  if (!bulk) return res.status(404).json({ error: 'Envio não encontrado' });
  if (bulk.status !== 'paused') return res.status(400).json({ error: 'Só é possível continuar envios pausados' });
  if (getStatus(userId) !== 'connected') return res.status(503).json({ error: 'WhatsApp não está conectado' });

  const phones = JSON.parse(bulk.phones || '[]');
  const messagesArr = bulk.messages_json ? JSON.parse(bulk.messages_json) : [bulk.message];
  const startIndex = bulk.paused_index || 0;

  db.prepare("UPDATE bulk_messages SET status = 'running' WHERE id = ?").run(bulk.id);
  res.json({ success: true });

  runBulkLoop(userId, Number(bulk.id), phones, messagesArr, startIndex,
    bulk.delay_seconds ?? 2, bulk.batch_size ?? 0, bulk.batch_delay_seconds ?? 30
  ).catch(console.error);
});

// DELETE /api/messages/bulk/:id - cancelar envio em massa
router.delete('/bulk/:id', (req, res) => {
  const userId = Number(req.user.sub);
  const bulk = db.prepare('SELECT * FROM bulk_messages WHERE id = ? AND user_id = ?').get(req.params.id, userId);
  if (!bulk) return res.status(404).json({ error: 'Envio não encontrado' });
  if (!['running', 'pending'].includes(bulk.status)) {
    return res.status(400).json({ error: 'Só é possível cancelar envios em andamento' });
  }
  db.prepare("UPDATE bulk_messages SET status = 'cancelled' WHERE id = ?").run(req.params.id);
  res.json({ success: true });
});

// GET /api/messages/bulk - histórico de envios em massa
router.get('/bulk', (req, res) => {
  const userId = Number(req.user.sub);
  const bulks = db.prepare('SELECT * FROM bulk_messages WHERE user_id = ? ORDER BY created_at DESC LIMIT 20').all(userId);
  res.json(bulks);
});

// GET /api/messages/bulk/:id/deliveries - status de entrega por contato
router.get('/bulk/:id/deliveries', (req, res) => {
  const userId = Number(req.user.sub);
  const bulk = db.prepare('SELECT * FROM bulk_messages WHERE id = ? AND user_id = ?').get(req.params.id, userId);
  if (!bulk) return res.status(404).json({ error: 'Envio não encontrado' });

  const deliveries = db.prepare(
    'SELECT phone, msg_id, wa_status, updated_at FROM delivery_tracking WHERE bulk_id = ? ORDER BY id ASC'
  ).all(req.params.id);

  const statusLabel = { 0: 'failed', 1: 'sent', 2: 'delivered', 3: 'read', 4: 'played' };
  const result = deliveries.map((d) => ({
    ...d,
    status_label: statusLabel[d.wa_status] || 'sent',
  }));

  res.json({ bulk_id: Number(req.params.id), total: bulk.total, deliveries: result });
});

// POST /api/messages/bulk/:id/resend-undelivered - reenviar para não entregues
router.post('/bulk/:id/resend-undelivered', async (req, res) => {
  const userId = Number(req.user.sub);
  if (getStatus(userId) !== 'connected') {
    return res.status(503).json({ error: 'WhatsApp não está conectado' });
  }

  const bulk = db.prepare('SELECT * FROM bulk_messages WHERE id = ? AND user_id = ?').get(req.params.id, userId);
  if (!bulk) return res.status(404).json({ error: 'Envio não encontrado' });

  const undelivered = db.prepare(
    'SELECT phone FROM delivery_tracking WHERE bulk_id = ? AND wa_status <= 1'
  ).all(req.params.id).map((r) => r.phone);

  if (undelivered.length === 0) {
    return res.status(400).json({ error: 'Nenhum contato sem entrega confirmada' });
  }

  const messagesArr = bulk.messages_json ? JSON.parse(bulk.messages_json) : [bulk.message];

  const newBulk = db.prepare(
    `INSERT INTO bulk_messages (phones, message, messages_json, total, status, results, paused_index, delay_seconds, batch_size, batch_delay_seconds, user_id)
     VALUES (?, ?, ?, ?, 'running', '[]', 0, ?, ?, ?, ?)`
  ).run(
    JSON.stringify(undelivered),
    messagesArr[0],
    JSON.stringify(messagesArr),
    undelivered.length,
    bulk.delay_seconds ?? 2,
    bulk.batch_size ?? 0,
    bulk.batch_delay_seconds ?? 30,
    userId,
  );

  const bulkId = Number(newBulk.lastInsertRowid);
  res.status(202).json({ bulk_id: bulkId, total: undelivered.length, message: 'Reenvio iniciado' });

  runBulkLoop(userId, bulkId, undelivered, messagesArr, 0,
    bulk.delay_seconds ?? 2, bulk.batch_size ?? 0, bulk.batch_delay_seconds ?? 30
  ).catch(console.error);
});

// POST /api/messages/check-phones - verifica status de entrega por número
router.post('/check-phones', (req, res) => {
  const { phones, message } = req.body;
  const userId = Number(req.user.sub);

  if (!phones || !Array.isArray(phones) || phones.length === 0) {
    return res.status(400).json({ error: 'phones (array) é obrigatório' });
  }

  const msgFilter = message && message.trim() ? `%${message.trim()}%` : null;

  const results = phones.map((raw) => {
    const phone = raw.replace(/[^0-9]/g, '').trim();
    if (!phone) return { phone: raw, sent: false, status_label: 'Número inválido', wa_status: null, sent_at: null };

    let record;
    if (msgFilter) {
      record = db.prepare(`
        SELECT dt.wa_status, dt.msg_id, dt.updated_at, dt.bulk_id, bm.created_at AS bulk_created_at
        FROM delivery_tracking dt
        JOIN bulk_messages bm ON bm.id = dt.bulk_id
        WHERE dt.phone = ? AND bm.user_id = ? AND (bm.message LIKE ? OR bm.messages_json LIKE ?)
        ORDER BY dt.id DESC LIMIT 1
      `).get(phone, userId, msgFilter, msgFilter);
    } else {
      record = db.prepare(`
        SELECT dt.wa_status, dt.msg_id, dt.updated_at, dt.bulk_id, bm.created_at AS bulk_created_at
        FROM delivery_tracking dt
        LEFT JOIN bulk_messages bm ON bm.id = dt.bulk_id
        WHERE dt.phone = ? AND bm.user_id = ?
        ORDER BY dt.id DESC LIMIT 1
      `).get(phone, userId);
    }

    if (record) {
      const sent = record.wa_status >= 1;
      const delivered = record.wa_status >= 2;
      const stuck = record.wa_status === 1;
      return {
        phone, sent, delivered, stuck,
        wa_status: record.wa_status,
        msg_id: record.msg_id,
        sent_at: record.bulk_created_at || record.updated_at,
        updated_at: record.updated_at,
        source: 'tracking',
        status_label: record.wa_status === 0 ? 'Falhou no envio'
          : record.wa_status === 1 ? 'Enviado (não confirmado pelo celular)'
          : record.wa_status === 2 ? 'Entregue ao celular'
          : record.wa_status === 3 ? 'Lido'
          : record.wa_status === 4 ? 'Reproduzido'
          : 'Enviado',
      };
    }

    let bulkQuery;
    if (msgFilter) {
      bulkQuery = db.prepare(`
        SELECT id, results, created_at FROM bulk_messages
        WHERE user_id = ? AND (message LIKE ? OR messages_json LIKE ?) AND results != '[]'
        ORDER BY id DESC
      `).all(userId, msgFilter, msgFilter);
    } else {
      bulkQuery = db.prepare(`
        SELECT id, results, created_at FROM bulk_messages
        WHERE user_id = ? AND results != '[]' ORDER BY id DESC
      `).all(userId);
    }

    for (const bulk of bulkQuery) {
      try {
        const resultArr = JSON.parse(bulk.results || '[]');
        const match = resultArr.find((r) => r.phone === phone);
        if (match) {
          const sent = match.status === 'sent';
          return {
            phone,
            sent,
            delivered: false,
            stuck: false,
            wa_status: sent ? 1 : 0,
            msg_id: match.msgId || null,
            sent_at: bulk.created_at,
            updated_at: bulk.created_at,
            source: 'results',
            status_label: sent ? 'Enviado (registro antigo, sem confirmação de entrega)' : 'Falhou no envio',
          };
        }
      } catch (_) {}
    }

    return { phone, sent: false, status_label: 'Sem registro de envio', wa_status: null, sent_at: null, source: 'not_found' };
  });

  res.json({ results });
});

module.exports = router;
