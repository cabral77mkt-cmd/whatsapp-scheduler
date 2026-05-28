/**
 * Audit middleware factory
 * Usage: router.put('/:id', auditMiddleware('crm_lead', 'update'), handler)
 *
 * Automatically logs changes to audit_log table.
 * Attaches `req.auditLog(before, after)` helper for handlers that want explicit control.
 */
const db = require('../database');

/**
 * Returns an Express middleware that records an audit entry.
 * @param {string} entityType  - e.g. 'crm_lead', 'crm_proposal'
 * @param {string} action      - e.g. 'create', 'update', 'delete', 'stage_change'
 * @param {Function} [getEntityId]  - optional fn(req) to extract entity id
 */
function auditMiddleware(entityType, action, getEntityId) {
  return (req, _res, next) => {
    // Attach helper so the handler can log with before/after snapshots
    req.auditLog = (before, after) => {
      try {
        const entityId = getEntityId ? getEntityId(req) : (req.params.id || null);
        db.prepare(`
          INSERT INTO audit_log (user_id, entity_type, entity_id, action, before_json, after_json, ip)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          req.user?.sub || null,
          entityType,
          entityId ? Number(entityId) : null,
          action,
          before ? JSON.stringify(before) : null,
          after  ? JSON.stringify(after)  : null,
          req.ip || req.headers['x-forwarded-for'] || null
        );
      } catch (e) {
        console.error('[Audit] Failed to write audit log:', e.message);
      }
    };
    next();
  };
}

/**
 * Convenience: log without a middleware (call directly from route handler).
 */
function logAudit({ userId, entityType, entityId, action, before, after, ip }) {
  try {
    db.prepare(`
      INSERT INTO audit_log (user_id, entity_type, entity_id, action, before_json, after_json, ip)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId || null,
      entityType,
      entityId || null,
      action,
      before ? JSON.stringify(before) : null,
      after  ? JSON.stringify(after)  : null,
      ip || null
    );
  } catch (e) {
    console.error('[Audit] Failed to write audit log:', e.message);
  }
}

module.exports = { auditMiddleware, logAudit };
