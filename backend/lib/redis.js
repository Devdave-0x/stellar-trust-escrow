/**
 * Redis Client Singleton
 *
 * Backs tenant usage counters (Issue #222). Lazy-connects so the server can
 * still boot when Redis isn't configured; callers should handle rejected
 * commands gracefully (see api/middleware/apiUsageCounter.js).
 */

import Redis from 'ioredis';

const globalForRedis = globalThis;

const redis =
  globalForRedis.redis ??
  new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });

if (process.env.NODE_ENV !== 'production') {
  globalForRedis.redis = redis;
}

export default redis;
