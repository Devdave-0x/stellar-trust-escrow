/**
 * API Usage Counter Middleware
 *
 * Increments a per-tenant, per-month Redis counter for every request that
 * resolved a tenant (see resolveTenant.js). Key format:
 *   tenant:{id}:api_calls:{year_month}
 *
 * A new key each month means counters reset naturally as INCR starts a
 * fresh key at 0; the scheduled job in lib/jobs/resetUsageCounters.js
 * cleans up stale prior-month keys.
 *
 * @module middleware/apiUsageCounter
 */

import redis from '../../lib/redis.js';

export function currentYearMonth(date = new Date()) {
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function usageCounterKey(tenantId, yearMonth = currentYearMonth()) {
  return `tenant:${tenantId}:api_calls:${yearMonth}`;
}

const apiUsageCounter = async (req, res, next) => {
  if (req.tenant) {
    try {
      await redis.incr(usageCounterKey(req.tenant.id));
    } catch (err) {
      // Counting is best-effort; never block the request on Redis being down.
      console.error('[apiUsageCounter] increment failed:', err.message);
    }
  }
  next();
};

export default apiUsageCounter;
