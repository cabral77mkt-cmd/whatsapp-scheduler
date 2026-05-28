/**
 * Multi-tenant middleware
 *
 * Garante que req.user.orgId está sempre setado (fallback = 1).
 * Use junto com authMiddleware:
 *
 *   app.use('/api/foo', authMiddleware, tenantMiddleware, fooRouter);
 *
 * Em queries de banco, sempre filtre por org_id = req.user.orgId.
 */
const db = require('../database');

function tenantMiddleware(req, _res, next) {
  if (!req.user) return next();

  // Se token não tem orgId (token antigo), busca do banco
  if (!req.user.orgId) {
    const row = db.prepare('SELECT org_id FROM users WHERE id = ?').get(req.user.sub);
    req.user.orgId = row?.org_id || 1;
  }
  next();
}

/**
 * Helper para queries: retorna fragmento SQL para filtrar por org_id.
 * Ex: `SELECT * FROM crm_leads WHERE 1=1 ${orgFilter(req, 'l.')}`
 */
function orgFilter(req, prefix = '') {
  return ` AND ${prefix}org_id = ${Number(req.user?.orgId) || 1}`;
}

/**
 * Retorna a org_id do request (com fallback seguro).
 */
function getOrgId(req) {
  return Number(req.user?.orgId) || 1;
}

module.exports = { tenantMiddleware, orgFilter, getOrgId };
