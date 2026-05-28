/**
 * GET  /api/audit          — list audit log (admin only, paginated + filterable)
 * GET  /api/audit/entities — distinct entity types for filter dropdown
 * GET  /api/audit/users    — distinct user IDs with names for filter dropdown
 * DELETE /api/audit/purge  — purge entries older than N days (admin only)
 */
const express = require('express');
const router  = express.Router();
const db      = require('../database');
const adminMiddleware = require('../middleware/admin');

// All audit routes require admin
router.use(adminMiddleware);

/* ── List ── */
router.get('/', (req, res) => {
  const {
    entity_type, action, user_id, entity_id,
    from, to,
    page = 1, limit = 50,
  } = req.query;

  const conditions = [];
  const params     = [];

  if (entity_type) { conditions.push('a.entity_type = ?'); params.push(entity_type); }
  if (action)      { conditions.push('a.action = ?');      params.push(action); }
  if (user_id)     { conditions.push('a.user_id = ?');     params.push(Number(user_id)); }
  if (entity_id)   { conditions.push('a.entity_id = ?');   params.push(Number(entity_id)); }
  if (from)        { conditions.push('a.at >= ?');          params.push(from); }
  if (to)          { conditions.push('a.at <= ?');          params.push(to + ' 23:59:59'); }

  const where  = conditions.length ? ' WHERE ' + conditions.join(' AND ') : '';
  const offset = (Number(page) - 1) * Number(limit);

  const total = db.prepare(`SELECT COUNT(*) as n FROM audit_log a${where}`).get(...params)?.n || 0;
  const rows  = db.prepare(`
    SELECT a.*, u.username
    FROM audit_log a
    LEFT JOIN users u ON u.id = a.user_id
    ${where}
    ORDER BY a.at DESC
    LIMIT ? OFFSET ?
  `).all(...params, Number(limit), offset);

  res.json({ total, page: Number(page), limit: Number(limit), rows });
});

/* ── Distinct entity types ── */
router.get('/entities', (_req, res) => {
  const rows = db.prepare('SELECT DISTINCT entity_type FROM audit_log ORDER BY entity_type').all();
  res.json(rows.map(r => r.entity_type));
});

/* ── Distinct users ── */
router.get('/users', (_req, res) => {
  const rows = db.prepare(`
    SELECT DISTINCT a.user_id, u.username
    FROM audit_log a
    LEFT JOIN users u ON u.id = a.user_id
    WHERE a.user_id IS NOT NULL
    ORDER BY u.username
  `).all();
  res.json(rows);
});

/* ── Purge old entries ── */
router.delete('/purge', (req, res) => {
  const days = Number(req.query.days) || 90;
  const result = db.prepare(
    `DELETE FROM audit_log WHERE at < datetime('now', '-${days} days')`
  ).run();
  res.json({ deleted: result.changes });
});

module.exports = router;
