'use strict';

const express  = require('express');
const router   = express.Router();
const db       = require('../database');
const commission = require('../crm/commissionService');

/* ── GET / — lista comissões ──────────────────────────────────────────── */
router.get('/', (req, res) => {
  const userId  = Number(req.user.sub);
  const isAdmin = req.user.isAdmin || req.user.role === 'manager';

  const { status, user_id: filterUser, from, to } = req.query;

  // Admin/manager vê todas; vendedor só as próprias
  const targetUser = isAdmin && filterUser ? Number(filterUser) : userId;

  let query = `
    SELECT c.*,
           COALESCE(u.display_name, u.username) AS seller_name,
           l.name  AS lead_name,
           l.phone AS lead_phone
    FROM crm_commissions c
    JOIN users u ON u.id = c.user_id
    JOIN crm_leads l ON l.id = c.lead_id
    WHERE 1=1
  `;
  const params = [];

  if (isAdmin && !filterUser) {
    // admin sem filtro: mostra todas do org
  } else {
    query += ' AND c.user_id = ?';
    params.push(targetUser);
  }

  if (status) { query += ' AND c.status = ?'; params.push(status); }
  if (from)   { query += ' AND DATE(c.created_at) >= ?'; params.push(from); }
  if (to)     { query += ' AND DATE(c.created_at) <= ?'; params.push(to); }

  query += ' ORDER BY c.created_at DESC LIMIT 200';

  const rows = db.prepare(query).all(...params);
  res.json(rows);
});

/* ── PATCH /:id/pay — marca como pago (admin/manager) ────────────────── */
router.patch('/:id/pay', (req, res) => {
  if (!req.user.isAdmin && req.user.role !== 'manager') {
    return res.status(403).json({ error: 'Sem permissão' });
  }
  const id = Number(req.params.id);
  const row = db.prepare('SELECT * FROM crm_commissions WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'Comissão não encontrada' });
  if (row.status === 'paid') return res.json({ ok: true, already: true });

  db.prepare(`
    UPDATE crm_commissions SET status = 'paid', paid_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(id);
  res.json({ ok: true });
});

/* ── GET /config — config de percentual ──────────────────────────────── */
router.get('/config', (req, res) => {
  const userId = Number(req.user.sub);

  // Config do próprio usuário
  const personal = db.prepare(`
    SELECT * FROM crm_commission_config WHERE user_id = ?
  `).get(userId);

  // Config global (fallback)
  const global_ = db.prepare(`
    SELECT * FROM crm_commission_config WHERE user_id = 0
  `).get();

  // Se admin, retorna configs de todos os vendedores
  const isAdmin = req.user.isAdmin || req.user.role === 'manager';
  let sellerConfigs = [];
  if (isAdmin) {
    sellerConfigs = db.prepare(`
      SELECT cc.*, COALESCE(u.display_name, u.username) AS seller_name
      FROM crm_commission_config cc
      JOIN users u ON u.id = cc.user_id
      WHERE cc.user_id != 0
      ORDER BY seller_name
    `).all();
  }

  res.json({
    personal:      personal  || { user_id: userId, percentage: 0, active: 0 },
    global:        global_   || { user_id: 0,      percentage: 0, active: 0 },
    seller_configs: sellerConfigs,
  });
});

/* ── PUT /config — salva config ──────────────────────────────────────── */
router.put('/config', (req, res) => {
  const userId  = Number(req.user.sub);
  const isAdmin = req.user.isAdmin || req.user.role === 'manager';

  const { percentage, active, target_user_id } = req.body;
  const pct    = parseFloat(percentage) || 0;
  const active_ = active ? 1 : 0;

  // Admin pode salvar para outro usuário ou para global (0)
  const uid = isAdmin && target_user_id !== undefined
    ? Number(target_user_id)
    : userId;

  db.prepare(`
    INSERT INTO crm_commission_config (user_id, org_id, percentage, active)
    VALUES (?, 1, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      percentage = excluded.percentage,
      active     = excluded.active
  `).run(uid, pct, active_);

  res.json({ ok: true });
});

/* ── GET /summary — resumo do vendedor ───────────────────────────────── */
router.get('/summary', (req, res) => {
  const userId   = Number(req.user.sub);
  const isAdmin  = req.user.isAdmin || req.user.role === 'manager';
  const queryUid = isAdmin && req.query.user_id
    ? Number(req.query.user_id)
    : userId;

  res.json(commission.getSummary(queryUid));
});

/* ── GET /leaderboard — ranking de comissões (admin) ─────────────────── */
router.get('/leaderboard', (req, res) => {
  if (!req.user.isAdmin && req.user.role !== 'manager') {
    return res.status(403).json({ error: 'Sem permissão' });
  }
  const monthStart = new Date().toISOString().slice(0, 8) + '01';

  const rows = db.prepare(`
    SELECT c.user_id,
           COALESCE(u.display_name, u.username) AS seller_name,
           COUNT(*)                                AS deals,
           SUM(c.commission_value)                AS total_commission,
           SUM(CASE WHEN DATE(c.created_at) >= ? THEN c.commission_value ELSE 0 END) AS this_month,
           SUM(CASE WHEN c.status = 'pending' THEN c.commission_value ELSE 0 END) AS pending,
           SUM(CASE WHEN c.status = 'paid'    THEN c.commission_value ELSE 0 END) AS paid
    FROM crm_commissions c
    JOIN users u ON u.id = c.user_id
    GROUP BY c.user_id
    ORDER BY this_month DESC
  `).all(monthStart);

  res.json(rows);
});

module.exports = router;
