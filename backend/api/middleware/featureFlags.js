import { listFlags, isFeatureEnabled } from '../../services/featureFlags.js';

/**
 * Attaches an `activeFlags` map to `req.user` so controllers can branch
 * without making individual flag lookups.
 *
 * Usage: app.use(attachFeatureFlags) — place after authMiddleware.
 *
 * req.user.activeFlags = { 'new-dashboard': true, 'beta-payments': false, ... }
 */
export async function attachFeatureFlags(req, _res, next) {
  try {
    if (!req.user) return next();
    const tenantId = req.tenant?.id || req.user.tenantId || null;
    const flags = await listFlags(tenantId);
    req.user.activeFlags = {};
    await Promise.all(
      flags.map(async (flag) => {
        req.user.activeFlags[flag.key] = await isFeatureEnabled(flag.key, {
          id: req.user.userId || req.user.id,
          tenantId,
        });
      }),
    );
  } catch {
    // Never block the request on a flag evaluation failure
  }
  next();
}

/**
 * Route-level middleware that gates access to a feature flag.
 * Returns 403 if the flag is not enabled for the requesting user.
 *
 * Usage: router.get('/beta', requireFeature('beta-feature'), controller.handler)
 */
export function requireFeature(flagKey) {
  return async (req, res, next) => {
    try {
      const tenantId = req.tenant?.id || req.user?.tenantId || null;
      const userId = req.user?.userId || req.user?.id;
      const enabled = await isFeatureEnabled(flagKey, { id: userId, tenantId });
      if (!enabled) {
        return res.status(403).json({ error: 'This feature is not available for your account.' });
      }
      next();
    } catch {
      next();
    }
  };
}
