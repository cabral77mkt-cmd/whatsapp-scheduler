/**
 * GET  /api/user-settings           — lê configurações do usuário logado
 * PUT  /api/user-settings           — atualiza configurações
 *
 * Inclui número de telefone para notificações WhatsApp (Resgatador Diário).
 */
const express = require('express');
const router  = express.Router();
const db      = require('../database');
const { getOrgId } = require('../middleware/tenant');

const DEFAULT_SETTINGS = {
  notification_phone:  null,
  rescue_enabled:      1,
  rescue_time:         '08:00',
  rescue_via_whatsapp: 1,
  rescue_via_push:     1,
  rescue_max_items:    10,
};

router.get('/', (req, res) => {
  const userId = Number(req.user.sub);
  let row = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(userId);
  if (!row) {
    // Cria settings padrão se não existir
    db.prepare(`
      INSERT INTO user_settings
        (user_id, org_id, notification_phone, rescue_enabled, rescue_time, rescue_via_whatsapp, rescue_via_push, rescue_max_items)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(userId, getOrgId(req), null, 1, '08:00', 1, 1, 10);
    row = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(userId);
  }
  res.json(row);
});

router.put('/', (req, res) => {
  const userId = Number(req.user.sub);
  const b = req.body || {};

  // Sanitiza notification_phone (só dígitos)
  const phone = b.notification_phone
    ? String(b.notification_phone).replace(/[^0-9]/g, '')
    : null;

  const current = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(userId);

  if (!current) {
    db.prepare(`
      INSERT INTO user_settings
        (user_id, org_id, notification_phone, rescue_enabled, rescue_time,
         rescue_via_whatsapp, rescue_via_push, rescue_max_items)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId,
      getOrgId(req),
      phone,
      b.rescue_enabled      !== undefined ? (b.rescue_enabled      ? 1 : 0) : 1,
      b.rescue_time         || '08:00',
      b.rescue_via_whatsapp !== undefined ? (b.rescue_via_whatsapp ? 1 : 0) : 1,
      b.rescue_via_push     !== undefined ? (b.rescue_via_push     ? 1 : 0) : 1,
      b.rescue_max_items    || 10,
    );
  } else {
    db.prepare(`
      UPDATE user_settings SET
        notification_phone   = ?,
        rescue_enabled       = ?,
        rescue_time          = ?,
        rescue_via_whatsapp  = ?,
        rescue_via_push      = ?,
        rescue_max_items     = ?,
        updated_at           = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `).run(
      phone !== undefined ? phone : current.notification_phone,
      b.rescue_enabled      !== undefined ? (b.rescue_enabled      ? 1 : 0) : current.rescue_enabled,
      b.rescue_time         || current.rescue_time,
      b.rescue_via_whatsapp !== undefined ? (b.rescue_via_whatsapp ? 1 : 0) : current.rescue_via_whatsapp,
      b.rescue_via_push     !== undefined ? (b.rescue_via_push     ? 1 : 0) : current.rescue_via_push,
      b.rescue_max_items    || current.rescue_max_items,
      userId,
    );
  }

  const updated = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(userId);
  res.json(updated);
});

/* ── POST /test-notification — envia ping de teste no número configurado ── */
router.post('/test-notification', async (req, res) => {
  const userId = Number(req.user.sub);
  const row = db.prepare('SELECT notification_phone FROM user_settings WHERE user_id = ?').get(userId);
  if (!row?.notification_phone) {
    return res.status(400).json({ error: 'Configure um número antes' });
  }
  try {
    const { sendMessage } = require('../whatsapp/client');
    await sendMessage(userId, row.notification_phone, '🔔 Teste de notificação do Resgatador Diário — tudo certo!');
    res.json({ ok: true, sent_to: row.notification_phone });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
