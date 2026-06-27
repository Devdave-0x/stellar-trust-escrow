/**
 * Metrics Routes
 *
 * GET /metrics — Prometheus text format
 *
 * Access control (either condition satisfies):
 *   1. Request originates from an internal network CIDR (10/8, 172.16/12, 192.168/16, ::1, 127/8)
 *   2. Authorization: Bearer <METRICS_TOKEN> header matches the configured token
 *
 * If METRICS_TOKEN is unset AND the request is not from an internal IP, access is denied.
 * If METRICS_TOKEN is unset AND the request IS from an internal IP, access is allowed.
 */

import express from 'express';
import { createClient } from 'redis';
import { register, cacheSize, redisMemoryUsageBytes } from '../../lib/metrics.js';
import cache from '../../lib/cache.js';

const router = express.Router();

// ── Internal network detection ────────────────────────────────────────────────

const INTERNAL_RANGES = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^::1$/,
  /^fc[0-9a-f]{2}:/i, // ULA IPv6
];

function isInternalIp(ip) {
  if (!ip) return false;
  // Strip IPv6-mapped IPv4 prefix
  const addr = ip.replace(/^::ffff:/, '');
  return INTERNAL_RANGES.some((re) => re.test(addr));
}

function metricsAuth(req, res, next) {
  const token = process.env.METRICS_TOKEN;
  const clientIp = req.ip || req.socket?.remoteAddress;

  // Internal network always allowed
  if (isInternalIp(clientIp)) return next();

  // Bearer token check for external callers
  if (token && req.headers.authorization === `Bearer ${token}`) return next();

  res.status(401).json({ error: 'Unauthorized' });
}

// ── Lazy Redis client for INFO scraping (reuses REDIS_URL if available) ───────

let _redis = null;

function getRedisClient() {
  if (_redis) return _redis;
  if (!process.env.REDIS_URL) return null;
  _redis = createClient({ url: process.env.REDIS_URL });
  _redis.on('error', () => {}); // suppress unhandled error events
  _redis.connect().catch(() => {});
  return _redis;
}

async function scrapeRedisMemory() {
  const redis = getRedisClient();
  if (!redis?.isReady) return;
  try {
    const info = await redis.info('memory');
    const match = info.match(/used_memory:(\d+)/);
    if (match) redisMemoryUsageBytes.set(parseInt(match[1], 10));
  } catch {
    // non-fatal — gauge stays at last known value
  }
}

// ── GET /metrics ──────────────────────────────────────────────────────────────

router.get('/', metricsAuth, async (_req, res) => {
  try {
    cacheSize.set(cache.size());
    await scrapeRedisMemory();

    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (err) {
    res.status(500).end(err.message);
  }
});

export default router;
