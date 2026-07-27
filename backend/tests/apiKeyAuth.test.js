/**
 * Tests for API key IP allowlisting: the apiKeyAuth middleware (CIDR
 * enforcement) and the PATCH /api/v1/api-keys/:id validation.
 */

import { jest } from '@jest/globals';
import crypto from 'crypto';
import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';

const ADDRESS_A = `G${'A'.repeat(55)}`;
const ADDRESS_B = `G${'B'.repeat(55)}`;
const JWT_SECRET = process.env.JWT_SECRET || 'change_this_in_production';

function hashKey(rawKey) {
  return crypto.createHash('sha256').update(rawKey).digest('hex');
}

// ── Module mock (registered once, mutated per-test rather than re-exported) ──

const apiKeys = [];
let nextId = 1;

const prismaMock = {
  apiKey: {
    create: jest.fn(async ({ data }) => {
      const record = {
        id: `key_${nextId++}`,
        revokedAt: null,
        lastUsedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data,
      };
      apiKeys.push(record);
      return record;
    }),
    findUnique: jest.fn(async ({ where }) => {
      if (where?.keyHash) return apiKeys.find((k) => k.keyHash === where.keyHash) || null;
      if (where?.id) return apiKeys.find((k) => k.id === where.id) || null;
      return null;
    }),
    findFirst: jest.fn(async ({ where }) => {
      return (
        apiKeys.find(
          (k) => (!where?.id || k.id === where.id) && (!where?.userId || k.userId === where.userId),
        ) || null
      );
    }),
    findMany: jest.fn(async ({ where }) => {
      return apiKeys.filter(
        (k) =>
          (!where?.userId || k.userId === where.userId) &&
          (where?.revokedAt === undefined || k.revokedAt === where.revokedAt),
      );
    }),
    update: jest.fn(async ({ where, data }) => {
      const record = apiKeys.find((k) => k.id === where.id);
      if (!record) throw new Error('Record not found');
      Object.assign(record, data, { updatedAt: new Date() });
      return record;
    }),
  },
};

jest.unstable_mockModule('../lib/prisma.js', () => ({ default: prismaMock }));

const { default: apiKeyAuth } = await import('../api/middleware/apiKeyAuth.js');
const { default: apiKeyController } = await import('../api/controllers/apiKeyController.js');

// ── Helpers ──────────────────────────────────────────────────────────────────

function createUserToken(address = ADDRESS_A) {
  return jwt.sign({ address, jti: 'jti-user' }, JWT_SECRET, { expiresIn: '1h' });
}

/** Minimal hand-rolled JWT middleware, mirroring auth.js's req.user shape. */
function fakeAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const payload = jwt.verify(authHeader.slice(7), JWT_SECRET);
      req.user = { address: payload.address, jti: payload.jti };
    } catch {
      req.user = null;
    }
  }
  next();
}

function createApp() {
  const app = express();
  app.set('trust proxy', true); // let X-Forwarded-For drive req.ip for deterministic tests
  app.use(express.json());

  app.get('/protected', apiKeyAuth, (req, res) => {
    res.json({ ok: true, address: req.user.address });
  });

  app.use('/api/v1/api-keys', fakeAuth);
  app.patch('/api/v1/api-keys/:id', apiKeyController.updateKey);
  app.get('/api/v1/api-keys', apiKeyController.listKeys);

  return app;
}

async function seedKey({ userId = ADDRESS_A, allowedIps = [], revokedAt = null } = {}) {
  const rawKey = `stk_${crypto.randomBytes(16).toString('hex')}`;
  const record = await prismaMock.apiKey.create({
    data: {
      tenantId: 'tenant_default',
      userId,
      name: 'Test Key',
      keyHash: hashKey(rawKey),
      keyPrefix: rawKey.slice(0, 12),
      allowedIps,
      revokedAt,
    },
  });
  return { rawKey, record };
}

beforeEach(() => {
  apiKeys.length = 0;
  Object.values(prismaMock.apiKey).forEach((fn) => fn.mockClear());
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('apiKeyAuth middleware — IP allowlisting', () => {
  it('rejects requests with no x-api-key header', async () => {
    const app = createApp();
    const res = await request(app).get('/protected');
    expect(res.status).toBe(401);
  });

  it('rejects an unknown API key', async () => {
    const app = createApp();
    const res = await request(app).get('/protected').set('x-api-key', 'stk_doesnotexist');
    expect(res.status).toBe(401);
  });

  it('rejects a revoked API key', async () => {
    const app = createApp();
    const { rawKey } = await seedKey({ revokedAt: new Date() });
    const res = await request(app).get('/protected').set('x-api-key', rawKey);
    expect(res.status).toBe(401);
  });

  it('allows a request from an IP inside the allowlist', async () => {
    const app = createApp();
    const { rawKey } = await seedKey({ allowedIps: ['203.0.113.10'] });
    const res = await request(app)
      .get('/protected')
      .set('x-api-key', rawKey)
      .set('X-Forwarded-For', '203.0.113.10');
    expect(res.status).toBe(200);
    expect(res.body.address).toBe(ADDRESS_A);
  });

  it('blocks a request from an IP outside the allowlist', async () => {
    const app = createApp();
    const { rawKey } = await seedKey({ allowedIps: ['203.0.113.10'] });
    const res = await request(app)
      .get('/protected')
      .set('x-api-key', rawKey)
      .set('X-Forwarded-For', '198.51.100.9');
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('IP not allowed');
  });

  it('allows any IP when allowedIps is empty', async () => {
    const app = createApp();
    const { rawKey } = await seedKey({ allowedIps: [] });
    const res = await request(app)
      .get('/protected')
      .set('x-api-key', rawKey)
      .set('X-Forwarded-For', '8.8.8.8');
    expect(res.status).toBe(200);
  });

  it('matches an IP within a CIDR range', async () => {
    const app = createApp();
    const { rawKey } = await seedKey({ allowedIps: ['10.0.0.0/24'] });

    const inRange = await request(app)
      .get('/protected')
      .set('x-api-key', rawKey)
      .set('X-Forwarded-For', '10.0.0.5');
    expect(inRange.status).toBe(200);

    const outOfRange = await request(app)
      .get('/protected')
      .set('x-api-key', rawKey)
      .set('X-Forwarded-For', '10.0.1.5');
    expect(outOfRange.status).toBe(403);
  });
});

describe('PATCH /api/v1/api-keys/:id — allowedIps validation', () => {
  it('updates allowedIps with valid CIDR/IP entries', async () => {
    const app = createApp();
    const { record } = await seedKey({ allowedIps: [] });

    const res = await request(app)
      .patch(`/api/v1/api-keys/${record.id}`)
      .set('Authorization', `Bearer ${createUserToken()}`)
      .send({ allowedIps: ['10.0.0.0/24', '203.0.113.10'] });

    expect(res.status).toBe(200);
    expect(res.body.allowedIps).toEqual(['10.0.0.0/24', '203.0.113.10']);
  });

  it('rejects an invalid CIDR entry', async () => {
    const app = createApp();
    const { record } = await seedKey({ allowedIps: [] });

    const res = await request(app)
      .patch(`/api/v1/api-keys/${record.id}`)
      .set('Authorization', `Bearer ${createUserToken()}`)
      .send({ allowedIps: ['not-a-cidr'] });

    expect(res.status).toBe(400);
  });

  it('rejects an out-of-range prefix length', async () => {
    const app = createApp();
    const { record } = await seedKey({ allowedIps: [] });

    const res = await request(app)
      .patch(`/api/v1/api-keys/${record.id}`)
      .set('Authorization', `Bearer ${createUserToken()}`)
      .send({ allowedIps: ['10.0.0.0/99'] });

    expect(res.status).toBe(400);
  });

  it('returns 404 for a key owned by a different user', async () => {
    const app = createApp();
    const { record } = await seedKey({ userId: ADDRESS_B, allowedIps: [] });

    const res = await request(app)
      .patch(`/api/v1/api-keys/${record.id}`)
      .set('Authorization', `Bearer ${createUserToken(ADDRESS_A)}`)
      .send({ allowedIps: ['10.0.0.0/24'] });

    expect(res.status).toBe(404);
  });
});
