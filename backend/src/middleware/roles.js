/**
 * Role-based access middleware
 *
 * Roles hierarchy (highest to lowest):
 *   admin   — full access, can manage users/config
 *   manager — read-only across all team pipeline, can set goals
 *   seller  — read/write own leads only
 *
 * Usage:
 *   const { requireRole } = require('./roles');
 *   router.get('/team', requireRole('manager'), handler);
 */

const ROLE_LEVELS = { admin: 3, manager: 2, seller: 1 };

/**
 * Requires the user to have at least `minRole` level.
 * Falls back to is_admin flag for legacy compatibility.
 */
function requireRole(minRole) {
  const minLevel = ROLE_LEVELS[minRole] ?? 1;
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado' });

    // Legacy: is_admin flag always grants full access
    if (req.user.isAdmin) return next();

    const userRole  = req.user.role || 'seller';
    const userLevel = ROLE_LEVELS[userRole] ?? 1;

    if (userLevel >= minLevel) return next();
    return res.status(403).json({ error: `Acesso negado — requer perfil: ${minRole}` });
  };
}

/**
 * Scope filter helper for lead queries:
 * returns a SQL fragment + params to restrict to own leads for sellers.
 */
function leadScopeFilter(req) {
  if (req.user?.isAdmin) return { sql: '', params: [] };
  const role = req.user?.role || 'seller';
  if (ROLE_LEVELS[role] >= ROLE_LEVELS.manager) return { sql: '', params: [] };
  // Seller: only own leads
  return {
    sql: ' AND (l.user_id = ? OR l.responsible_user_id = ?)',
    params: [req.user.sub, req.user.sub],
  };
}

module.exports = { requireRole, leadScopeFilter, ROLE_LEVELS };
