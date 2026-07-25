/**
 * Tests for escrow soft-delete: DELETE /api/escrows/:id, exclusion from the
 * default list, admin ?include_deleted=true, and admin restore.
 */

import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const ADDRESS_CLIENT = `G${'A'.repeat(55)}`;
const ADDRESS_FREELANCER = `G${'B'.repeat(55)}`;

// ── Module mock (registered once, mutated per-test) ──────────────────────────

const escrows = [];

const cacheMock = {
  invalidateTags: jest.fn(),
  invalidatePrefix: jest.fn(),
  get: jest.fn(),
  set: jest.fn(),
};

// adminEscrowController imports auditService as a default export (`import auditService from ...`),
// so the mock's `default.log` — not the named-export-level `log` — is what it actually calls.
const auditLogFn = jest.fn().mockResolvedValue(undefined);
const auditServiceMock = {
  log: auditLogFn,
  AuditCategory: { ADMIN: 'ADMIN' },
  AuditAction: {
    FREEZE_ESCROW: 'FREEZE_ESCROW',
    FORCE_TRANSITION_ESCROW: 'FORCE_TRANSITION_ESCROW',
    ESCROW_ADD_NOTE: 'ESCROW_ADD_NOTE',
    SOFT_DELETE_ESCROW: 'SOFT_DELETE_ESCROW',
    RESTORE_ESCROW: 'RESTORE_ESCROW',
  },
  default: { log: auditLogFn },
};

function matchesWhere(escrow, where = {}) {
  if (where.deletedAt === null && escrow.deletedAt !== null) return false;
  if (where.status?.in && !where.status.in.includes(escrow.status)) return false;
  if (where.status && typeof where.status === 'string' && escrow.status !== where.status) return false;
  return true;
}

const prismaMock = {
  $transaction: jest.fn(async (ops) => Promise.all(ops)),
  adminAuditLog: {
    create: jest.fn(async ({ data }) => ({ id: 1, ...data })),
  },
  escrow: {
    findMany: jest.fn(async ({ where } = {}) => escrows.filter((e) => matchesWhere(e, where))),
    count: jest.fn(async ({ where } = {}) => escrows.filter((e) => matchesWhere(e, where)).length),
    findUnique: jest.fn(async ({ where }) => escrows.find((e) => e.id === where.id) || null),
    findFirst: jest.fn(async ({ where }) => escrows.find((e) => e.id === where.id) || null),
    update: jest.fn(async ({ where, data }) => {
      const record = escrows.find((e) => e.id === where.id);
      Object.assign(record, data);
      return record;
    }),
    updateMany: jest.fn(async ({ where, data }) => {
      let count = 0;
      for (const e of escrows) {
        if (e.id === where.id) {
          Object.assign(e, data);
          count++;
        }
      }
      return { count };
    }),
  },
};

jest.unstable_mockModule('../lib/prisma.js', () => ({ default: prismaMock }));
jest.unstable_mockModule('../lib/cache.js', () => ({ default: cacheMock }));
jest.unstable_mockModule('../services/auditService.js', () => auditServiceMock);

const { default: escrowController } = await import('../api/controllers/escrowController.js');
const { default: adminEscrowController } = await import('../api/controllers/adminEscrowController.js');

// ── Helpers ──────────────────────────────────────────────────────────────────

function createApp() {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.user = { address: ADDRESS_CLIENT };
    next();
  });
  app.delete('/api/escrows/:id', escrowController.deleteEscrow);
  app.get('/api/escrows', escrowController.listEscrows);
  app.get('/api/admin/escrows', adminEscrowController.listAdminEscrows);
  app.post('/api/admin/escrows/:id/restore', adminEscrowController.restoreEscrow);
  return app;
}

function seedEscrow(overrides = {}) {
  const record = {
    id: BigInt(overrides.id ?? escrows.length + 1),
    tenantId: 'tenant_default',
    clientAddress: ADDRESS_CLIENT,
    freelancerAddress: ADDRESS_FREELANCER,
    arbiterAddress: null,
    tokenAddress: 'TOKENADDR',
    totalAmount: '1000',
    remainingBalance: '1000',
    status: 'Draft',
    briefHash: '',
    title: 'Test Escrow',
    description: null,
    ownerId: ADDRESS_CLIENT,
    deletedAt: null,
    deadline: null,
    createdAt: new Date(),
    createdLedger: BigInt(0),
    ...overrides,
    id: BigInt(overrides.id ?? escrows.length + 1),
  };
  escrows.push(record);
  return record;
}

beforeEach(() => {
  escrows.length = 0;
  jest.clearAllMocks();
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('DELETE /api/escrows/:id', () => {
  it('soft-deletes a Draft escrow', async () => {
    const app = createApp();
    seedEscrow({ status: 'Draft' });

    const res = await request(app).delete('/api/escrows/1');

    expect(res.status).toBe(200);
    expect(res.body.deletedAt).toBeTruthy();
    expect(escrows[0].deletedAt).not.toBeNull();
  });

  it('soft-deletes a Cancelled escrow', async () => {
    const app = createApp();
    seedEscrow({ status: 'Cancelled' });

    const res = await request(app).delete('/api/escrows/1');

    expect(res.status).toBe(200);
    expect(escrows[0].deletedAt).not.toBeNull();
  });

  it('rejects deleting an Active escrow', async () => {
    const app = createApp();
    seedEscrow({ status: 'Active' });

    const res = await request(app).delete('/api/escrows/1');

    expect(res.status).toBe(400);
    expect(escrows[0].deletedAt).toBeNull();
  });

  it('returns 404 for a non-existent escrow', async () => {
    const app = createApp();
    const res = await request(app).delete('/api/escrows/999');
    expect(res.status).toBe(404);
  });

  it('returns 409 when already deleted', async () => {
    const app = createApp();
    seedEscrow({ status: 'Draft', deletedAt: new Date() });

    const res = await request(app).delete('/api/escrows/1');
    expect(res.status).toBe(409);
  });
});

describe('GET /api/escrows — excludes soft-deleted rows', () => {
  it('does not include a soft-deleted escrow in the default list', async () => {
    const app = createApp();
    seedEscrow({ status: 'Active', deletedAt: null });
    seedEscrow({ status: 'Cancelled', deletedAt: new Date() });

    const res = await request(app).get('/api/escrows');

    expect(res.status).toBe(200);
    const ids = res.body.data.map((e) => String(e.id));
    expect(ids).toEqual(['1']);
  });
});

describe('GET /api/admin/escrows?include_deleted=true', () => {
  it('excludes deleted escrows by default', async () => {
    const app = createApp();
    seedEscrow({ status: 'Active', deletedAt: null });
    seedEscrow({ status: 'Cancelled', deletedAt: new Date() });

    const res = await request(app).get('/api/admin/escrows');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('includes deleted escrows when include_deleted=true', async () => {
    const app = createApp();
    seedEscrow({ status: 'Active', deletedAt: null });
    seedEscrow({ status: 'Cancelled', deletedAt: new Date() });

    const res = await request(app).get('/api/admin/escrows?include_deleted=true');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
  });
});

describe('POST /api/admin/escrows/:id/restore', () => {
  it('clears deletedAt on a soft-deleted escrow', async () => {
    const app = createApp();
    seedEscrow({ status: 'Cancelled', deletedAt: new Date() });

    const res = await request(app).post('/api/admin/escrows/1/restore');

    expect(res.status).toBe(200);
    expect(escrows[0].deletedAt).toBeNull();
    expect(auditLogFn).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'RESTORE_ESCROW' }),
    );
  });

  it('returns 409 when the escrow is not deleted', async () => {
    const app = createApp();
    seedEscrow({ status: 'Cancelled', deletedAt: null });

    const res = await request(app).post('/api/admin/escrows/1/restore');
    expect(res.status).toBe(409);
  });

  it('returns 404 for a non-existent escrow', async () => {
    const app = createApp();
    const res = await request(app).post('/api/admin/escrows/999/restore');
    expect(res.status).toBe(404);
  });
});
