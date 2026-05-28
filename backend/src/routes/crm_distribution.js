'use strict';

const express = require('express');
const router  = express.Router();
const db      = require('../database');

/* ── GET /config — config + membros ──────────────────────────────────── */
router.get('/config', (req, res) => {
  const userId = Number(req.user.sub);

  const config = db.prepare(`
    SELECT * FROM crm_distribution_config WHERE owner_user_id = ?
  `).get(userId) || {
    owner_user_id: userId, enabled: 0,
    strategy: 'round_robin', max_leads_per_seller: 50,
  };

  const members = db.prepare(`
    SELECT dm.*, u.username, u.display_name,
      (SELECT COUNT(*) FROM crm_leads l
       WHERE l.responsible_user_id = dm.member_user_id
         AND l.stage NOT IN ('fechado','perdido')) AS active_leads
    FROM crm_distribution_members dm
    JOIN users u ON u.id = dm.member_user_id
    WHERE dm.owner_user_id = ?
    ORDER BY dm.active DESC, dm.total_assigned ASC
  `).all(userId);

  // Candidatos (todos os users exceto o próprio admin)
  const candidates = db.prepare(`
    SELECT id, username, display_name, role FROM users WHERE id != ? ORDER BY display_name, username
  `).all(userId);

  res.json({ config, members, candidates });
});

/* ── PUT /config — salva config ──────────────────────────────────────── */
router.put('/config', (req, res) => {
  const userId = Number(req.user.sub);
  const { enabled, strategy, max_leads_per_seller } = req.body;

  db.prepare(`
    INSERT INTO crm_distribution_config
      (owner_user_id, org_id, enabled, strategy, max_leads_per_seller, updated_at)
    VALUES (?, 1, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(owner_user_id) DO UPDATE SET
      enabled              = excluded.enabled,
      strategy             = excluded.strategy,
      max_leads_per_seller = excluded.max_leads_per_seller,
      updated_at           = CURRENT_TIMESTAMP
  `).run(
    userId,
    enabled ? 1 : 0,
    ['round_robin', 'capacity'].includes(strategy) ? strategy : 'round_robin',
    Number(max_leads_per_seller) || 50,
  );
  res.json({ ok: true });
});

/* ── POST /members — adicionar membro ────────────────────────────────── */
router.post('/members', (req, res) => {
  const userId = Number(req.user.sub);
  const { member_user_id } = req.body;
  if (!member_user_id) return res.status(400).json({ error: 'member_user_id obrigatório' });
  if (Number(member_user_id) === userId) return res.status(400).json({ error: 'Não pode adicionar a si mesmo' });

  // Garante que a config existe
  db.prepare(`
    INSERT OR IGNORE INTO crm_distribution_config (owner_user_id, org_id) VALUES (?, 1)
  `).run(userId);

  try {
    db.prepare(`
      INSERT INTO crm_distribution_members (owner_user_id, member_user_id, org_id)
      VALUES (?, ?, 1)
      ON CONFLICT(owner_user_id, member_user_id) DO UPDATE SET active = 1
    `).run(userId, Number(member_user_id));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ── DELETE /members/:memberId — remover membro ─────────────────────── */
router.delete('/members/:memberId', (req, res) => {
  const userId   = Number(req.user.sub);
  const memberId = Number(req.params.memberId);
  db.prepare(`
    DELETE FROM crm_distribution_members WHERE owner_user_id = ? AND member_user_id = ?
  `).run(userId, memberId);
  res.json({ ok: true });
});

/* ── PATCH /members/:memberId/toggle — ativar/desativar membro ───────── */
router.patch('/members/:memberId/toggle', (req, res) => {
  const userId   = Number(req.user.sub);
  const memberId = Number(req.params.memberId);
  const member = db.prepare(`
    SELECT * FROM crm_distribution_members WHERE owner_user_id = ? AND member_user_id = ?
  `).get(userId, memberId);
  if (!member) return res.status(404).json({ error: 'Membro não encontrado' });
  db.prepare(`
    UPDATE crm_distribution_members SET active = ? WHERE owner_user_id = ? AND member_user_id = ?
  `).run(member.active ? 0 : 1, userId, memberId);
  res.json({ ok: true, active: !member.active });
});

/* ── GET /stats — estatísticas de distribuição ───────────────────────── */
router.get('/stats', (req, res) => {
  const userId = Number(req.user.sub);
  const stats = db.prepare(`
    SELECT dm.member_user_id,
           COALESCE(u.display_name, u.username) AS name,
           dm.total_assigned,
           dm.last_assigned_at,
           dm.active,
           (SELECT COUNT(*) FROM crm_leads l
            WHERE l.responsible_user_id = dm.member_user_id
              AND l.stage NOT IN ('fechado','perdido')) AS active_leads,
           (SELECT COUNT(*) FROM crm_leads l
            WHERE l.responsible_user_id = dm.member_user_id
              AND l.stage = 'fechado') AS closed_leads
    FROM crm_distribution_members dm
    JOIN users u ON u.id = dm.member_user_id
    WHERE dm.owner_user_id = ?
    ORDER BY dm.total_assigned DESC
  `).all(userId);
  res.json(stats);
});

module.exports = router;
