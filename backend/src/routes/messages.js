const express = require('express');
const router = express.Router();
const db = require('../database');
const { sendMessage, sendMessageToGroup, getStatus } = require('../whatsapp/client');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// GET /api/messages - listar todas as mensagens agendadas
router.get('/', (req, res) => {
  const { status, limit = 50, offset = 0 } = req.query;

  let query = 'SELECT * FROM scheduled_messages';
  const params = [];

  if (status) {
    query += ' WHERE status = ?';
    params.push(status);
  }

  query += ' ORDER BY scheduled_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), parseInt(offset));

  const messages = db.prepare(query).all(...params);
  const total = db.prepare('SELECT COUNT(*) as count FROM scheduled_messages' + (status ? ' WHERE status = ?' : '')).get(...(status ? [status] : []));

  res.json({ messages, total: total.count });
});

// GET /api/messages/stats - estatísticas
router.get('/stats', (req, res) => {
  const stats = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
    FROM scheduled_messages
  `).get();

  res.json(stats);
});

// POST /api/messages/schedule - agendar mensagem
router.post('/schedule', (req, res) => {
  const { phone, message, scheduled_at, contact_name, recipient_type, recipient_id, group_name } = req.body;

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

  // Valida que a data é futura
  if (new Date(scheduled_at) <= new Date()) {
    return res.status(400).json({ error: 'A data de agendamento deve ser no futuro' });
  }

  const finalPhone = type === 'number' ? phone.replace(/[^0-9]/g, '') : null;
  const finalRecipientId = type === 'group' ? recipient_id : finalPhone;
  const finalContactName = type === 'group' ? (group_name || recipient_id) : (contact_name || null);

  const result = db.prepare(
    `INSERT INTO scheduled_messages (phone, contact_name, message, scheduled_at, recipient_type, recipient_id)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(finalPhone, finalContactName, message, scheduled_at, type, finalRecipientId);

  const newMsg = db.prepare('SELECT * FROM scheduled_messages WHERE id = ?').get(Number(result.lastInsertRowid));
  res.status(201).json(newMsg);
});

// POST /api/messages/:id/send-now - enviar imediatamente
router.post('/:id/send-now', async (req, res) => {
  const msg = db.prepare('SELECT * FROM scheduled_messages WHERE id = ?').get(req.params.id);

  if (!msg) return res.status(404).json({ error: 'Mensagem não encontrada' });
  if (msg.status !== 'pending') return res.status(400).json({ error: 'Só é possível enviar mensagens pendentes' });
  if (getStatus() !== 'connected') return res.status(503).json({ error: 'WhatsApp não está conectado' });

  try {
    if (msg.recipient_type === 'group') {
      await sendMessageToGroup(msg.recipient_id, msg.message);
    } else {
      await sendMessage(msg.phone || msg.recipient_id, msg.message);
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
  const msg = db.prepare('SELECT * FROM scheduled_messages WHERE id = ?').get(req.params.id);

  if (!msg) return res.status(404).json({ error: 'Mensagem não encontrada' });
  if (msg.status !== 'pending') return res.status(400).json({ error: 'Só é possível cancelar mensagens pendentes' });

  db.prepare('DELETE FROM scheduled_messages WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Função reutilizável para rodar o loop de envio em massa
async function runBulkLoop(bulkId, phones, messagesArr, startIndex, delaySeconds, batchSize, batchDelaySeconds) {
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

    const phone = phones[i];
    const messageText = messagesArr[i % messagesArr.length];
    let phoneStatus = 'failed';

    // Se WhatsApp desconectou, aguarda até 60s pela reconexão
    if (getStatus() !== 'connected') {
      console.log(`[Bulk ${bulkId}] WhatsApp desconectado, aguardando reconexão...`);
      let waited = 0;
      while (getStatus() !== 'connected' && waited < 60) {
        await sleep(2000);
        waited += 2;
      }
      if (getStatus() !== 'connected') {
        console.log(`[Bulk ${bulkId}] Sem reconexão após 60s, pausando envio.`);
        db.prepare("UPDATE bulk_messages SET status = 'paused', paused_index = ? WHERE id = ?").run(i, bulkId);
        break;
      }
      console.log(`[Bulk ${bulkId}] Reconectado, retomando...`);
    }

    try {
      await sendMessage(phone, messageText);
      sent++;
      msgsThisBatch++;
      phoneStatus = 'sent';
      console.log(`[Bulk ${bulkId}] ✓ ${phone} (${sent}/${phones.length})`);
    } catch (err) {
      failed++;
      console.error(`[Bulk ${bulkId}] ✗ ${phone}:`, err.message);
    }

    try {
      const existingResults = JSON.parse(current.results || '[]');
      existingResults.push({ phone, status: phoneStatus });
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

  // Marca como concluído se terminou todo o loop
  const finalStatus = db.prepare('SELECT status FROM bulk_messages WHERE id = ?').get(bulkId);
  if (finalStatus && finalStatus.status === 'running') {
    db.prepare("UPDATE bulk_messages SET status = 'completed' WHERE id = ?").run(bulkId);
    console.log(`[Bulk ${bulkId}] Concluído: ${sent} enviados, ${failed} falhas`);
  }
}

// POST /api/messages/bulk - envio em massa imediato
router.post('/bulk', async (req, res) => {
  const { phones, messages, message, delaySeconds = 2, batchSize = 0, batchDelaySeconds = 30 } = req.body;

  // Suporta tanto array de mensagens quanto mensagem única
  const messagesArr = Array.isArray(messages) && messages.length > 0
    ? messages.filter((m) => m && m.trim())
    : [message];

  if (!phones || !Array.isArray(phones) || phones.length === 0 || messagesArr.length === 0 || !messagesArr[0]) {
    return res.status(400).json({ error: 'phones (array) e ao menos uma mensagem são obrigatórios' });
  }

  if (getStatus() !== 'connected') {
    return res.status(503).json({ error: 'WhatsApp não está conectado' });
  }

  const bulkResult = db.prepare(
    `INSERT INTO bulk_messages (phones, message, messages_json, total, status, results, paused_index, delay_seconds, batch_size, batch_delay_seconds)
     VALUES (?, ?, ?, ?, 'running', '[]', 0, ?, ?, ?)`
  ).run(JSON.stringify(phones), messagesArr[0], JSON.stringify(messagesArr), phones.length, delaySeconds, batchSize, batchDelaySeconds);

  const bulkId = Number(bulkResult.lastInsertRowid);

  res.status(202).json({ bulk_id: bulkId, total: phones.length, message: 'Envio em massa iniciado' });

  runBulkLoop(bulkId, phones, messagesArr, 0, delaySeconds, batchSize, batchDelaySeconds).catch(console.error);
});

// POST /api/messages/bulk/:id/pause - pausar envio em massa
router.post('/bulk/:id/pause', (req, res) => {
  const bulk = db.prepare('SELECT * FROM bulk_messages WHERE id = ?').get(req.params.id);
  if (!bulk) return res.status(404).json({ error: 'Envio não encontrado' });
  if (bulk.status !== 'running') return res.status(400).json({ error: 'Só é possível pausar envios em andamento' });
  db.prepare("UPDATE bulk_messages SET status = 'paused' WHERE id = ?").run(req.params.id);
  res.json({ success: true });
});

// POST /api/messages/bulk/:id/resume - continuar envio pausado
router.post('/bulk/:id/resume', (req, res) => {
  const bulk = db.prepare('SELECT * FROM bulk_messages WHERE id = ?').get(req.params.id);
  if (!bulk) return res.status(404).json({ error: 'Envio não encontrado' });
  if (bulk.status !== 'paused') return res.status(400).json({ error: 'Só é possível continuar envios pausados' });
  if (getStatus() !== 'connected') return res.status(503).json({ error: 'WhatsApp não está conectado' });

  const phones = JSON.parse(bulk.phones || '[]');
  const messagesArr = bulk.messages_json ? JSON.parse(bulk.messages_json) : [bulk.message];
  const startIndex = bulk.paused_index || 0;

  db.prepare("UPDATE bulk_messages SET status = 'running' WHERE id = ?").run(bulk.id);
  res.json({ success: true });

  runBulkLoop(Number(bulk.id), phones, messagesArr, startIndex,
    bulk.delay_seconds ?? 2, bulk.batch_size ?? 0, bulk.batch_delay_seconds ?? 30
  ).catch(console.error);
});

// DELETE /api/messages/bulk/:id - cancelar envio em massa
router.delete('/bulk/:id', (req, res) => {
  const bulk = db.prepare('SELECT * FROM bulk_messages WHERE id = ?').get(req.params.id);
  if (!bulk) return res.status(404).json({ error: 'Envio não encontrado' });
  if (!['running', 'pending'].includes(bulk.status)) {
    return res.status(400).json({ error: 'Só é possível cancelar envios em andamento' });
  }
  db.prepare("UPDATE bulk_messages SET status = 'cancelled' WHERE id = ?").run(req.params.id);
  res.json({ success: true });
});

// GET /api/messages/bulk - histórico de envios em massa
router.get('/bulk', (req, res) => {
  const bulks = db.prepare('SELECT * FROM bulk_messages ORDER BY created_at DESC LIMIT 20').all();
  res.json(bulks);
});

module.exports = router;
