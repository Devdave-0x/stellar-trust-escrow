/**
 * Tests for share-link rate limiting (Issue #545)
 * Tests token-prefix and IP rate-limit buckets for share-link endpoints
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';

delete process.env.REDIS_URL;

const { shareLinkRateLimit, _resetMemStore } = await import(
  '../middleware/shareLinkRateLimit.js'
);

function buildApp(ip = '1.2.3.4') {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.headers['x-test-ip'] = ip;
    next();
  });
  app.use(shareLinkRateLimit);
  app.get('/api/share-link/:token', (_req, res) => res.json({ ok: true }));
  return app;
}

beforeEach(() => {
  _resetMemStore();
});

describe('shareLinkRateLimit', () => {
  it('allows requests under the IP limit', async () => {
    process.env.SHARE_LINK_RATE_LIMIT_IP_MAX = '5';
    const app = buildApp('10.0.0.1');
    const res = await request(app).get('/api/share-link/test-token-123');
    expect(res.status).toBe(200);
  });

  it('returns 429 when IP limit exceeded', async () => {
    process.env.SHARE_LINK_RATE_LIMIT_IP_MAX = '2';
    const app = buildApp('10.0.0.2');

    await request(app).get('/api/share-link/token-1').expect(200);
    await request(app).get('/api/share-link/token-2').expect(200);
    const res = await request(app).get('/api/share-link/token-3');

    expect(res.status).toBe(429);
    expect(res.body.code).toBe('RATE_LIMIT_EXCEEDED');
  });

  it('tracks different IPs independently', async () => {
    process.env.SHARE_LINK_RATE_LIMIT_IP_MAX = '1';
    const appA = buildApp('10.0.1.1');
    const appB = buildApp('10.0.1.2');

    await request(appA).get('/api/share-link/token-a').expect(200);
    await request(appA).get('/api/share-link/token-b').expect(429);
    await request(appB).get('/api/share-link/token-c').expect(200);
  });

  it('applies token-prefix rate limiting separately from IP limiting', async () => {
    process.env.SHARE_LINK_RATE_LIMIT_IP_MAX = '100';
    process.env.SHARE_LINK_RATE_LIMIT_TOKEN_PREFIX_MAX = '2';
    const app = buildApp('10.0.2.1');

    await request(app).get('/api/share-link/prefix-abc-1').expect(200);
    await request(app).get('/api/share-link/prefix-abc-2').expect(200);
    const res = await request(app).get('/api/share-link/prefix-abc-3');

    expect(res.status).toBe(429);
  });

  it('treats different token prefixes independently', async () => {
    process.env.SHARE_LINK_RATE_LIMIT_TOKEN_PREFIX_MAX = '1';
    const app = buildApp('10.0.2.2');

    await request(app).get('/api/share-link/prefix-abc-1').expect(200);
    await request(app).get('/api/share-link/prefix-abc-2').expect(429);
    await request(app).get('/api/share-link/prefix-xyz-1').expect(200);
  });

  it('bypasses limits for localhost', async () => {
    process.env.SHARE_LINK_RATE_LIMIT_IP_MAX = '1';
    const app = buildApp('127.0.0.1');

    for (let i = 0; i < 5; i++) {
      await request(app).get(`/api/share-link/token-${i}`).expect(200);
    }
  });

  it('includes X-RateLimit headers in response', async () => {
    process.env.SHARE_LINK_RATE_LIMIT_IP_MAX = '100';
    const app = buildApp('10.0.3.1');
    const res = await request(app).get('/api/share-link/token-test');

    expect(res.headers['x-ratelimit-limit']).toBeDefined();
    expect(res.headers['x-ratelimit-remaining']).toBeDefined();
    expect(res.headers['x-ratelimit-reset']).toBeDefined();
  });

  it('blocks brute force attempts on same token from single IP', async () => {
    process.env.SHARE_LINK_RATE_LIMIT_IP_MAX = '3';
    const app = buildApp('10.0.4.1');

    await request(app).get('/api/share-link/vulnerable-token').expect(200);
    await request(app).get('/api/share-link/vulnerable-token').expect(200);
    await request(app).get('/api/share-link/vulnerable-token').expect(200);
    const res = await request(app).get('/api/share-link/vulnerable-token');

    expect(res.status).toBe(429);
  });

  it('blocks distributed brute force attempts using token prefix limits', async () => {
    process.env.SHARE_LINK_RATE_LIMIT_TOKEN_PREFIX_MAX = '2';
    process.env.SHARE_LINK_RATE_LIMIT_IP_MAX = '100';
    const appA = buildApp('10.0.5.1');
    const appB = buildApp('10.0.5.2');

    await request(appA).get('/api/share-link/target-token-1').expect(200);
    await request(appB).get('/api/share-link/target-token-2').expect(200);
    const resA = await request(appA).get('/api/share-link/target-token-3');

    expect(resA.status).toBe(429);
  });
});
