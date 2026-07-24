/**
 * Admin Escrow Controller
 *
 * Admin-only operations for inspecting, freezing, force-transitioning,
 * and annotating escrows across all tenants.
 *
 * @module controllers/adminEscrowController
 */

import prisma from '../../lib/prisma.js';
import cache from '../../lib/cache.js';
import { buildPaginatedResponse, parsePagination } from '../../lib/pagination.js';
import { logControllerError } from '../../config/logger.js';
import { withTenantScopeBypassed } from '../../lib/tenantContext.js';
import auditService, { AuditAction, AuditCategory } from '../../services/auditService.js';

const ESCROW_ADMIN_SELECT = {
  id: true,
  tenantId: true,
  clientAddress: true,
  freelancerAddress: true,
  arbiterAddress: true,
  tokenAddress: true,
  totalAmount: true,
  remainingBalance: true,
  status: true,
  briefHash: true,
  deadline: true,
  createdAt: true,
  updatedAt: true,
  createdLedger: true,
  frozenAt: true,
  freezeReason: true,
};

const TENANT_SELECT = {
  id: true,
  slug: true,
  name: true,
  status: true,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

async function invalidateEscrowCache(id) {
  try {
    await cache.invalidateTags(['escrows', `escrow:${id}`]);
  } catch {
    // cache invalidation is best-effort
  }
}

function getAdminActor(req) {
  return req.user?.address || req.user?.id || 'admin';
}

function getIpAddress(req) {
  return req.ip || req.connection?.remoteAddress || null;
}

// ── Handlers ──────────────────────────────────────────────────────────────────

/**
 * GET /api/admin/escrows
 * List all escrows across tenants with full filter support.
 */
const listAdminEscrows = async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const {
      status,
      client,
      freelancer,
      search,
      minAmount,
      maxAmount,
      dateFrom,
      dateTo,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query;

    const where = {};

    if (status) {
      const statuses = String(status).split(',').map((s) => s.trim());
      where.status = { in: statuses };
    }

    if (client) {
      where.clientAddress = { contains: String(client), mode: 'insensitive' };
    }

    if (freelancer) {
      where.freelancerAddress = { contains: String(freelancer), mode: 'insensitive' };
    }

    if (search) {
      const q = String(search);
      where.OR = [
        { id: { equals: BigInt(q) } },
        { clientAddress: { contains: q, mode: 'insensitive' } },
        { freelancerAddress: { contains: q, mode: 'insensitive' } },
      ];
    }

    if (minAmount !== undefined || maxAmount !== undefined) {
      where.totalAmount = {};
      if (minAmount !== undefined) where.totalAmount.gte = String(minAmount);
      if (maxAmount !== undefined) where.totalAmount.lte = String(maxAmount);
    }

    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) where.createdAt.lte = new Date(dateTo);
    }

    const orderBy = { [sortBy]: sortOrder };

    const cacheKey = `admin:escrows:${JSON.stringify({ where, page, limit, sortBy, sortOrder })}`;
    const cached = await cache.get(cacheKey);
    if (cached) return res.json(cached);

    const [escrows, total] = await withTenantScopeBypassed(async () => {
      const [escrows, total] = await prisma.$transaction([
        prisma.escrow.findMany({
          where,
          skip,
          take: limit,
          orderBy,
          select: ESCROW_ADMIN_SELECT,
          include: {
            tenant: { select: TENANT_SELECT },
            milestones: { select: { id: true, milestoneIndex: true, status: true, title: true } },
          },
        }),
        prisma.escrow.count({ where }),
      ]);
      return [escrows, total];
    });

    const result = buildPaginatedResponse(escrows, { total, page, limit });
    await cache.set(cacheKey, result, 15);
    res.json(result);
  } catch (err) {
    logControllerError('adminEscrow.listAdminEscrows', err, req);
    res.status(500).json({ error: err.message });
  }
};

/**
 * POST /api/admin/escrows/:id/freeze
 * Prevent any state changes on the escrow.
 */
const freezeEscrow = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason = '' } = req.body;
    const actor = getAdminActor(req);
    const ip = getIpAddress(req);

    if (!reason || typeof reason !== 'string') {
      return res.status(400).json({ error: 'reason is required and must be a string.' });
    }

    const escrowId = BigInt(id);

    const result = await withTenantScopeBypassed(async () => {
      const escrow = await prisma.escrow.findFirst({
        where: { id: escrowId },
        select: { id: true, status: true, frozenAt: true, tenantId: true },
      });

      if (!escrow) return { error: 'Escrow not found.', status: 404 };
      if (escrow.frozenAt) return { error: 'Escrow is already frozen.', status: 409 };

      const [updated] = await Promise.all([
        prisma.escrow.updateMany({
          where: { id: escrowId },
          data: { frozenAt: new Date(), freezeReason: reason },
        }),
        Promise.all([
          prisma.adminAuditLog.create({
            data: {
              action: 'FREEZE_ESCROW',
              targetAddress: escrow.id.toString(),
              reason,
              performedBy: actor,
              performedAt: new Date(),
            },
          }),
          auditService.log({
            category: AuditCategory.ADMIN,
            action: AuditAction.FREEZE_ESCROW,
            actor,
            resourceId: escrow.id.toString(),
            metadata: { escrowId: escrow.id.toString(), tenantId: escrow.tenantId, previousStatus: escrow.status },
            statusCode: 200,
            ipAddress: ip,
          }),
        ]),
      ]);

      return { count: updated.count };
    });

    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }

    await invalidateEscrowCache(escrowId.toString());
    await cache.invalidatePrefix('admin:escrows');
    res.json({ message: 'Escrow frozen.', escrowId: escrowId.toString(), frozenAt: new Date().toISOString() });
  } catch (err) {
    logControllerError('adminEscrow.freezeEscrow', err, req);
    res.status(500).json({ error: err.message });
  }
};

/**
 * POST /api/admin/escrows/:id/force-transition
 * Manually move escrow to a specified state with reason.
 */
const forceTransition = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, reason = '' } = req.body;
    const actor = getAdminActor(req);
    const ip = getIpAddress(req);

    if (!status) {
      return res.status(400).json({ error: 'status is required.' });
    }

    const validStatuses = ['Active', 'Completed', 'Disputed', 'Cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Allowed: ${validStatuses.join(', ')}` });
    }

    const escrowId = BigInt(id);

    const result = await withTenantScopeBypassed(async () => {
      const escrow = await prisma.escrow.findFirst({
        where: { id: escrowId },
        select: { id: true, status: true, frozenAt: true, tenantId: true },
      });

      if (!escrow) return { error: 'Escrow not found.', status: 404 };

      const previousStatus = escrow.status;

      await Promise.all([
        prisma.escrow.updateMany({
          where: { id: escrowId },
          data: { status },
        }),
        prisma.adminAuditLog.create({
          data: {
            action: 'FORCE_TRANSITION_ESCROW',
            targetAddress: escrow.id.toString(),
            reason,
            performedBy: actor,
            performedAt: new Date(),
          },
        }),
        auditService.log({
          category: AuditCategory.ADMIN,
          action: AuditAction.FORCE_TRANSITION_ESCROW,
          actor,
          resourceId: escrow.id.toString(),
          metadata: { escrowId: escrow.id.toString(), tenantId: escrow.tenantId, previousStatus, newStatus: status },
          statusCode: 200,
          ipAddress: ip,
        }),
      ]);

      return null;
    });

    if (result?.error) {
      return res.status(result.status).json({ error: result.error });
    }

    await invalidateEscrowCache(escrowId.toString());
    await cache.invalidatePrefix('admin:escrows');
    res.json({ message: 'Escrow status updated.', escrowId: escrowId.toString(), previousStatus: result?.previousStatus, newStatus: status });
  } catch (err) {
    logControllerError('adminEscrow.forceTransition', err, req);
    res.status(500).json({ error: err.message });
  }
};

/**
 * POST /api/admin/escrows/:id/notes
 * Add an internal note visible only to admins.
 */
const addNote = async (req, res) => {
  try {
    const { id } = req.params;
    const { note } = req.body;
    const actor = getAdminActor(req);
    const ip = getIpAddress(req);

    if (!note || typeof note !== 'string' || note.trim().length === 0) {
      return res.status(400).json({ error: 'note is required and must be a non-empty string.' });
    }

    const escrowId = BigInt(id);

    let escrow = null;
    let tenantId = null;

    await withTenantScopeBypassed(async () => {
      escrow = await prisma.escrow.findFirst({
        where: { id: escrowId },
        select: { id: true, tenantId: true },
      });

      if (!escrow) return;

      tenantId = escrow.tenantId;

      await Promise.all([
        prisma.escrowNote.create({
          data: {
            tenantId: escrow.tenantId,
            escrowId: escrow.id,
            note: note.trim(),
            createdBy: actor,
          },
        }),
        prisma.adminAuditLog.create({
          data: {
            action: 'ESCROW_ADD_NOTE',
            targetAddress: escrow.id.toString(),
            reason: note.trim(),
            performedBy: actor,
            performedAt: new Date(),
          },
        }),
        auditService.log({
          category: AuditCategory.ADMIN,
          action: AuditAction.ESCROW_ADD_NOTE,
          actor,
          resourceId: escrow.id.toString(),
          metadata: { escrowId: escrow.id.toString(), tenantId },
          statusCode: 200,
          ipAddress: ip,
        }),
      ]);
    });

    if (!escrow) {
      return res.status(404).json({ error: 'Escrow not found.' });
    }

    await cache.invalidatePrefix('admin:escrows');
    res.status(201).json({ message: 'Note added.', escrowId: escrowId.toString() });
  } catch (err) {
    logControllerError('adminEscrow.addNote', err, req);
    res.status(500).json({ error: err.message });
  }
};

export default {
  listAdminEscrows,
  freezeEscrow,
  forceTransition,
  addNote,
};
