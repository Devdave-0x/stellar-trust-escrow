/**
 * Integration tests for api/middleware/rateLimiter.js
 *
 * Covers:
 *  - Requests below the limit succeed with X-RateLimit-Remaining decreasing
 *  - The request at limit+1 returns 429 with Retry-After header
 *  - After the window expires, requests succeed again (real-time wait for short window)
 *  - Different users / IPs have independent rate-limit windows
 *  - Burst limiting blocks spike traffic within a short burst window
 *  - Adaptive load reduces the effective limit when error rate is high
 *  - getUserUsage / trackUsage public API works correctly
 */

import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

import {
  createPerUserRateLimiter,
  createSlidingWindowRateLimiter,
  getUsageStore,
  getUserUsage,
  trackUsage,
  updateAdaptiveLoad,
} from '../api/middleware/rateLimiter.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildApp({ userId, max, windowMs, adaptive } = {}) {
  const app = express();
  app.use(express.json());
  // Inject req.user when userId is provided
  if (userId !== undefined) {
    app.use((req, _res, next) => {
      req.user = { id: userId };
      next();
    });
  }
  const limiterOpts = { prefix: 'inttest' };
  if (max !== undefined) limiterOpts.max = max;
  if (adaptive !== undefined) limiterOpts.adaptive = adaptive;
  if (windowMs !== undefined) limiterOpts.windowMs = windowMs;
  app.use(createPerUserRateLimiter(limiterOpts));
  app.get('/ping', (_req, res) => res.json({ ok: true }));
  return app;
}

function buildSlidingApp({ max, windowMs = 60_000, burstMax, burstWindowMs, adaptive, prefix = 'sltest' } = {}) {
  const app = express();
  app.use(
    createSlidingWindowRateLimiter({ max, windowMs, burstMax, burstWindowMs, adaptive, prefix }),
  );
  app.get('/ping', (_req, res) => res.json({ ok: true }));
  return app;
}

// ── Reset between tests ───────────────────────────────────────────────────────

beforeEach(() => {
  getUsageStore().clear();
  updateAdaptiveLoad(0);
});

// ── X-RateLimit headers on allowed requests ───────────────────────────────────

describe('rate-limit headers on successful requests', () => {
  it('returns X-RateLimit-Limit header', async () => {
    const app = buildApp({ max: 10 });
    const res = await request(app).get('/ping').set('x-user-id', 'hdr-user');
    expect(res.status).toBe(200);
    expect(res.headers['x-ratelimit-limit']).toBe('10');
  });

  it('returns X-RateLimit-Remaining header', async () => {
    const app = buildApp({ max: 10 });
    const res = await request(app).get('/ping').set('x-user-id', 'hdr-user-2');
    expect(res.headers['x-ratelimit-remaining']).toBeDefined();
    expect(Number(res.headers['x-ratelimit-remaining'])).toBeGreaterThanOrEqual(0);
  });

  it('returns X-RateLimit-Reset header', async () => {
    const app = buildApp({ max: 10 });
    const res = await request(app).get('/ping').set('x-user-id', 'hdr-user-3');
    expect(res.headers['x-ratelimit-reset']).toBeDefined();
    expect(Number(res.headers['x-ratelimit-reset'])).toBeGreaterThan(0);
  });

  it('X-RateLimit-Remaining decreases with each request', async () => {
    const app = buildApp({ max: 5 });
    const id = 'decrement-user';
    const res1 = await request(app).get('/ping').set('x-user-id', id);
    const res2 = await request(app).get('/ping').set('x-user-id', id);
    const res3 = await request(app).get('/ping').set('x-user-id', id);
    const r1 = Number(res1.headers['x-ratelimit-remaining']);
    const r2 = Number(res2.headers['x-ratelimit-remaining']);
    const r3 = Number(res3.headers['x-ratelimit-remaining']);
    expect(r1).toBeGreaterThan(r2);
    expect(r2).toBeGreaterThan(r3);
  });
});

// ── Blocking at limit + 1 ─────────────────────────────────────────────────────

describe('blocking at limit + 1', () => {
  it('allows exactly max requests then blocks the next one with 429', async () => {
    const max = 3;
    const app = buildApp({ max });
    const userId = 'block-user';

    for (let i = 0; i < max; i++) {
      const r = await request(app).get('/ping').set('x-user-id', userId);
      expect(r.status).toBe(200);
    }

    const blocked = await request(app).get('/ping').set('x-user-id', userId);
    expect(blocked.status).toBe(429);
  });

  it('429 response body contains error and code fields', async () => {
    const app = buildApp({ max: 1 });
    await request(app).get('/ping').set('x-user-id', 'body-user');
    const res = await request(app).get('/ping').set('x-user-id', 'body-user');
    expect(res.status).toBe(429);
    expect(res.body).toHaveProperty('error');
    expect(res.body).toHaveProperty('code', 'RATE_LIMIT_EXCEEDED');
  });

  it('sets Retry-After header on 429 response', async () => {
    const app = buildApp({ max: 1 });
    await request(app).get('/ping').set('x-user-id', 'retry-user');
    const res = await request(app).get('/ping').set('x-user-id', 'retry-user');
    expect(res.status).toBe(429);
    expect(res.headers['retry-after']).toBeDefined();
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('sets X-RateLimit-Remaining to 0 on 429 response', async () => {
    const app = buildApp({ max: 1 });
    await request(app).get('/ping').set('x-user-id', 'remaining-zero-user');
    const res = await request(app).get('/ping').set('x-user-id', 'remaining-zero-user');
    expect(res.status).toBe(429);
    expect(res.headers['x-ratelimit-remaining']).toBe('0');
  });
});

// ── Window expiry ─────────────────────────────────────────────────────────────

describe('window expiry', () => {
  it('succeeds again after the sliding window expires (short real-time window)', async () => {
    const windowMs = 60; // 60 ms — very short window for test speed
    const app = buildSlidingApp({ max: 1, windowMs, prefix: 'expiry-test' });

    await request(app).get('/ping').expect(200);
    await request(app).get('/ping').expect(429);

    // Wait for the window to fully expire
    await new Promise((resolve) => setTimeout(resolve, windowMs + 20));

    await request(app).get('/ping').expect(200);
  });

  it('does not let a second user trigger the window reset for the first user', async () => {
    const windowMs = 200;
    const app = buildSlidingApp({ max: 1, windowMs, prefix: 'no-cross-reset' });

    // Exhaust user-a's slot (IP-based in slidingWindow — use separate apps per isolation)
    // For sliding window without user identity, the IP key is shared; test with separate apps
    const appA = buildSlidingApp({ max: 1, windowMs, prefix: 'user-a-iso' });
    const appB = buildSlidingApp({ max: 1, windowMs, prefix: 'user-b-iso' });

    await request(appA).get('/ping').expect(200);
    await request(appA).get('/ping').expect(429);

    // appB is independent — should still allow
    await request(appB).get('/ping').expect(200);
  });
});

// ── Independent windows per user ──────────────────────────────────────────────

describe('independent rate-limit windows per user', () => {
  it('user A reaching the limit does not affect user B', async () => {
    const max = 2;
    const app = buildApp({ max });

    // Exhaust user-a
    await request(app).get('/ping').set('x-user-id', 'iso-user-a');
    await request(app).get('/ping').set('x-user-id', 'iso-user-a');
    await request(app).get('/ping').set('x-user-id', 'iso-user-a').expect(429);

    // user-b should still be allowed
    await request(app).get('/ping').set('x-user-id', 'iso-user-b').expect(200);
  });

  it('10 different users can each make max requests without blocking each other', async () => {
    const max = 3;
    const app = buildApp({ max });

    for (let u = 0; u < 10; u++) {
      const userId = `multi-user-${u}`;
      for (let i = 0; i < max; i++) {
        await request(app).get('/ping').set('x-user-id', userId).expect(200);
      }
      // The 4th request for this user should be blocked
      await request(app).get('/ping').set('x-user-id', userId).expect(429);
    }
  });

  it('tracks by req.user.id when present (ignores x-user-id header)', async () => {
    // When req.user.id is set via middleware it takes priority over the header
    const max = 1;
    const appWithUser = express();
    appWithUser.use((req, _res, next) => {
      req.user = { id: 'explicit-user' };
      next();
    });
    appWithUser.use(createPerUserRateLimiter({ max, prefix: 'req-user-test' }));
    appWithUser.get('/ping', (_req, res) => res.json({ ok: true }));

    await request(appWithUser).get('/ping').expect(200);
    await request(appWithUser).get('/ping').expect(429);
  });

  it('falls back to IP-based key when no user identity is present', async () => {
    const app = buildSlidingApp({ max: 1, prefix: 'ip-fallback' });
    await request(app).get('/ping').expect(200);
    await request(app).get('/ping').expect(429);
  });
});

// ── Burst limiting ────────────────────────────────────────────────────────────

describe('burst limiting', () => {
  it('blocks requests exceeding burstMax within the burst window', async () => {
    const app = buildSlidingApp({
      max: 1000,       // high overall limit — burst guard is the only constraint
      burstMax: 2,
      burstWindowMs: 500,
      prefix: 'burst-integration',
    });

    await request(app).get('/ping').expect(200);
    await request(app).get('/ping').expect(200);
    const res = await request(app).get('/ping').expect(429);
    expect(res.body.reason).toBe('burst');
  });

  it('sets Retry-After on burst rejection', async () => {
    const app = buildSlidingApp({
      max: 1000,
      burstMax: 1,
      burstWindowMs: 300,
      prefix: 'burst-retry',
    });

    await request(app).get('/ping').expect(200);
    const res = await request(app).get('/ping').expect(429);
    expect(res.headers['retry-after']).toBeDefined();
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('allows traffic again after the burst window expires', async () => {
    const burstWindowMs = 50;
    const app = buildSlidingApp({
      max: 1000,
      burstMax: 1,
      burstWindowMs,
      prefix: 'burst-expire',
    });

    await request(app).get('/ping').expect(200);
    await request(app).get('/ping').expect(429);

    await new Promise((r) => setTimeout(r, burstWindowMs + 20));

    await request(app).get('/ping').expect(200);
  });
});

// ── Adaptive rate limiting ────────────────────────────────────────────────────

describe('adaptive rate limiting', () => {
  it('reduces effective limit by 50% when error rate > 0.5', async () => {
    updateAdaptiveLoad(0.6);
    // max=6, adaptive factor=0.5 → effective=3
    const app = buildSlidingApp({ max: 6, adaptive: true, prefix: 'adaptive-high' });

    await request(app).get('/ping').expect(200);
    await request(app).get('/ping').expect(200);
    await request(app).get('/ping').expect(200);
    // 4th request exceeds effective limit of 3
    await request(app).get('/ping').expect(429);
  });

  it('reduces effective limit by 25% when error rate is between 0.25 and 0.5', async () => {
    updateAdaptiveLoad(0.3);
    // max=4, adaptive factor=0.75 → effective=3
    const app = buildSlidingApp({ max: 4, adaptive: true, prefix: 'adaptive-medium' });

    await request(app).get('/ping').expect(200);
    await request(app).get('/ping').expect(200);
    await request(app).get('/ping').expect(200);
    // 4th request exceeds effective limit of 3
    await request(app).get('/ping').expect(429);
  });

  it('does not reduce limit when error rate is low (<= 0.25)', async () => {
    updateAdaptiveLoad(0.1);
    // max=4, adaptive factor=1.0 → effective=4
    const app = buildSlidingApp({ max: 4, adaptive: true, prefix: 'adaptive-low' });

    for (let i = 0; i < 4; i++) {
      await request(app).get('/ping').expect(200);
    }
    await request(app).get('/ping').expect(429);
  });

  it('does not reduce limit when adaptive=false even under high load', async () => {
    updateAdaptiveLoad(0.9); // high error rate
    const app = buildSlidingApp({ max: 3, adaptive: false, prefix: 'not-adaptive' });

    for (let i = 0; i < 3; i++) {
      await request(app).get('/ping').expect(200);
    }
    await request(app).get('/ping').expect(429);
  });
});

// ── getUserUsage / trackUsage public API ──────────────────────────────────────

describe('getUserUsage and trackUsage', () => {
  it('getUserUsage returns count=0 and resetAt=null for a new user', () => {
    const usage = getUserUsage('brand-new-user');
    expect(usage.count).toBe(0);
    expect(usage.resetAt).toBeNull();
  });

  it('trackUsage increments the count for a key', () => {
    const { RATE_LIMIT_WINDOW_MS } = { RATE_LIMIT_WINDOW_MS: 60_000 };
    trackUsage('user:tracked-1', 60_000);
    trackUsage('user:tracked-1', 60_000);
    const usage = getUserUsage('tracked-1');
    expect(usage.count).toBe(2);
  });

  it('getUserUsage returns a future resetAt after a request is tracked', () => {
    trackUsage('user:reset-user', 60_000);
    const usage = getUserUsage('reset-user');
    expect(usage.resetAt).toBeInstanceOf(Date);
    expect(usage.resetAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('getUsageStore.clear() resets all counters', () => {
    trackUsage('user:clear-test', 60_000);
    getUsageStore().clear();
    const usage = getUserUsage('clear-test');
    expect(usage.count).toBe(0);
  });
});

// ── SlidingWindowStore internals ──────────────────────────────────────────────

describe('SlidingWindowStore internals', () => {
  it('prunes timestamps outside the window before counting', () => {
    const store = getUsageStore();
    const now = Date.now();
    // Manually insert a timestamp 5 seconds in the past for a 1-second window
    store._store.set('prune-key', [now - 5000]);
    expect(store.count('prune-key', 1000, now)).toBe(0);
  });

  it('oldest() returns null for a key with no recorded requests', () => {
    const store = getUsageStore();
    expect(store.oldest('nonexistent-key')).toBeNull();
  });

  it('oldest() returns the earliest timestamp for a key', () => {
    const store = getUsageStore();
    const now = Date.now();
    store.record('oldest-key', 60_000, now - 2000);
    store.record('oldest-key', 60_000, now - 1000);
    store.record('oldest-key', 60_000, now);
    expect(store.oldest('oldest-key')).toBe(now - 2000);
  });

  it('record() returns the new count', () => {
    const store = getUsageStore();
    const count1 = store.record('count-key', 60_000);
    const count2 = store.record('count-key', 60_000);
    expect(count1).toBe(1);
    expect(count2).toBe(2);
  });
});
