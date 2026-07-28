/**
 * Integration tests for GET /api/v1/system/shutdown-status
 *
 * Covers: unauthenticated (401), authenticated non-admin (403), and
 * authenticated admin (200) happy path returning the drain status shape.
 */
import { jest, describe, expect, it, beforeEach } from '@jest/globals';
import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';

const ADDRESS_A = `G${'A'.repeat(55)}`;
const JWT_SECRET = process.env.JWT_SECRET || 'change_this_in_production';
const ADMIN_API_KEY = 'test-admin-key';
process.env.ADMIN_API_KEY = ADMIN_API_KEY;

const mockGetShutdownState = jest.fn();

jest.unstable_mockModule('../lib/gracefulShutdown.js', () => ({
  getShutdownState: () => mockGetShutdownState(),
}));

const { default: systemRoutes } = await import('../api/routes/systemRoutes.js');

function bearerToken(roles = ['Admin']) {
  return `Bearer ${jwt.sign({ address: ADDRESS_A, roles, jti: 'jti-1' }, JWT_SECRET, { expiresIn: '1h' })}`;
}

function createApp() {
  const app = express();
  app.use(express.json());

  // Minimal stand-in for the gateway's auth step: populate req.user from a
  // Bearer JWT if present, mirroring how requireAdmin expects it upstream.
  app.use((req, res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const payload = jwt.verify(authHeader.slice(7), JWT_SECRET);
        req.user = { address: payload.address, roles: payload.roles || [], jti: payload.jti };
      } catch {
        req.user = null;
      }
    } else {
      req.user = null;
    }
    next();
  });

  app.use('/api/v1/system', systemRoutes);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetShutdownState.mockReturnValue({
    status: 'running',
    drainStartedAt: null,
    inFlightRequests: 0,
    uptimeSeconds: 42,
  });
});

describe('GET /api/v1/system/shutdown-status', () => {
  it('returns 401 without authentication', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/system/shutdown-status');
    expect(res.status).toBe(401);
  });

  it('returns 403 for an authenticated non-admin user', async () => {
    const app = createApp();
    const res = await request(app)
      .get('/api/v1/system/shutdown-status')
      .set('Authorization', bearerToken(['Client']));
    expect(res.status).toBe(403);
  });

  it('returns 200 with the shutdown state for an admin user', async () => {
    const app = createApp();
    const res = await request(app)
      .get('/api/v1/system/shutdown-status')
      .set('Authorization', bearerToken(['Admin']));

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      status: 'running',
      drainStartedAt: null,
      inFlightRequests: 0,
      uptimeSeconds: 42,
    });
    expect(res.body.meta.requestId).toBeDefined();
  });

  it('reflects a draining state', async () => {
    mockGetShutdownState.mockReturnValue({
      status: 'draining',
      drainStartedAt: '2026-07-28T00:00:00.000Z',
      inFlightRequests: 3,
      uptimeSeconds: 500,
    });

    const app = createApp();
    const res = await request(app)
      .get('/api/v1/system/shutdown-status')
      .set('Authorization', bearerToken(['Admin']));

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('draining');
    expect(res.body.data.inFlightRequests).toBe(3);
  });
});
