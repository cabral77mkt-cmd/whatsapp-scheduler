/**
 * API Key management
 * GET    /api/keys         — list own keys (hashed, prefix shown)
 * POST   /api/keys         — create new key (returns plaintext ONCE)
 * DELETE /api/keys/:id     — revoke key
 */
const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');
const db      = require('../database');

/* ── List keys ── */
router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT id, name, key_prefix, scopes, last_used_at, created_at, revoked_at
    FROM api_keys
    WHERE user_id = ?
    ORDER BY created_at DESC
  `).all(req.user.sub);
  res.json(rows);
});

/* ── Create key ── */
router.post('/', (req, res) => {
  const { name, scopes = 'leads:read' } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Nome obrigatório' });

  // Generate a 32-byte random key, base64url encoded
  const rawKey = crypto.randomBytes(32).toString('base64url');
  const prefix = rawKey.slice(0, 8);
  const hash   = crypto.createHash('sha256').update(rawKey).digest('hex');

  db.prepare(`
    INSERT INTO api_keys (user_id, name, key_hash, key_prefix, scopes)
    VALUES (?, ?, ?, ?, ?)
  `).run(Number(req.user.sub), name.trim(), hash, prefix, scopes);

  res.status(201).json({
    key: rawKey,          // returned ONCE — client must copy it now
    prefix,
    name: name.trim(),
    scopes,
    warning: 'Copie esta chave agora. Ela não será exibida novamente.',
  });
});

/* ── Revoke key ── */
router.delete('/:id', (req, res) => {
  const result = db.prepare(`
    UPDATE api_keys SET revoked_at = datetime('now')
    WHERE id = ? AND user_id = ? AND revoked_at IS NULL
  `).run(Number(req.params.id), Number(req.user.sub));
  if (!result.changes) return res.status(404).json({ error: 'Chave não encontrada' });
  res.json({ ok: true });
});

module.exports = router;

/* ── Exported helper for v1 auth middleware ── */
module.exports.authenticateApiKey = function authenticateApiKey(req, res, next) {
  const authHeader = req.headers['authorization'] || '';
  const key = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : req.query.api_key;
  if (!key) return res.status(401).json({ error: 'API key obrigatória' });

  const hash = crypto.createHash('sha256').update(key).digest('hex');
  const row  = db.prepare(`
    SELECT ak.*, u.id as uid, u.is_admin, u.role
    FROM api_keys ak
    JOIN users u ON u.id = ak.user_id
    WHERE ak.key_hash = ? AND ak.revoked_at IS NULL
  `).get(hash);

  if (!row) return res.status(401).json({ error: 'API key inválida ou revogada' });

  // Update last_used_at (async-ish — don't await)
  db.prepare("UPDATE api_keys SET last_used_at = datetime('now') WHERE id = ?").run(row.id);

  req.user = { sub: row.uid, isAdmin: !!row.is_admin, role: row.role, scopes: row.scopes };
  req.apiKeyScopes = (row.scopes || '').split(',').map(s => s.trim());
  next();
};
