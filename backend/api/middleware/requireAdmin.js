/**
 * Require Admin Middleware
 *
 * Checks that the authenticated user has the Admin role.
 * Supports JWT role claims (req.user.roles or req.user.role) and
 * falls back to the legacy x-admin-api-key header for backward compatibility.
 */

const ADMIN_API_KEY = process.env.ADMIN_API_KEY;

export default function requireAdmin(req, res, next) {
  const user = req.user;

  if (!user) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  const roles = user.roles ?? (user.role ? [user.role] : []);
  const isAdminFromJwt = roles.some((r) => r === 'Admin' || r === 'admin');

  if (isAdminFromJwt) {
    return next();
  }

  if (ADMIN_API_KEY) {
    const providedKey = req.headers['x-admin-api-key'];
    if (providedKey && providedKey === ADMIN_API_KEY) {
      return next();
    }
  }

  return res.status(403).json({ error: 'Forbidden: Admin access required.' });
}
