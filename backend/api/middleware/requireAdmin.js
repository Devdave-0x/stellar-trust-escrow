/**
 * requireAdmin middleware
 *
 * Checks that req.user exists (auth middleware already ran) and that the
 * user carries the "Admin" role in their JWT claims.
 *
 * Usage:
 *   router.use(authMiddleware, requireAdmin);
 *
 * Accepts:
 *   - req.user.roles   (array)  — preferred (new tokens)
 *   - req.user.role    (string) — legacy single-role tokens
 *   - req.isAdmin      (bool)   — set by adminAuth (API-key path)
 */

export default function requireAdmin(req, res, next) {
  // Already authenticated via admin API key
  if (req.isAdmin) return next();

  const user = req.user;
  if (!user) return res.status(401).json({ error: 'Authentication required.' });

  const roles = user.roles ?? (user.role ? [user.role] : []);
  if (!roles.includes('Admin')) {
    return res.status(403).json({ error: 'Forbidden: Admin role required.' });
  }

  return next();
}
