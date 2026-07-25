import prisma from '../../lib/prisma.js';
import { withTenantScopeBypassed } from '../../lib/tenantContext.js';
import { parsePagination, buildPaginatedResponse } from '../../lib/pagination.js';

function normalizeSlug(value) {
  return (
    value
      ?.trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-{2,}/g, '-') ?? ''
  );
}

function sanitizeTenant(tenant) {
  if (!tenant) return null;

  return {
    id: tenant.id,
    slug: tenant.slug,
    name: tenant.name,
    status: tenant.status,
    domains: tenant.domains,
    branding: tenant.branding ?? {},
    configuration: tenant.configuration ?? {},
    metadata: tenant.metadata ?? {},
    plan: tenant.plan,
    maxUsers: tenant.maxUsers ?? null,
    maxEscrowsPerMonth: tenant.maxEscrowsPerMonth ?? null,
    suspendedAt: tenant.suspendedAt ?? null,
    suspendReason: tenant.suspendReason ?? null,
    createdAt: tenant.createdAt,
    updatedAt: tenant.updatedAt,
  };
}

/**
 * Usage stats for a tenant. apiCallsThisMonth is the count of audited
 * actions (AuditLog rows) this calendar month — a proxy for API activity
 * rather than a raw per-request counter, since request-level counting isn't
 * tracked per-tenant elsewhere in the app.
 */
async function computeTenantUsage(tenantId) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [escrowCount, userCount, apiCallsThisMonth] = await prisma.$transaction([
    prisma.escrow.count({ where: { tenantId, deletedAt: null } }),
    prisma.user.count({ where: { tenantId } }),
    prisma.auditLog.count({ where: { tenantId, createdAt: { gte: monthStart } } }),
  ]);

  return { escrowCount, userCount, apiCallsThisMonth };
}

const getCurrentTenant = async (req, res) => {
  res.json({ tenant: sanitizeTenant(req.tenant) });
};

/**
 * GET /api/admin/tenants
 * Paginated list with optional search (name/slug) and plan/status filters.
 */
const listTenants = async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const { search, plan, status } = req.query;

    const where = {};
    if (search) {
      const term = String(search);
      where.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { slug: { contains: term, mode: 'insensitive' } },
      ];
    }
    if (plan) where.plan = String(plan);
    if (status) where.status = String(status);

    const [tenants, total] = await withTenantScopeBypassed(() =>
      prisma.$transaction([
        prisma.tenant.findMany({ where, orderBy: { createdAt: 'asc' }, skip, take: limit }),
        prisma.tenant.count({ where }),
      ]),
    );

    res.json(buildPaginatedResponse(tenants.map(sanitizeTenant), { page, limit, total }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const createTenant = async (req, res) => {
  try {
    const slug = normalizeSlug(req.body.slug);
    const {
      name,
      domains = [],
      branding = {},
      configuration = {},
      metadata = {},
      status = 'active',
    } = req.body;

    if (!slug || !name?.trim()) {
      return res.status(400).json({ error: 'slug and name are required' });
    }

    const tenant = await withTenantScopeBypassed(() =>
      prisma.tenant.create({
        data: {
          slug,
          name: name.trim(),
          status,
          domains,
          branding,
          configuration,
          metadata,
        },
      }),
    );

    res.status(201).json({ tenant: sanitizeTenant(tenant) });
  } catch (err) {
    const statusCode = err.code === 'P2002' ? 409 : 500;
    res
      .status(statusCode)
      .json({ error: statusCode === 409 ? 'Tenant already exists' : err.message });
  }
};

/**
 * GET /api/admin/tenants/:id
 * Tenant detail: plan/limits plus usage stats (escrow count, user count,
 * API calls this month).
 */
const getTenant = async (req, res) => {
  try {
    const { tenantId } = req.params;

    const result = await withTenantScopeBypassed(async () => {
      const tenant = await prisma.tenant.findFirst({
        where: {
          OR: [{ id: tenantId }, { slug: normalizeSlug(tenantId) }],
        },
      });
      if (!tenant) return null;

      const usage = await computeTenantUsage(tenant.id);
      return { tenant, usage };
    });

    if (!result) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    res.json({ tenant: sanitizeTenant(result.tenant), usage: result.usage });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const updateTenant = async (req, res) => {
  try {
    const { tenantId } = req.params;
    const updates = {};
    const allowedFields = [
      'name',
      'status',
      'domains',
      'branding',
      'configuration',
      'metadata',
      'plan',
      'maxUsers',
      'maxEscrowsPerMonth',
    ];

    for (const field of ['maxUsers', 'maxEscrowsPerMonth']) {
      const value = req.body[field];
      if (value !== undefined && value !== null && !Number.isInteger(value)) {
        return res.status(400).json({ error: `${field} must be an integer or null` });
      }
    }

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    if (req.body.slug !== undefined) {
      const slug = normalizeSlug(req.body.slug);
      if (!slug) {
        return res.status(400).json({ error: 'slug cannot be empty' });
      }
      updates.slug = slug;
    }

    const tenant = await withTenantScopeBypassed(async () => {
      const existingTenant = await prisma.tenant.findFirst({
        where: {
          OR: [{ id: tenantId }, { slug: normalizeSlug(tenantId) }],
        },
      });

      if (!existingTenant) return null;

      return prisma.tenant.update({
        where: { id: existingTenant.id },
        data: updates,
      });
    });

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    res.json({ tenant: sanitizeTenant(tenant) });
  } catch (err) {
    const statusCode = err.code === 'P2002' ? 409 : 500;
    res
      .status(statusCode)
      .json({ error: statusCode === 409 ? 'Tenant slug already exists' : err.message });
  }
};

/**
 * POST /api/admin/tenants/:id/suspend
 * Suspends a tenant. tenantMiddleware already 403s every request for a
 * non-active tenant, so this immediately blocks all of that tenant's users.
 */
const suspendTenant = async (req, res) => {
  try {
    const { tenantId } = req.params;
    const { reason = 'No reason provided' } = req.body;

    const result = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.findFirst({
        where: { OR: [{ id: tenantId }, { slug: normalizeSlug(tenantId) }] },
      });
      if (!tenant) return null;
      if (tenant.status === 'suspended') return { alreadySuspended: true };

      const updated = await tx.tenant.update({
        where: { id: tenant.id },
        data: { status: 'suspended', suspendedAt: new Date(), suspendReason: reason },
      });

      await tx.adminAuditLog.create({
        data: {
          tenantId: tenant.id,
          action: 'SUSPEND_TENANT',
          targetAddress: tenant.id,
          reason,
          performedBy: req.admin?.adminId ?? 'admin',
          performedAt: new Date(),
        },
      });

      return { tenant: updated };
    });

    if (!result) return res.status(404).json({ error: 'Tenant not found' });
    if (result.alreadySuspended) {
      return res.status(409).json({ error: 'Tenant is already suspended.' });
    }

    res.json({
      message: `Tenant ${result.tenant.slug} suspended.`,
      tenant: sanitizeTenant(result.tenant),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * POST /api/admin/tenants/:id/unsuspend
 */
const unsuspendTenant = async (req, res) => {
  try {
    const { tenantId } = req.params;
    const { reason = 'Suspension lifted by admin' } = req.body;

    const result = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.findFirst({
        where: { OR: [{ id: tenantId }, { slug: normalizeSlug(tenantId) }] },
      });
      if (!tenant) return null;
      if (tenant.status !== 'suspended') {
        return { notSuspended: true, currentStatus: tenant.status };
      }

      const updated = await tx.tenant.update({
        where: { id: tenant.id },
        data: { status: 'active', suspendedAt: null, suspendReason: null },
      });

      await tx.adminAuditLog.create({
        data: {
          tenantId: tenant.id,
          action: 'UNSUSPEND_TENANT',
          targetAddress: tenant.id,
          reason,
          performedBy: req.admin?.adminId ?? 'admin',
          performedAt: new Date(),
        },
      });

      return { tenant: updated };
    });

    if (!result) return res.status(404).json({ error: 'Tenant not found' });
    if (result.notSuspended) {
      return res
        .status(409)
        .json({ error: `Tenant is not suspended (current status: ${result.currentStatus}).` });
    }

    res.json({
      message: `Tenant ${result.tenant.slug} unsuspended.`,
      tenant: sanitizeTenant(result.tenant),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getTenantMetrics = async (req, res) => {
  try {
    const { tenantId } = req.params;

    const tenant = await withTenantScopeBypassed(() =>
      prisma.tenant.findFirst({
        where: {
          OR: [{ id: tenantId }, { slug: normalizeSlug(tenantId) }],
        },
      }),
    );

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const scopedWhere = { tenantId: tenant.id };

    const [users, escrows, activeEscrows, disputes, openDisputes, payments, events, kyc] =
      await withTenantScopeBypassed(() =>
        prisma.$transaction([
          prisma.user.count({ where: scopedWhere }),
          prisma.escrow.count({ where: scopedWhere }),
          prisma.escrow.count({ where: { ...scopedWhere, status: 'Active' } }),
          prisma.dispute.count({ where: scopedWhere }),
          prisma.dispute.count({ where: { ...scopedWhere, resolvedAt: null } }),
          prisma.payment.count({ where: scopedWhere }),
          prisma.contractEvent.count({ where: scopedWhere }),
          prisma.kycVerification.count({ where: scopedWhere }),
        ]),
      );

    res.json({
      tenant: sanitizeTenant(tenant),
      metrics: {
        users,
        escrows,
        activeEscrows,
        disputes,
        openDisputes,
        payments,
        events,
        kycVerifications: kyc,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export default {
  getCurrentTenant,
  listTenants,
  createTenant,
  getTenant,
  updateTenant,
  suspendTenant,
  unsuspendTenant,
  getTenantMetrics,
};
