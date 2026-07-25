/**
 * Tests for the admin tenant management API: paginated list, detail usage
 * stats, plan update, and suspend/unsuspend propagation.
 */

import { jest } from '@jest/globals';

// ── Module mock (registered once, mutated per-test) ──────────────────────────

const tenants = [];
const escrows = [];
const users = [];
const auditLogs = [];
const adminAuditLogs = [];

function matchesTenantWhere(t, where = {}) {
  if (where.OR) {
    const orMatch = where.OR.some((c) => {
      if (c.id !== undefined) return t.id === c.id;
      if (typeof c.slug === 'string') return t.slug === c.slug;
      if (c.name?.contains) return t.name.toLowerCase().includes(c.name.contains.toLowerCase());
      if (c.slug?.contains) return t.slug.toLowerCase().includes(c.slug.contains.toLowerCase());
      return false;
    });
    if (!orMatch) return false;
  }
  if (where.plan && t.plan !== where.plan) return false;
  if (where.status && t.status !== where.status) return false;
  return true;
}

const prismaMock = {
  $transaction: jest.fn(async (arg) => {
    if (typeof arg === 'function') return arg(prismaMock);
    return Promise.all(arg);
  }),
  tenant: {
    findMany: jest.fn(async ({ where, skip = 0, take } = {}) => {
      let results = tenants.filter((t) => matchesTenantWhere(t, where));
      if (skip) results = results.slice(skip);
      if (take !== undefined) results = results.slice(0, take);
      return results;
    }),
    count: jest.fn(async ({ where } = {}) => tenants.filter((t) => matchesTenantWhere(t, where)).length),
    findFirst: jest.fn(async ({ where }) => tenants.find((t) => matchesTenantWhere(t, where)) || null),
    update: jest.fn(async ({ where, data }) => {
      const t = tenants.find((x) => x.id === where.id);
      Object.assign(t, data, { updatedAt: new Date() });
      return t;
    }),
    create: jest.fn(async ({ data }) => {
      const record = {
        id: `tenant_${tenants.length + 1}`,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data,
      };
      tenants.push(record);
      return record;
    }),
  },
  escrow: {
    count: jest.fn(
      async ({ where }) =>
        escrows.filter(
          (e) =>
            e.tenantId === where.tenantId &&
            (where.deletedAt === undefined || e.deletedAt === where.deletedAt),
        ).length,
    ),
  },
  user: {
    count: jest.fn(async ({ where }) => users.filter((u) => u.tenantId === where.tenantId).length),
  },
  auditLog: {
    count: jest.fn(
      async ({ where }) =>
        auditLogs.filter((a) => a.tenantId === where.tenantId && a.createdAt >= where.createdAt.gte)
          .length,
    ),
  },
  adminAuditLog: {
    create: jest.fn(async ({ data }) => {
      const record = { id: adminAuditLogs.length + 1, ...data };
      adminAuditLogs.push(record);
      return record;
    }),
  },
};

jest.unstable_mockModule('../lib/prisma.js', () => ({ default: prismaMock }));

const { default: tenantController } = await import('../api/controllers/tenantController.js');
const { default: tenantMiddleware } = await import('../api/middleware/tenant.js');

// ── Helpers ──────────────────────────────────────────────────────────────────

function mockRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    setHeader() {},
  };
}

function seedTenant(overrides = {}) {
  const record = {
    id: `tenant_${tenants.length + 1}`,
    slug: `tenant-${tenants.length + 1}`,
    name: `Tenant ${tenants.length + 1}`,
    status: 'active',
    domains: [],
    branding: null,
    configuration: null,
    metadata: null,
    plan: 'free',
    maxUsers: null,
    maxEscrowsPerMonth: null,
    suspendedAt: null,
    suspendReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
  tenants.push(record);
  return record;
}

beforeEach(() => {
  tenants.length = 0;
  escrows.length = 0;
  users.length = 0;
  auditLogs.length = 0;
  adminAuditLogs.length = 0;
  jest.clearAllMocks();
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('GET /api/admin/tenants — pagination', () => {
  it('paginates the tenant list', async () => {
    for (let i = 0; i < 5; i++) seedTenant();

    const res = mockRes();
    await tenantController.listTenants({ query: { page: '2', limit: '2' } }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.page).toBe(2);
    expect(res.body.total).toBe(5);
    expect(res.body.totalPages).toBe(3);
  });

  it('filters by plan and status', async () => {
    seedTenant({ plan: 'pro', status: 'active' });
    seedTenant({ plan: 'free', status: 'active' });
    seedTenant({ plan: 'pro', status: 'suspended' });

    const res = mockRes();
    await tenantController.listTenants(
      { query: { plan: 'pro', status: 'active' } },
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].plan).toBe('pro');
    expect(res.body.data[0].status).toBe('active');
  });
});

describe('GET /api/admin/tenants/:id — usage stats', () => {
  it('reports accurate escrow/user/API-call counts', async () => {
    const tenant = seedTenant({ plan: 'enterprise' });

    escrows.push({ tenantId: tenant.id, deletedAt: null });
    escrows.push({ tenantId: tenant.id, deletedAt: null });
    escrows.push({ tenantId: tenant.id, deletedAt: new Date() }); // soft-deleted, excluded
    users.push({ tenantId: tenant.id });
    users.push({ tenantId: tenant.id });
    users.push({ tenantId: tenant.id });

    const now = new Date();
    auditLogs.push({ tenantId: tenant.id, createdAt: now });
    auditLogs.push({ tenantId: tenant.id, createdAt: now });
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15);
    auditLogs.push({ tenantId: tenant.id, createdAt: lastMonth }); // excluded — not this month

    const res = mockRes();
    await tenantController.getTenant({ params: { tenantId: tenant.id } }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.tenant.plan).toBe('enterprise');
    expect(res.body.usage).toEqual({
      escrowCount: 2,
      userCount: 3,
      apiCallsThisMonth: 2,
    });
  });

  it('returns 404 for an unknown tenant', async () => {
    const res = mockRes();
    await tenantController.getTenant({ params: { tenantId: 'nope' } }, res);
    expect(res.statusCode).toBe(404);
  });
});

describe('PATCH /api/admin/tenants/:id — plan update', () => {
  it('updates plan, maxUsers, and maxEscrowsPerMonth', async () => {
    const tenant = seedTenant({ plan: 'free' });

    const res = mockRes();
    await tenantController.updateTenant(
      {
        params: { tenantId: tenant.id },
        body: { plan: 'pro', maxUsers: 25, maxEscrowsPerMonth: 100 },
      },
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body.tenant.plan).toBe('pro');
    expect(res.body.tenant.maxUsers).toBe(25);
    expect(res.body.tenant.maxEscrowsPerMonth).toBe(100);
  });

  it('rejects a non-integer maxUsers', async () => {
    const tenant = seedTenant();

    const res = mockRes();
    await tenantController.updateTenant(
      { params: { tenantId: tenant.id }, body: { maxUsers: 'lots' } },
      res,
    );

    expect(res.statusCode).toBe(400);
  });
});

describe('Suspend / unsuspend propagation', () => {
  it('suspend sets status=suspended with a reason, unsuspend clears it', async () => {
    const tenant = seedTenant({ status: 'active' });

    const suspendRes = mockRes();
    await tenantController.suspendTenant(
      { params: { tenantId: tenant.id }, body: { reason: 'Payment overdue' }, admin: { adminId: 'admin1' } },
      suspendRes,
    );
    expect(suspendRes.statusCode).toBe(200);
    expect(tenant.status).toBe('suspended');
    expect(tenant.suspendReason).toBe('Payment overdue');
    expect(adminAuditLogs.some((l) => l.action === 'SUSPEND_TENANT' && l.tenantId === tenant.id)).toBe(
      true,
    );

    const unsuspendRes = mockRes();
    await tenantController.unsuspendTenant(
      { params: { tenantId: tenant.id }, body: {}, admin: { adminId: 'admin1' } },
      unsuspendRes,
    );
    expect(unsuspendRes.statusCode).toBe(200);
    expect(tenant.status).toBe('active');
    expect(tenant.suspendReason).toBeNull();
  });

  it('a suspended tenant makes tenantMiddleware reject every request with "Tenant suspended"', async () => {
    seedTenant({ id: 'tenant_suspended', slug: 'suspended-co', status: 'suspended' });

    const req = { headers: { 'x-tenant-id': 'tenant_suspended' } };
    const res = mockRes();
    const next = jest.fn();

    await tenantMiddleware(req, res, next);

    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('Tenant suspended');
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 409 when suspending an already-suspended tenant', async () => {
    const tenant = seedTenant({ status: 'suspended' });

    const res = mockRes();
    await tenantController.suspendTenant(
      { params: { tenantId: tenant.id }, body: {}, admin: { adminId: 'admin1' } },
      res,
    );
    expect(res.statusCode).toBe(409);
  });
});
