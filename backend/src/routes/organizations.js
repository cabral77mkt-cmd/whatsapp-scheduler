/**
 * GET    /api/organizations         — lista orgs (super-admin only)
 * GET    /api/organizations/mine    — retorna org atual do usuário
 * POST   /api/organizations         — cria nova org (super-admin)
 * PUT    /api/organizations/:id     — atualiza org
 * POST   /api/organizations/:id/move-user/:uid — move user pra outra org
 */
const express = require('express');
const router  = express.Router();
const db      = require('../database');
const adminMiddleware = require('../middleware/admin');
const { getOrgId } = require('../middleware/tenant');

/* ── GET /mine — org do usuário logado ── */
router.get('/mine', (req, res) => {
  const orgId = getOrgId(req);
  const org = db.prepare('SELECT * FROM organizations WHERE id = ?').get(orgId);
  if (!org) return res.status(404).json({ error: 'Org não encontrada' });
  res.json(org);
});

/* ── PUT /mine — atualiza settings/name da própria org ── */
router.put('/mine', (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: 'Apenas admin pode editar a org' });
  const orgId = getOrgId(req);
  const { name, settings_json } = req.body || {};
  const current = db.prepare('SELECT * FROM organizations WHERE id = ?').get(orgId);
  if (!current) return res.status(404).json({ error: 'Org não encontrada' });

  db.prepare('UPDATE organizations SET name = ?, settings_json = ? WHERE id = ?').run(
    name || current.name,
    settings_json ? JSON.stringify(settings_json) : current.settings_json,
    orgId,
  );
  res.json(db.prepare('SELECT * FROM organizations WHERE id = ?').get(orgId));
});

/* Os endpoints abaixo são restritos ao super-admin (admin da org #1) */
router.use((req, res, next) => {
  if (!req.user.isAdmin || getOrgId(req) !== 1) {
    return res.status(403).json({ error: 'Apenas super-admin pode gerenciar orgs' });
  }
  next();
});

/* ── GET / — lista todas as orgs ── */
router.get('/', (_req, res) => {
  const rows = db.prepare(`
    SELECT o.*,
      (SELECT COUNT(*) FROM users u WHERE u.org_id = o.id) AS user_count,
      (SELECT COUNT(*) FROM crm_leads l WHERE l.org_id = o.id) AS lead_count
    FROM organizations o
    ORDER BY o.id ASC
  `).all();
  res.json(rows);
});

/* ── POST / — cria nova org ── */
router.post('/', (req, res) => {
  const { name, slug, plan = 'free' } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: 'Nome obrigatório' });
  const info = db.prepare('INSERT INTO organizations (name, slug, plan) VALUES (?, ?, ?)')
    .run(name.trim(), slug?.trim() || null, plan);
  res.status(201).json(db.prepare('SELECT * FROM organizations WHERE id = ?').get(info.lastInsertRowid));
});

/* ── PUT /:id — atualiza org específica ── */
router.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  const { name, slug, plan, settings_json } = req.body || {};
  const current = db.prepare('SELECT * FROM organizations WHERE id = ?').get(id);
  if (!current) return res.status(404).json({ error: 'Org não encontrada' });
  db.prepare('UPDATE organizations SET name = ?, slug = ?, plan = ?, settings_json = ? WHERE id = ?').run(
    name || current.name,
    slug !== undefined ? slug : current.slug,
    plan || current.plan,
    settings_json ? JSON.stringify(settings_json) : current.settings_json,
    id,
  );
  res.json(db.prepare('SELECT * FROM organizations WHERE id = ?').get(id));
});

/* ── POST /:id/move-user/:uid — move user pra outra org ── */
router.post('/:id/move-user/:uid', (req, res) => {
  const orgId = Number(req.params.id);
  const uid   = Number(req.params.uid);
  const org = db.prepare('SELECT id FROM organizations WHERE id = ?').get(orgId);
  if (!org) return res.status(404).json({ error: 'Org não encontrada' });
  db.prepare('UPDATE users SET org_id = ? WHERE id = ?').run(orgId, uid);
  res.json({ ok: true });
});

module.exports = router;
