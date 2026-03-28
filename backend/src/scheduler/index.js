const cron = require('node-cron');
const db = require('../database');
const { sendMessage, sendMessageToGroup, getStatus } = require('../whatsapp/client');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function startScheduler() {
  // Verifica mensagens pendentes a cada minuto
  cron.schedule('* * * * *', async () => {
    if (getStatus() !== 'connected') return;

    const now = new Date().toISOString();

    const pendingMessages = db
      .prepare(
        `SELECT * FROM scheduled_messages
         WHERE status = 'pending' AND scheduled_at <= ?
         ORDER BY scheduled_at ASC`
      )
      .all(now);

    if (pendingMessages.length === 0) return;

    console.log(`[Scheduler] ${pendingMessages.length} mensagem(s) para enviar...`);

    for (const msg of pendingMessages) {
      try {
        const recipientType = msg.recipient_type || 'number';
        const recipientId = msg.recipient_id || msg.phone;

        if (recipientType === 'group') {
          await sendMessageToGroup(recipientId, msg.message);
          console.log(`[Scheduler] ✓ Mensagem ${msg.id} enviada para grupo ${recipientId}`);
        } else {
          await sendMessage(recipientId, msg.message);
          console.log(`[Scheduler] ✓ Mensagem ${msg.id} enviada para ${recipientId}`);
        }

        db.prepare(
          `UPDATE scheduled_messages SET status = 'sent', sent_at = ? WHERE id = ?`
        ).run(new Date().toISOString(), msg.id);
      } catch (err) {
        db.prepare(
          `UPDATE scheduled_messages SET status = 'failed', error_msg = ? WHERE id = ?`
        ).run(err.message, msg.id);

        console.error(`[Scheduler] ✗ Falha ao enviar mensagem ${msg.id}:`, err.message);
      }

      // Delay entre envios para evitar ban
      await sleep(1500);
    }
  });

  console.log('[Scheduler] Iniciado - verificando a cada minuto');
}

module.exports = { startScheduler };
