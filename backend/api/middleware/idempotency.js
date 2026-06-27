/**
 * Idempotency Middleware
 *
 * Accepts an `Idempotency-Key` header on POST and PATCH requests.
 * Stores the response in Redis (or the in-memory fallback) with a 24-hour TTL.
 * On a duplicate request with the same key + endpoint, the cached response is
 * returned immediately without re-executing the route handler.
 * If a duplicate arrives while the first is still in-flight, a 409 Conflict
 * is returned.
 *
 * ## Usage
 *
 *   import idempotencyMiddleware from '../middleware/idempotency.js';
 *   // Mount globally on all POST/PATCH routes, or per-router:
 *   router.use(idempotencyMiddleware());
 *
 * ## Key format (stored in Redis / mem)
 *
 *   idempotency:<tenantId>:<method>:<path>:<Idempotency-Key>
 *
 * ## Stored value shape
 *
 *   { status: number, body: object, completedAt: ISO string }
 *
 * ## In-flight sentinel
 *
 *   idempotency:lock:<same-key>  — set to "1" for the duration of the handler
 *
 * @module middleware/idempotency
 */

import cache from '../../lib/cache.js';
import { createModuleLogger } from '../../config/logger.js';

const log = createModuleLogger('idempotency');

// 24-hour TTL in seconds
const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;
// In-flight lock TTL — short enough to self-heal on crash
const LOCK_TTL_SECONDS = 30;

/**
 * Build a namespaced Redis key for an idempotency entry.
 *
 * @param {import('express').Request} req
 * @returns {string}
 */
function buildKey(req) {
  const tenant = req.tenant?.id || req.tenant?.slug || 'global';
  const idempKey = req.headers['idempotency-key'];
  // Normalize path: strip trailing slash, lowercase
  const path = req.path.replace(/\/$/, '').toLowerCase();
  return `idempotency:${tenant}:${req.method}:${path}:${idempKey}`;
}

function buildLockKey(key) {
  return `idempotency:lock:${key}`;
}

/**
 * Returns an Express middleware that enforces idempotency for POST and PATCH
 * requests that supply an `Idempotency-Key` header.
 *
 * Requests without the header pass through unchanged (backwards compatible).
 *
 * @returns {import('express').RequestHandler}
 */
export function idempotencyMiddleware() {
  return async (req, res, next) => {
    // Only apply to mutating methods
    if (req.method !== 'POST' && req.method !== 'PATCH') return next();

    const idempKey = req.headers['idempotency-key'];
    if (!idempKey || typeof idempKey !== 'string' || !idempKey.trim()) {
      // No key supplied — pass through (not required, just supported)
      return next();
    }

    const key = buildKey(req);
    const lockKey = buildLockKey(key);

    try {
      // ── Check for a completed cached response ──────────────────────────────
      const cached = await cache.get(key);
      if (cached !== null && cached !== undefined) {
        log.debug({ message: 'idempotency_cache_hit', key });
        res.setHeader('Idempotency-Key', idempKey);
        res.setHeader('X-Idempotency-Replayed', 'true');
        return res.status(cached.status).json(cached.body);
      }

      // ── Check for an in-flight lock ────────────────────────────────────────
      const locked = await cache.get(lockKey);
      if (locked) {
        log.warn({ message: 'idempotency_in_flight', key });
        return res.status(409).json({
          error: 'A request with this Idempotency-Key is already being processed. Retry after a moment.',
          code: 'IDEMPOTENCY_IN_FLIGHT',
        });
      }

      // ── Acquire in-flight lock ─────────────────────────────────────────────
      await cache.set(lockKey, '1', LOCK_TTL_SECONDS);

      // ── Intercept res.json to cache the response ───────────────────────────
      const originalJson = res.json.bind(res);
      res.json = async (body) => {
        // Release lock and cache the response only on success
        await cache.invalidate(lockKey).catch(() => null);

        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            await cache.set(
              key,
              { status: res.statusCode, body, completedAt: new Date().toISOString() },
              IDEMPOTENCY_TTL_SECONDS,
            );
            log.debug({ message: 'idempotency_cached', key, status: res.statusCode });
          } catch (cacheErr) {
            log.warn({ message: 'idempotency_cache_write_failed', key, error: cacheErr.message });
          }
        } else {
          // Non-2xx responses are not cached so the client can retry with corrections
          await cache.invalidate(key).catch(() => null);
        }

        res.setHeader('Idempotency-Key', idempKey);
        return originalJson(body);
      };

      next();
    } catch (err) {
      log.error({ message: 'idempotency_middleware_error', key, error: err.message });
      // Release lock if anything went wrong before the handler ran
      await cache.invalidate(lockKey).catch(() => null);
      next(err);
    }
  };
}

export default idempotencyMiddleware;
