const express = require('express');
const router  = express.Router();
const db      = require('../database');
const { getPublicKey } = require('../push/pushService');

/* GET /api/push/vapid-key — retorna chave pública VAPID */
router.get('/vapid-key', (req, res) => {
  const key = getPublicKey();
  if (!key) return res.status(503).json({ error: 'Push não configurado' });
  res.json({ publicKey: key });
});

/* POST /api/push/subscribe — salva subscription do browser */
router.post('/subscribe', (req, res) => {
  const userId = Number(req.user.sub);
  const { endpoint, keys } = req.body || {};
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return res.status(400).json({ error: 'Subscription inválida — endpoint, p256dh e auth obrigatórios' });
  }
  db.prepare(`
    INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, endpoint) DO UPDATE SET
      p256dh = excluded.p256dh,
      auth   = excluded.auth
  `).run(userId, endpoint, keys.p256dh, keys.auth);
  res.json({ ok: true });
});

/* DELETE /api/push/unsubscribe — remove subscription */
router.delete('/unsubscribe', (req, res) => {
  const userId = Number(req.user.sub);
  const { endpoint } = req.body || {};
  if (endpoint) {
    db.prepare('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?').run(userId, endpoint);
  }
  res.json({ ok: true });
});

/* POST /api/push/test — admin only, envia notificação de teste */
router.post('/test', (req, res) => {
  if (!req.user?.isAdmin) return res.status(403).json({ error: 'Apenas admins' });
  const userId = Number(req.user.sub);
  const { sendToUser } = require('../push/pushService');
  sendToUser(userId, {
    title: '🔔 Teste de Notificação',
    body:  'Push notifications funcionando! WA Scheduler está ativo.',
    url:   '/',
    tag:   'test',
  }).then(results => res.json({ ok: true, results }))
    .catch(err => res.status(500).json({ error: err.message }));
});

module.exports = router;
