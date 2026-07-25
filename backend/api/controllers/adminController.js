/**
 * Admin Controller
 *
 * Handles all admin-only operations: user management, dispute resolution,
 * platform statistics, fee management, and audit logs.
 *
 * @module controllers/adminController
 */

import prisma from '../../lib/prisma.js';

// ── Users ──────────────────────────────────────────────────────────────────────

/**
 * GET /api/admin/users
 * Returns a paginated list of all users (reputation records).
 */
const listUsers = async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '' } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = search ? { address: { contains: search, mode: 'insensitive' } } : {};

    const [users, total] = await Promise.all([
      prisma.reputationRecord.findMany({
        where,
        skip,
        take: parseInt(limit),
        orderBy: { totalScore: 'desc' },
      }),
      prisma.reputationRecord.count({ where }),
    ]);

    res.json({
      users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * GET /api/admin/users/:address
 * Returns a detailed profile for a specific user.
 */
const getUserDetail = async (req, res) => {
  try {
    const { address } = req.params;

    const [reputation, escrowsAsClient, escrowsAsFreelancer] = await Promise.all([
      prisma.reputationRecord.findUnique({ where: { address } }),
      prisma.escrow.count({ where: { clientAddress: address } }),
      prisma.escrow.count({ where: { freelancerAddress: address } }),
    ]);

    if (!reputation) {
      return res.status(404).json({ error: 'User not found.' });
    }

    res.json({
      address,
      reputation,
      stats: { escrowsAsClient, escrowsAsFreelancer },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * POST /api/admin/users/:address/suspend
 * Suspends a user (sets a suspension flag in the audit log — placeholder).
 *
 * NOTE: The current schema does not have a `suspended` field on users.
 * This endpoint logs the action and returns the audit entry.
 * See Issue #23 for schema updates.
 */
const suspendUser = async (req, res) => {
  try {
    const { address } = req.params;
    const { reason = 'No reason provided' } = req.body;

    const user = await prisma.reputationRecord.findUnique({ where: { address } });
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // Log the action for audit trail
    const auditEntry = await prisma.adminAuditLog.create({
      data: {
        action: 'SUSPEND_USER',
        targetAddress: address,
        reason,
        performedBy: 'admin',
        performedAt: new Date(),
      },
    });

    res.json({
      message: `User ${address} suspended.`,
      auditEntry,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * POST /api/admin/users/:address/ban
 * Permanently bans a user.
 */
const banUser = async (req, res) => {
  try {
    const { address } = req.params;
    const { reason = 'No reason provided' } = req.body;

    const user = await prisma.reputationRecord.findUnique({ where: { address } });
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const auditEntry = await prisma.adminAuditLog.create({
      data: {
        action: 'BAN_USER',
        targetAddress: address,
        reason,
        performedBy: 'admin',
        performedAt: new Date(),
      },
    });

    res.json({
      message: `User ${address} banned.`,
      auditEntry,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── Disputes ───────────────────────────────────────────────────────────────────

/**
 * GET /api/admin/disputes
 * Returns a paginated list of all disputes.
 */
const listDisputes = async (req, res) => {
  try {
    const { page = 1, limit = 20, resolved } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where =
      resolved === 'true'
        ? { resolvedAt: { not: null } }
        : resolved === 'false'
          ? { resolvedAt: null }
          : {};

    const [disputes, total] = await Promise.all([
      prisma.dispute.findMany({
        where,
        skip,
        take: parseInt(limit),
        orderBy: { raisedAt: 'desc' },
        include: {
          escrow: {
            select: {
              clientAddress: true,
              freelancerAddress: true,
              totalAmount: true,
              status: true,
            },
          },
        },
      }),
      prisma.dispute.count({ where }),
    ]);

    res.json({
      disputes,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * POST /api/admin/disputes/:id/resolve
 * Resolves an open dispute by recording the admin's decision.
 *
 * Body: { clientAmount: string, freelancerAmount: string, notes: string }
 */
const resolveDispute = async (req, res) => {
  try {
    const { id } = req.params;
    const { clientAmount, freelancerAmount, notes = '' } = req.body;

    if (clientAmount === undefined || freelancerAmount === undefined) {
      return res.status(400).json({ error: 'clientAmount and freelancerAmount are required.' });
    }

    const dispute = await prisma.dispute.findUnique({
      where: { id: parseInt(id) },
    });

    if (!dispute) {
      return res.status(404).json({ error: 'Dispute not found.' });
    }

    if (dispute.resolvedAt) {
      return res.status(409).json({ error: 'Dispute already resolved.' });
    }

    const updated = await prisma.dispute.update({
      where: { id: parseInt(id) },
      data: {
        resolvedAt: new Date(),
        clientAmount: String(clientAmount),
        freelancerAmount: String(freelancerAmount),
        resolvedBy: 'admin',
      },
    });

    // Audit log
    await prisma.adminAuditLog.create({
      data: {
        action: 'RESOLVE_DISPUTE',
        targetAddress: dispute.escrowId.toString(),
        reason: notes,
        performedBy: 'admin',
        performedAt: new Date(),
      },
    });

    res.json({ message: 'Dispute resolved.', dispute: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── Platform Statistics ────────────────────────────────────────────────────────

/**
 * GET /api/admin/stats
 * Returns aggregated platform statistics.
 */
const getStats = async (req, res) => {
  try {
    const [
      totalEscrows,
      activeEscrows,
      completedEscrows,
      disputedEscrows,
      totalUsers,
      openDisputes,
    ] = await Promise.all([
      prisma.escrow.count(),
      prisma.escrow.count({ where: { status: 'Active' } }),
      prisma.escrow.count({ where: { status: 'Completed' } }),
      prisma.escrow.count({ where: { status: 'Disputed' } }),
      prisma.reputationRecord.count(),
      prisma.dispute.count({ where: { resolvedAt: null } }),
    ]);

    res.json({
      escrows: {
        total: totalEscrows,
        active: activeEscrows,
        completed: completedEscrows,
        disputed: disputedEscrows,
      },
      users: { total: totalUsers },
      disputes: { open: openDisputes, resolved: disputedEscrows - openDisputes },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── Audit Logs ─────────────────────────────────────────────────────────────────

const AUDIT_LOG_EXPORT_MAX_ROWS = 10000;

/**
 * Builds a Prisma `where` clause from audit log filter query params.
 * Throws a validation error (with `.statusCode`) if neither actor_id nor
 * resource_id is present, to prevent unfiltered full-table scans.
 */
function buildAuditLogWhere(query) {
  const { actor_id, action, resource_type, resource_id, from, to } = query;

  if (!actor_id && !resource_id) {
    const err = new Error('At least one of actor_id or resource_id is required.');
    err.statusCode = 400;
    throw err;
  }

  const where = {};
  if (actor_id) where.performedBy = actor_id;
  if (action) where.action = action;
  if (resource_type) where.resourceType = resource_type;
  if (resource_id) where.targetAddress = resource_id;

  if (from || to) {
    where.performedAt = {};
    if (from) {
      const fromDate = new Date(from);
      if (isNaN(fromDate.getTime())) {
        const err = new Error('Invalid "from" date.');
        err.statusCode = 400;
        throw err;
      }
      where.performedAt.gte = fromDate;
    }
    if (to) {
      const toDate = new Date(to);
      if (isNaN(toDate.getTime())) {
        const err = new Error('Invalid "to" date.');
        err.statusCode = 400;
        throw err;
      }
      where.performedAt.lte = toDate;
    }
  }

  return where;
}

/**
 * GET /api/admin/audit-logs
 * Returns a paginated, filterable audit log of all admin actions.
 *
 * @query  page, limit, actor_id, action, resource_type, resource_id, from, to
 *         At least one of actor_id or resource_id is required.
 */
const getAuditLogs = async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const where = buildAuditLogWhere(req.query);

    const [logs, total] = await Promise.all([
      prisma.adminAuditLog.findMany({
        where,
        skip,
        take: parseInt(limit),
        orderBy: { performedAt: 'desc' },
      }),
      prisma.adminAuditLog.count({ where }),
    ]);

    res.json({
      logs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
};

/** Escapes a single CSV field per RFC 4180. */
function csvEscape(value) {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

const AUDIT_LOG_CSV_COLUMNS = [
  'id',
  'action',
  'targetAddress',
  'resourceType',
  'reason',
  'performedBy',
  'performedAt',
];

/**
 * GET /api/admin/audit-logs/export.csv
 * Streams a CSV export of audit logs matching the same filters as
 * GET /api/admin/audit-logs. Capped at AUDIT_LOG_EXPORT_MAX_ROWS rows.
 *
 * @query  actor_id, action, resource_type, resource_id, from, to
 *         At least one of actor_id or resource_id is required.
 */
const exportAuditLogsCsv = async (req, res) => {
  let where;
  try {
    where = buildAuditLogWhere(req.query);
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message });
  }

  try {
    const logs = await prisma.adminAuditLog.findMany({
      where,
      take: AUDIT_LOG_EXPORT_MAX_ROWS,
      orderBy: { performedAt: 'desc' },
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="audit-log-export.csv"');

    res.write(AUDIT_LOG_CSV_COLUMNS.join(',') + '\n');
    for (const log of logs) {
      const row = AUDIT_LOG_CSV_COLUMNS.map((col) => csvEscape(log[col])).join(',');
      res.write(row + '\n');
    }
    res.end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── Fee Management ─────────────────────────────────────────────────────────────

/**
 * GET /api/admin/settings
 * Returns platform settings (fee, etc.) from env/config.
 *
 * TODO (Issue #23): Persist settings to DB for dynamic configuration.
 */
const getSettings = async (req, res) => {
  try {
    res.json({
      platformFeePercent: process.env.PLATFORM_FEE_PERCENT || '1.5',
      stellarNetwork: process.env.STELLAR_NETWORK || 'testnet',
      allowedOrigins: process.env.ALLOWED_ORIGINS || 'http://localhost:3000',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * PATCH /api/admin/settings
 * Updates platform settings.
 *
 * TODO (Issue #23): Persist to DB. Currently only validates input.
 */
const updateSettings = async (req, res) => {
  try {
    const { platformFeePercent } = req.body;

    if (platformFeePercent !== undefined) {
      const fee = parseFloat(platformFeePercent);
      if (isNaN(fee) || fee < 0 || fee > 100) {
        return res
          .status(400)
          .json({ error: 'platformFeePercent must be a number between 0 and 100.' });
      }
    }

    // TODO: Persist to DB
    res.json({
      message: 'Settings updated (note: changes are not persisted until DB support is added).',
      received: req.body,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export default {
  listUsers,
  getUserDetail,
  suspendUser,
  banUser,
  listDisputes,
  resolveDispute,
  getStats,
  getAuditLogs,
  exportAuditLogsCsv,
  getSettings,
  updateSettings,
};
