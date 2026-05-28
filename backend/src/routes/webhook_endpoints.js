/**
 * Outbound webhook endpoint management
 * GET    /api/webhooks/endpoints       — list own endpoints
 * POST   /api/webhooks/endpoints       — create
 * PATCH  /api/webhooks/endpoints/:id   — update (name/url/events/active)
 * DELETE /api/webhooks/endpoints/:id   — delete
 * POST   /api/webhooks/endpoints/:id/test — send a test ping
 */
const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');
const db      = require('../database');

const VALID_EVENTS = ['lead.created', 'stage.changed', 'proposal.sent', 'followup.due'];

router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT id, name, url, events, active, created_at
    FROM webhook_endpoints WHERE user_id = ? ORDER BY created_at DESC
  `).all(req.user.sub);
  res.json(rows);
});

router.post('/', (req, res) => {
  const { name, url, events = VALID_EVENTS.join(',') } = req.body;
  if (!name?.trim() || !url?.trim()) return res.status(400).json({ error: 'Nome e URL obrigatórios' });
  try { new URL(url); } catch { return res.status(400).json({ error: 'URL inválida' }); }

  const secret = crypto.randomBytes(20).toString('hex');
  const info = db.prepare(`
    INSERT INTO webhook_endpoints (user_id, name, url, events, secret)
    VALUES (?, ?, ?, ?, ?)
  `).run(Number(req.user.sub), name.trim(), url.trim(), events, secret);

  res.status(201).json({ id: info.lastInsertRowid, name: name.trim(), url, events, secret,
    note: 'Salve o secret agora — ele não será exibido novamente.' });
});

router.patch('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM webhook_endpoints WHERE id = ? AND user_id = ?')
    .get(Number(req.params.id), Number(req.user.sub));
  if (!row) return res.status(404).json({ error: 'Endpoint não encontrado' });

  const name   = req.body.name   ?? row.name;
  const url    = req.body.url    ?? row.url;
  const events = req.body.events ?? row.events;
  const active = req.body.active !== undefined ? (req.body.active ? 1 : 0) : row.active;

  db.prepare(`
    UPDATE webhook_endpoints SET name=?, url=?, events=?, active=? WHERE id=?
  `).run(name, url, events, active, row.id);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM webhook_endpoints WHERE id = ? AND user_id = ?')
    .run(Number(req.params.id), Number(req.user.sub));
  if (!result.changes) return res.status(404).json({ error: 'Endpoint não encontrado' });
  res.json({ ok: true });
});

// Test ping
router.post('/:id/test', async (req, res) => {
  const row = db.prepare('SELECT * FROM webhook_endpoints WHERE id = ? AND user_id = ?')
    .get(Number(req.params.id), Number(req.user.sub));
  if (!row) return res.status(404).json({ error: 'Endpoint não encontrado' });

  const { dispatch } = require('../webhooks/outbound');
  await dispatch(Number(req.user.sub), 'lead.created', {
    id: 0, name: 'Test Lead', stage: 'entrou_contato', test: true,
  });
  res.json({ ok: true, message: 'Ping enviado' });
});

module.exports = router;
