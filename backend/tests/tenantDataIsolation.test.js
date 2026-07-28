/**
 * Multi-tenant data isolation — integration tests
 *
 * These tests exercise the REAL tenant-scoping mechanism in lib/prisma.js (the
 * `$extends` query interceptor that injects `tenantId` into every tenant-scoped
 * query based on the AsyncLocalStorage context from lib/tenantContext.js).
 * lib/prisma.js itself is NOT mocked — only its underlying `@prisma/client` is,
 * via the project's shared manual mock (jest.config.js `moduleNameMapper`),
 * so the tenant-scoping extension code actually runs instead of being bypassed.
 *
 * Covers:
 *  1. escrowController.listEscrows / getEscrow — tenant A never sees tenant B's escrows
 *  2. escrowController.updateEscrowMetadata — tenant A cannot PATCH tenant B's escrow (404)
 *  3. auditService.search — tenant A's audit query never returns tenant B's events
 *  4. adminEscrowController.listAdminEscrows — the admin endpoint intentionally
 *     spans all tenants (via withTenantScopeBypassed), unlike the scoped ones above
 */

import { jest } from '@jest/globals';

jest.unstable_mockModule('../lib/connectionMonitor.js', () => ({
  attachConnectionMonitoring: jest.fn(),
  startConnectionMonitoring: jest.fn(),
  stopConnectionMonitoring: jest.fn(),
}));
jest.unstable_mockModule('../lib/retryUtils.js', () => ({
  attachRetryMiddleware: jest.fn(),
  isRetryableError: jest.fn(() => false),
  retryDatabaseOperation: jest.fn((op) => op()),
  retryConfig: {},
}));
jest.unstable_mockModule('../services/escrowArchiveService.js', () => ({
  listArchiveTables: jest.fn().mockResolvedValue([]),
}));
jest.unstable_mockModule('../services/stellarService.js', () => ({
  submitTransaction: jest.fn(),
  getContractEvents: jest.fn(),
  getLatestLedger: jest.fn(),
}));
jest.unstable_mockModule('@stellar/stellar-sdk', () => ({
  xdr: { ScVal: { fromXDR: jest.fn() } },
  scValToNative: jest.fn(),
}));

const cacheMock = {
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn(),
  invalidateTags: jest.fn(),
};
jest.unstable_mockModule('../lib/cache.js', () => ({ default: cacheMock }));

const { default: prisma } = await import('../lib/prisma.js');
const { runWithTenantContext } = await import('../lib/tenantContext.js');
const { default: escrowController } = await import('../api/controllers/escrowController.js');
const { default: adminEscrowController } =
  await import('../api/controllers/adminEscrowController.js');
const { search: searchAuditLog } = await import('../services/auditService.js');

const TENANT_A = { id: 'tenant_a', slug: 'alpha' };
const TENANT_B = { id: 'tenant_b', slug: 'beta' };

const ADDR_A_CLIENT = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const ADDR_A_FREELANCER = 'GAFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const ADDR_B_CLIENT = 'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';
const ADDR_B_FREELANCER = 'GBFBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';

async function seedTenantData() {
  await runWithTenantContext(TENANT_A, async () => {
    await prisma.escrow.create({
      data: {
        id: 1n,
        clientAddress: ADDR_A_CLIENT,
        freelancerAddress: ADDR_A_FREELANCER,
        status: 'Active',
        totalAmount: '1000',
        remainingBalance: '1000',
        deadline: null,
        deletedAt: null,
        metadata: {},
        createdAt: new Date('2026-01-01T00:00:00Z'),
      },
    });
    await prisma.auditLog.create({
      data: {
        category: 'ESCROW',
        action: 'CREATE',
        actor: ADDR_A_CLIENT,
        resourceId: '1',
        createdAt: new Date('2026-01-01T00:00:00Z'),
      },
    });
  });

  await runWithTenantContext(TENANT_B, async () => {
    await prisma.escrow.create({
      data: {
        id: 2n,
        clientAddress: ADDR_B_CLIENT,
        freelancerAddress: ADDR_B_FREELANCER,
        status: 'Active',
        totalAmount: '2000',
        remainingBalance: '2000',
        deadline: null,
        deletedAt: null,
        metadata: {},
        createdAt: new Date('2026-01-02T00:00:00Z'),
      },
    });
    await prisma.auditLog.create({
      data: {
        category: 'ESCROW',
        action: 'CREATE',
        actor: ADDR_B_CLIENT,
        resourceId: '2',
        createdAt: new Date('2026-01-02T00:00:00Z'),
      },
    });
  });
}

await seedTenantData();

function createRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

describe('multi-tenant data isolation', () => {
  describe('escrowController.listEscrows', () => {
    it('only returns tenant A escrows when called in tenant A context', async () => {
      const req = { query: {} };
      const res = createRes();

      await runWithTenantContext(TENANT_A, () => escrowController.listEscrows(req, res));

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].id).toBe(1n);
    });

    it('only returns tenant B escrows when called in tenant B context', async () => {
      const req = { query: {} };
      const res = createRes();

      await runWithTenantContext(TENANT_B, () => escrowController.listEscrows(req, res));

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].id).toBe(2n);
    });
  });

  describe('escrowController.getEscrow', () => {
    it("returns 404 when tenant A requests tenant B's escrow by id", async () => {
      const req = { params: { id: '2' } };
      const res = createRes();

      await runWithTenantContext(TENANT_A, () => escrowController.getEscrow(req, res));

      expect(res.statusCode).toBe(404);
    });

    it('returns the escrow when a tenant requests its own escrow', async () => {
      const req = { params: { id: '1' } };
      const res = createRes();

      await runWithTenantContext(TENANT_A, () => escrowController.getEscrow(req, res));

      expect(res.statusCode).toBe(200);
      expect(res.body.id).toBe(1n);
    });
  });

  describe('escrowController.updateEscrowMetadata', () => {
    it("cannot PATCH another tenant's escrow (surfaces as 404, not 200/403)", async () => {
      const req = {
        params: { id: '2' },
        body: { metadata: { propertyType: 'condo' } },
        user: { address: ADDR_A_CLIENT },
      };
      const res = createRes();

      await runWithTenantContext(TENANT_A, () => escrowController.updateEscrowMetadata(req, res));

      expect(res.statusCode).toBe(404);

      // Tenant B's escrow must remain untouched.
      const checkReq = { params: { id: '2' } };
      const checkRes = createRes();
      await runWithTenantContext(TENANT_B, () => escrowController.getEscrow(checkReq, checkRes));
      expect(checkRes.body.metadata).toEqual({});
    });

    it('can PATCH its own escrow', async () => {
      const req = {
        params: { id: '1' },
        body: { metadata: { propertyType: 'condo' } },
        user: { address: ADDR_A_CLIENT },
      };
      const res = createRes();

      await runWithTenantContext(TENANT_A, () => escrowController.updateEscrowMetadata(req, res));

      expect(res.statusCode).toBe(200);
      expect(res.body.metadata).toEqual({ propertyType: 'condo' });
    });
  });

  describe('auditService.search — tenant-scoped endpoint', () => {
    it("tenant A's audit log query never returns tenant B's events", async () => {
      const resultA = await runWithTenantContext(TENANT_A, () => searchAuditLog({}));
      expect(resultA.data).toHaveLength(1);
      expect(resultA.data[0].tenantId).toBe('tenant_a');

      const resultB = await runWithTenantContext(TENANT_B, () => searchAuditLog({}));
      expect(resultB.data).toHaveLength(1);
      expect(resultB.data[0].tenantId).toBe('tenant_b');
    });
  });

  describe('adminEscrowController.listAdminEscrows — admin endpoint spans all tenants', () => {
    it("returns escrows from every tenant regardless of the caller's ambient tenant context", async () => {
      const req = { query: {}, user: { address: 'admin' }, ip: '127.0.0.1' };
      const res = createRes();

      // Even though the request happens to run inside tenant A's context, the
      // admin endpoint must bypass scoping and see both tenants' escrows —
      // this is the intended admin/scoped distinction, backed by
      // withTenantScopeBypassed() in the controller.
      await runWithTenantContext(TENANT_A, () => adminEscrowController.listAdminEscrows(req, res));

      expect(res.statusCode).toBe(200);
      const ids = res.body.data.map((e) => e.id).sort();
      expect(ids).toEqual([1n, 2n]);
    });
  });
});
