/**
 * Tests for the hardened CORS middleware.
 *
 * Uses createCorsMiddleware() with explicit allowlists so tests are isolated
 * from each other and from process.env state.
 */

import request from 'supertest';
import express from 'express';
import { createCorsMiddleware, buildAllowlist } from '../middleware/cors.js';

function makeApp(allowlist) {
  const app = express();
  app.use(createCorsMiddleware(allowlist));
  app.get('/ping', (_req, res) => res.json({ ok: true }));
  return app;
}

const ALLOWED = new Set(['http://localhost:3000', 'https://app.example.com']);

describe('CORS middleware', () => {
  // ── Allowlisted origin ─────────────────────────────────────────────────────

  it('sets Access-Control-Allow-Origin for an allowlisted origin', async () => {
    const res = await request(makeApp(ALLOWED))
      .get('/ping')
      .set('Origin', 'http://localhost:3000');

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
  });

  // ── Non-allowlisted origin ─────────────────────────────────────────────────

  it('does not set ACAO header for a non-allowlisted origin', async () => {
    const res = await request(makeApp(ALLOWED))
      .get('/ping')
      .set('Origin', 'https://evil.example.com');

    expect(res.status).toBe(200); // Express still responds; browser blocks
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  // ── Preflight (OPTIONS) ────────────────────────────────────────────────────

  it('returns 204 on preflight for an allowlisted origin', async () => {
    const res = await request(makeApp(ALLOWED))
      .options('/ping')
      .set('Origin', 'http://localhost:3000')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'Authorization,Idempotency-Key,X-Tenant-ID');

    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');

    const allowed = res.headers['access-control-allow-headers'] ?? '';
    expect(allowed).toMatch(/Authorization/i);
    expect(allowed).toMatch(/Idempotency-Key/i);
    expect(allowed).toMatch(/X-Tenant-ID/i);
  });

  it('does not return CORS headers on preflight from a non-allowlisted origin', async () => {
    const res = await request(makeApp(ALLOWED))
      .options('/ping')
      .set('Origin', 'https://attacker.io')
      .set('Access-Control-Request-Method', 'DELETE');

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  // ── Vary: Origin ──────────────────────────────────────────────────────────

  it('includes Vary: Origin for an allowlisted origin', async () => {
    const res = await request(makeApp(ALLOWED))
      .get('/ping')
      .set('Origin', 'http://localhost:3000');

    expect(res.headers['vary']).toMatch(/origin/i);
  });

  // ── credentials ───────────────────────────────────────────────────────────

  it('sets Access-Control-Allow-Credentials: true for an allowlisted origin', async () => {
    const res = await request(makeApp(ALLOWED))
      .get('/ping')
      .set('Origin', 'http://localhost:3000');

    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  // ── Multiple origins ──────────────────────────────────────────────────────

  it('allows each origin that is in the allowlist', async () => {
    const r1 = await request(makeApp(ALLOWED)).get('/ping').set('Origin', 'http://localhost:3000');
    const r2 = await request(makeApp(ALLOWED)).get('/ping').set('Origin', 'https://app.example.com');

    expect(r1.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(r2.headers['access-control-allow-origin']).toBe('https://app.example.com');
  });

  // ── No Origin header (same-origin / curl) ─────────────────────────────────

  it('passes through requests with no Origin header without ACAO header', async () => {
    const res = await request(makeApp(ALLOWED)).get('/ping');

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  // ── buildAllowlist ────────────────────────────────────────────────────────

  describe('buildAllowlist()', () => {
    const saved = {};

    beforeEach(() => {
      saved.ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS;
      saved.NODE_ENV = process.env.NODE_ENV;
      delete process.env.ALLOWED_ORIGINS;
    });

    afterEach(() => {
      if (saved.ALLOWED_ORIGINS === undefined) delete process.env.ALLOWED_ORIGINS;
      else process.env.ALLOWED_ORIGINS = saved.ALLOWED_ORIGINS;
      process.env.NODE_ENV = saved.NODE_ENV;
    });

    it('uses ALLOWED_ORIGINS when set', () => {
      process.env.ALLOWED_ORIGINS = 'https://a.com, https://b.com';
      const set = buildAllowlist();
      expect(set.has('https://a.com')).toBe(true);
      expect(set.has('https://b.com')).toBe(true);
    });

    it('uses development defaults when NODE_ENV=development', () => {
      process.env.NODE_ENV = 'development';
      const set = buildAllowlist();
      expect(set.has('http://localhost:3000')).toBe(true);
    });

    it('returns an empty set for production without ALLOWED_ORIGINS', () => {
      process.env.NODE_ENV = 'production';
      const set = buildAllowlist();
      expect(set.size).toBe(0);
    });
  });
});
