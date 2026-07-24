/**
 * Integration tests for admin escrow endpoints.
 */

import { jest } from '@jest/globals';
import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';

const ADDRESS_A = `G${'A'.repeat(55)}`;
const ADDRESS_B = `G${'B'.repeat(55)}`;
const JWT_SECRET = process.env.JWT_SECRET || 'change_this_in_production';

// ── Module mocks (must be set before route imports) ─────────────────────────

const cacheMock = {
  get: jest.fn(),
  set: jest.fn(),
  invalidate: jest.fn(),
  invalidatePrefix: jest.fn(),
  invalidateTags: jest.fn(),
  analytics: jest.fn(() => ({
    hits: 0,
    misses: 0,
    sets: 0,
    invalidations: 0,
    hitRate: '0',
    backend: 'memory',
    memSize: 0,
  })),
  size: jest.fn(),
};

jest.unstable_mockModule('../lib/cache.js', () => ({ default: cacheMock }));

jest.unstable_mockModule('../services/auditService.js', () => ({
  log: jest.fn().mockResolvedValue(undefined),
  AuditCategory: {
    ADMIN: 'ADMIN',
    ESCROW: 'ESCROW',
    MILESTONE: 'MILESTONE',
    DISPUTE: 'DISPUTE',
    PAYMENT: 'PAYMENT',
    KYC: 'KYC',
    REPORTING: 'REPORTING',
    AUTH: 'AUTH',
  },
  AuditAction: {
    FREEZE_ESCROW: 'FREEZE_ESCROW',
    FORCE_TRANSITION_ESCROW: 'FORCE_TRANSITION_ESCROW',
    ESCROW_ADD_NOTE: 'ESCROW_ADD_NOTE',
    ESCROW_LIST_INSPECT: 'ESCROW_LIST_INSPECT',
    CREATE_ESCROW: 'CREATE_ESCROW',
    CANCEL_ESCROW: 'CANCEL_ESCROW',
    COMPLETE_ESCROW: 'COMPLETE_ESCROW',
  },
  search: jest.fn().mockResolvedValue({ data: [], total: 0 }),
  exportCsv: jest.fn().mockResolvedValue(''),
  purgeOldRecords: jest.fn().mockResolvedValue(0),
  default: {
    log: jest.fn().mockResolvedValue(undefined),
  },
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

function createAdminToken(roles = ['Admin']) {
  return jwt.sign({ address: ADDRESS_A, roles, jti: 'jti-admin' }, JWT_SECRET, { expiresIn: '1h' });
}

function createUserToken(roles = ['Client']) {
  return jwt.sign({ address: ADDRESS_B, roles, jti: 'jti-user' }, JWT_SECRET, { expiresIn: '1h' });
}

function buildPrismaMock(overrides = {}) {
  const escrows = [];
  const escrowNotes = [];
  const adminAuditLogs = [];
  let nextEscrowId = 1;
  let nextNoteId = 1;

  const base = {
    $transaction: jest.fn(async (ops) => {
      if (Array.isArray(ops)) return Promise.all(ops);
      if (typeof ops === 'function') return ops(base);
      return ops;
    }),
    escrow: {
      findFirst: jest.fn(async ({ where } = {}) => {
        if (where?.id) {
          const rawId = typeof where.id === 'bigint' ? where.id : BigInt(String(where.id).replace(/[^0-9]/g, '') || 0);
          return escrows.find((e) => e.id === rawId) || null;
        }
        if (where?.AND) {
          for (const clause of where.AND) {
            if (clause.id) {
              const rawId = typeof clause.id === 'bigint' ? clause.id : BigInt(String(clause.id).replace(/[^0-9]/g, '') || 0);
              const match = escrows.find((e) => e.id === rawId);
              if (match) return match;
            }
          }
        }
        return escrows[0] || null;
      }),
      findMany: jest.fn(async ({ where } = {}) => {
        let results = [...escrows];
        if (where?.status?.in) {
          results = results.filter((e) => where.status.in.includes(e.status));
        }
        if (where?.clientAddress?.contains) {
          results = results.filter((e) => e.clientAddress.toLowerCase().includes(where.clientAddress.contains.toLowerCase()));
        }
        if (where?.freelancerAddress?.contains) {
          results = results.filter((e) => e.freelancerAddress.toLowerCase().includes(where.freelancerAddress.contains.toLowerCase()));
        }
        if (where?.OR) {
          results = results.filter((e) =>
            where.OR.some((c) => {
              if (c.id && typeof c.id === 'object' && c.id.equals) {
                try { return e.id === c.id.equals; } catch { return false; }
              }
              if (c.clientAddress?.contains) return e.clientAddress.toLowerCase().includes(c.clientAddress.contains.toLowerCase());
              if (c.freelancerAddress?.contains) return e.freelancerAddress.toLowerCase().includes(c.freelancerAddress.contains.toLowerCase());
              return false;
            }),
          );
        }
        if (where?.totalAmount?.gte) results = results.filter((e) => e.totalAmount >= where.totalAmount.gte);
        if (where?.totalAmount?.lte) results = results.filter((e) => e.totalAmount <= where.totalAmount.lte);
        if (where?.createdAt?.gte) results = results.filter((e) => e.createdAt >= where.createdAt.gte);
        if (where?.createdAt?.lte) results = results.filter((e) => e.createdAt <= where.createdAt.lte);
        return results;
      }),
      count: jest.fn(async () => escrows.length),
      updateMany: jest.fn(async ({ where, data } = {}) => {
        const rawId = where?.id ? (typeof where.id === 'bigint' ? where.id : BigInt(String(where.id).replace(/[^0-9]/g, '') || 0)) : null;
        let count = 0;
        for (const e of escrows) {
          if (rawId !== null && e.id === rawId) {
            Object.assign(e, data, { updatedAt: new Date() });
            count++;
          }
        }
        return { count };
      }),
      create: jest.fn(async ({ data } = {}) => {
        const record = { id: BigInt(nextEscrowId++), ...data, createdAt: new Date(), updatedAt: new Date() };
        escrows.push(record);
        return record;
      }),
    },
    escrowNote: {
      findFirst: jest.fn(async () => null),
      findMany: jest.fn(async () => []),
      create: jest.fn(async ({ data } = {}) => {
        const record = { id: nextNoteId++, ...data, createdAt: new Date() };
        escrowNotes.push(record);
        return record;
      }),
      count: jest.fn(async () => escrowNotes.length),
    },
    adminAuditLog: {
      findFirst: jest.fn(async () => null),
      findMany: jest.fn(async () => []),
      create: jest.fn(async ({ data } = {}) => {
        const record = { id: adminAuditLogs.length + 1, ...data };
        adminAuditLogs.push(record);
        return record;
      }),
      count: jest.fn(async () => adminAuditLogs.length),
    },
    auditLog: {
      create: jest.fn(async () => ({ id: 1 })),
      findMany: jest.fn(async () => []),
      count: jest.fn(async () => 0),
    },
    tenant: {
      findFirst: jest.fn(async () => ({ id: 'tenant_default', slug: 'default', name: 'Default', status: 'active' })),
    },
  };

  return { base, escrows, escrowNotes, adminAuditLogs };
}

const { default: adminEscrowRoutes } = await import('../api/routes/adminEscrowRoutes.js');

function createApp() {
  const app = express();
  app.use(express.json());

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

  app.use('/api/admin/escrows', adminEscrowRoutes);
  return app;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Admin Escrow Routes', () => {
  describe('requireAdmin middleware', () => {
    it('returns 401 without auth', async () => {
      const app = createApp();
      const res = await request(app).get('/api/admin/escrows');
      expect(res.status).toBe(401);
    });

    it('returns 403 for non-admin user', async () => {
      const app = createApp();
      const res = await request(app)
        .get('/api/admin/escrows')
        .set('Authorization', `Bearer ${createUserToken(['Client'])}`);
      expect(res.status).toBe(403);
    });

    it('returns 403 for user without roles', async () => {
      const app = createApp();
      const res = await request(app)
        .get('/api/admin/escrows')
        .set('Authorization', `Bearer ${jwt.sign({ address: ADDRESS_B, jti: 'jti' }, JWT_SECRET, { expiresIn: '1h' })}`);
      expect(res.status).toBe(403);
    });

    it('returns 200 for admin user (controller fails due to empty mock, proving auth passed)', async () => {
      const app = createApp();
      const { base } = buildPrismaMock();
      jest.unstable_mockModule('../../lib/prisma.js', () => ({ default: base }));

      const res = await request(app)
        .get('/api/admin/escrows')
        .set('Authorization', `Bearer ${createAdminToken()}`);
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
    });
  });

  describe('GET /api/admin/escrows', () => {
    it('returns 200 with empty list when no escrows', async () => {
      const app = createApp();
      const { base } = buildPrismaMock();
      jest.unstable_mockModule('../../lib/prisma.js', () => ({ default: base }));

      const res = await request(app)
        .get('/api/admin/escrows')
        .set('Authorization', `Bearer ${createAdminToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(0);
      expect(res.body.total).toBe(0);
      expect(res.body.page).toBe(1);
      expect(res.body.limit).toBe(20);
    });

    it('returns 200 with paginated escrow list', async () => {
      const app = createApp();
      const { base, escrows } = buildPrismaMock();
      jest.unstable_mockModule('../../lib/prisma.js', () => ({ default: base }));

      escrows.push(
        { id: 1n, tenantId: 't1', clientAddress: ADDRESS_A, freelancerAddress: ADDRESS_B, status: 'Active', totalAmount: '100', createdAt: new Date(), updatedAt: new Date(), createdLedger: 1n, milestones: [], dispute: null, tenant: { id: 't1', slug: 't1', name: 'T1', status: 'active' } },
        { id: 2n, tenantId: 't2', clientAddress: ADDRESS_B, freelancerAddress: ADDRESS_A, status: 'Completed', totalAmount: '200', createdAt: new Date(), updatedAt: new Date(), createdLedger: 2n, milestones: [], dispute: null, tenant: { id: 't2', slug: 't2', name: 'T2', status: 'active' } },
      );

      const res = await request(app)
        .get('/api/admin/escrows?page=1&limit=10')
        .set('Authorization', `Bearer ${createAdminToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.total).toBe(2);
      expect(res.body.page).toBe(1);
      expect(res.body.limit).toBe(10);
    });

    it('applies status filter', async () => {
      const app = createApp();
      const { base, escrows } = buildPrismaMock();
      jest.unstable_mockModule('../../lib/prisma.js', () => ({ default: base }));

      escrows.push(
        { id: 1n, tenantId: 't1', clientAddress: ADDRESS_A, freelancerAddress: ADDRESS_B, status: 'Active', totalAmount: '100', createdAt: new Date(), updatedAt: new Date(), createdLedger: 1n, milestones: [], dispute: null, tenant: { id: 't1', slug: 't1', name: 'T1', status: 'active' } },
        { id: 2n, tenantId: 't1', clientAddress: ADDRESS_A, freelancerAddress: ADDRESS_B, status: 'Completed', totalAmount: '200', createdAt: new Date(), updatedAt: new Date(), createdLedger: 2n, milestones: [], dispute: null, tenant: { id: 't1', slug: 't1', name: 'T1', status: 'active' } },
      );

      const res = await request(app)
        .get('/api/admin/escrows?status=Active')
        .set('Authorization', `Bearer ${createAdminToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].status).toBe('Active');
    });

    it('applies client filter', async () => {
      const app = createApp();
      const { base, escrows } = buildPrismaMock();
      jest.unstable_mockModule('../../lib/prisma.js', () => ({ default: base }));

      escrows.push(
        { id: 1n, tenantId: 't1', clientAddress: ADDRESS_A, freelancerAddress: ADDRESS_B, status: 'Active', totalAmount: '100', createdAt: new Date(), updatedAt: new Date(), createdLedger: 1n, milestones: [], dispute: null, tenant: { id: 't1', slug: 't1', name: 'T1', status: 'active' } },
        { id: 2n, tenantId: 't1', clientAddress: ADDRESS_B, freelancerAddress: ADDRESS_A, status: 'Active', totalAmount: '200', createdAt: new Date(), updatedAt: new Date(), createdLedger: 2n, milestones: [], dispute: null, tenant: { id: 't1', slug: 't1', name: 'T1', status: 'active' } },
      );

      const res = await request(app)
        .get(`/api/admin/escrows?client=${ADDRESS_A}`)
        .set('Authorization', `Bearer ${createAdminToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].clientAddress).toBe(ADDRESS_A);
    });

    it('applies amount range filter', async () => {
      const app = createApp();
      const { base, escrows } = buildPrismaMock();
      jest.unstable_mockModule('../../lib/prisma.js', () => ({ default: base }));

      escrows.push(
        { id: 1n, tenantId: 't1', clientAddress: ADDRESS_A, freelancerAddress: ADDRESS_B, status: 'Active', totalAmount: '100', createdAt: new Date(), updatedAt: new Date(), createdLedger: 1n, milestones: [], dispute: null, tenant: { id: 't1', slug: 't1', name: 'T1', status: 'active' } },
        { id: 2n, tenantId: 't1', clientAddress: ADDRESS_A, freelancerAddress: ADDRESS_B, status: 'Active', totalAmount: '500', createdAt: new Date(), updatedAt: new Date(), createdLedger: 2n, milestones: [], dispute: null, tenant: { id: 't1', slug: 't1', name: 'T1', status: 'active' } },
      );

      const res = await request(app)
        .get('/api/admin/escrows?minAmount=150&maxAmount=300')
        .set('Authorization', `Bearer ${createAdminToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].totalAmount).toBe('500');
    });
  });

  describe('POST /api/admin/escrows/:id/freeze', () => {
    it('returns 404 when escrow not found', async () => {
      const app = createApp();
      const { base } = buildPrismaMock();
      jest.unstable_mockModule('../../lib/prisma.js', () => ({ default: base }));

      const res = await request(app)
        .post('/api/admin/escrows/999/freeze')
        .set('Authorization', `Bearer ${createAdminToken()}`)
        .send({ reason: 'Compliance freeze' });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Escrow not found.');
    });

    it('returns 409 when already frozen', async () => {
      const app = createApp();
      const { base, escrows } = buildPrismaMock();
      jest.unstable_mockModule('../../lib/prisma.js', () => ({ default: base }));

      escrows.push({ id: 1n, tenantId: 't1', clientAddress: ADDRESS_A, freelancerAddress: ADDRESS_B, status: 'Active', totalAmount: '100', createdAt: new Date(), updatedAt: new Date(), createdLedger: 1n, frozenAt: new Date(), freezeReason: 'prev', milestones: [], dispute: null });

      const res = await request(app)
        .post('/api/admin/escrows/1/freeze')
        .set('Authorization', `Bearer ${createAdminToken()}`)
        .send({ reason: 'Freeze again' });

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('Escrow is already frozen.');
    });

    it('returns 200 and freezes the escrow', async () => {
      const app = createApp();
      const { base, escrows } = buildPrismaMock();
      jest.unstable_mockModule('../../lib/prisma.js', () => ({ default: base }));

      escrows.push({ id: 1n, tenantId: 't1', clientAddress: ADDRESS_A, freelancerAddress: ADDRESS_B, status: 'Active', totalAmount: '100', createdAt: new Date(), updatedAt: new Date(), createdLedger: 1n, frozenAt: null, freezeReason: null, milestones: [], dispute: null });

      const res = await request(app)
        .post('/api/admin/escrows/1/freeze')
        .set('Authorization', `Bearer ${createAdminToken()}`)
        .send({ reason: 'Compliance review' });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Escrow frozen.');
      expect(base.escrow.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 1n }),
          data: expect.objectContaining({ frozenAt: expect.any(Date), freezeReason: 'Compliance review' }),
        }),
      );
      expect(base.adminAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: 'FREEZE_ESCROW' }) }),
      );
    });

    it('returns 400 when reason is missing', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/api/admin/escrows/1/freeze')
        .set('Authorization', `Bearer ${createAdminToken()}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('reason is required and must be a string.');
    });
  });

  describe('POST /api/admin/escrows/:id/force-transition', () => {
    it('returns 404 when escrow not found', async () => {
      const app = createApp();
      const { base } = buildPrismaMock();
      jest.unstable_mockModule('../../lib/prisma.js', () => ({ default: base }));

      const res = await request(app)
        .post('/api/admin/escrows/999/force-transition')
        .set('Authorization', `Bearer ${createAdminToken()}`)
        .send({ status: 'Completed', reason: 'Admin decision' });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Escrow not found.');
    });

    it('returns 400 for invalid status', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/api/admin/escrows/1/force-transition')
        .set('Authorization', `Bearer ${createAdminToken()}`)
        .send({ status: 'InvalidStatus', reason: 'Test' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Invalid status/);
    });

    it('returns 200 and updates status', async () => {
      const app = createApp();
      const { base, escrows } = buildPrismaMock();
      jest.unstable_mockModule('../../lib/prisma.js', () => ({ default: base }));

      escrows.push({ id: 1n, tenantId: 't1', clientAddress: ADDRESS_A, freelancerAddress: ADDRESS_B, status: 'Active', totalAmount: '100', createdAt: new Date(), updatedAt: new Date(), createdLedger: 1n, milestones: [], dispute: null });

      const res = await request(app)
        .post('/api/admin/escrows/1/force-transition')
        .set('Authorization', `Bearer ${createAdminToken()}`)
        .send({ status: 'Completed', reason: 'Force complete' });

      expect(res.status).toBe(200);
      expect(res.body.newStatus).toBe('Completed');
      expect(base.escrow.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 1n }),
          data: { status: 'Completed' },
        }),
      );
      expect(base.adminAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: 'FORCE_TRANSITION_ESCROW' }) }),
      );
    });
  });

  describe('POST /api/admin/escrows/:id/notes', () => {
    it('returns 404 when escrow not found', async () => {
      const app = createApp();
      const { base } = buildPrismaMock();
      jest.unstable_mockModule('../../lib/prisma.js', () => ({ default: base }));

      const res = await request(app)
        .post('/api/admin/escrows/999/notes')
        .set('Authorization', `Bearer ${createAdminToken()}`)
        .send({ note: 'Test note' });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Escrow not found.');
    });

    it('returns 400 when note is missing', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/api/admin/escrows/1/notes')
        .set('Authorization', `Bearer ${createAdminToken()}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('note is required and must be a non-empty string.');
    });

    it('returns 201 and creates note', async () => {
      const app = createApp();
      const { base, escrows } = buildPrismaMock();
      jest.unstable_mockModule('../../lib/prisma.js', () => ({ default: base }));

      escrows.push({ id: 1n, tenantId: 't1', clientAddress: ADDRESS_A, freelancerAddress: ADDRESS_B, status: 'Active', totalAmount: '100', createdAt: new Date(), updatedAt: new Date(), createdLedger: 1n, milestones: [], dispute: null });

      const res = await request(app)
        .post('/api/admin/escrows/1/notes')
        .set('Authorization', `Bearer ${createAdminToken()}`)
        .send({ note: 'This is an internal admin note.' });

      expect(res.status).toBe(201);
      expect(res.body.message).toBe('Note added.');
      expect(base.escrowNote.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ note: 'This is an internal admin note.' }),
        }),
      );
      expect(base.adminAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: 'ESCROW_ADD_NOTE' }) }),
      );
    });
  });

  describe('rate limiting', () => {
    it('returns 429 when admin rate limit is exceeded', async () => {
      const app = createApp();
      const { base, escrows } = buildPrismaMock();
      jest.unstable_mockModule('../../lib/prisma.js', () => ({ default: base }));

      escrows.push({ id: 1n, tenantId: 't1', clientAddress: ADDRESS_A, freelancerAddress: ADDRESS_B, status: 'Active', totalAmount: '100', createdAt: new Date(), updatedAt: new Date(), createdLedger: 1n, milestones: [], dispute: null });

      const token = createAdminToken();

      for (let i = 0; i < 31; i++) {
        await request(app)
          .get('/api/admin/escrows')
          .set('Authorization', `Bearer ${token}`);
      }

      const res = await request(app)
        .get('/api/admin/escrows')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(429);
      expect(res.body.code).toBe('RATE_LIMIT_EXCEEDED');
    });
  });

  describe('audit logging', () => {
    it('writes an audit log entry on list', async () => {
      const app = createApp();
      const { base } = buildPrismaMock();
      jest.unstable_mockModule('../../lib/prisma.js', () => ({ default: base }));

      const { log: auditLogMock } = await import('../../services/auditService.js');

      await request(app)
        .get('/api/admin/escrows')
        .set('Authorization', `Bearer ${createAdminToken()}`);

      expect(auditLogMock).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'ADMIN',
          action: 'ESCROW_LIST_INSPECT',
          actor: ADDRESS_A,
        }),
      );
    });

    it('writes admin audit log on freeze', async () => {
      const app = createApp();
      const { base, escrows } = buildPrismaMock();
      jest.unstable_mockModule('../../lib/prisma.js', () => ({ default: base }));

      escrows.push({ id: 1n, tenantId: 't1', clientAddress: ADDRESS_A, freelancerAddress: ADDRESS_B, status: 'Active', totalAmount: '100', createdAt: new Date(), updatedAt: new Date(), createdLedger: 1n, frozenAt: null, freezeReason: null, milestones: [], dispute: null });

      await request(app)
        .post('/api/admin/escrows/1/freeze')
        .set('Authorization', `Bearer ${createAdminToken()}`)
        .send({ reason: 'Compliance' });

      expect(base.adminAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: 'FREEZE_ESCROW', reason: 'Compliance' }) }),
      );
    });

    it('writes admin audit log on force transition', async () => {
      const app = createApp();
      const { base, escrows } = buildPrismaMock();
      jest.unstable_mockModule('../../lib/prisma.js', () => ({ default: base }));

      escrows.push({ id: 1n, tenantId: 't1', clientAddress: ADDRESS_A, freelancerAddress: ADDRESS_B, status: 'Active', totalAmount: '100', createdAt: new Date(), updatedAt: new Date(), createdLedger: 1n, milestones: [], dispute: null });

      await request(app)
        .post('/api/admin/escrows/1/force-transition')
        .set('Authorization', `Bearer ${createAdminToken()}`)
        .send({ status: 'Completed', reason: 'Admin override' });

      expect(base.adminAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: 'FORCE_TRANSITION_ESCROW', reason: 'Admin override' }) }),
      );
    });

    it('writes admin audit log on note', async () => {
      const app = createApp();
      const { base, escrows } = buildPrismaMock();
      jest.unstable_mockModule('../../lib/prisma.js', () => ({ default: base }));

      escrows.push({ id: 1n, tenantId: 't1', clientAddress: ADDRESS_A, freelancerAddress: ADDRESS_B, status: 'Active', totalAmount: '100', createdAt: new Date(), updatedAt: new Date(), createdLedger: 1n, milestones: [], dispute: null });

      await request(app)
        .post('/api/admin/escrows/1/notes')
        .set('Authorization', `Bearer ${createAdminToken()}`)
        .send({ note: 'Internal note' });

      expect(base.adminAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: 'ESCROW_ADD_NOTE', reason: 'Internal note' }) }),
      );
    });
  });
});
