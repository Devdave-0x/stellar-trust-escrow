/**
 * Escrow Controller
 *
 * Read endpoints (listEscrows, getEscrow, getMilestones, getMilestone) are
 * cached at the route level via cacheResponse middleware.
 *
 * Status-changing operations (releaseFunds, raiseDispute) invalidate the
 * relevant cache tags directly so stale data is never served.
 */

import prisma from '../../lib/prisma.js';
import cache from '../../lib/cache.js';
import {
  buildPaginatedResponse,
  parsePagination,
  parseCursorPagination,
  buildPrismaFindArgs,
  buildCursorResponse,
} from '../../lib/pagination.js';
import { logControllerError } from '../../config/logger.js';
import {
  escrowIdParam,
  signedXdrBody,
  paginationQuery,
  handleValidationErrors,
} from '../../middleware/validation.js';
import { getEscrowAuditLog } from '../../services/escrowAuditService.js';

const ESCROW_SUMMARY_SELECT = {
  id: true,
  clientAddress: true,
  freelancerAddress: true,
  status: true,
  totalAmount: true,
  remainingBalance: true,
  deadline: true,
  createdAt: true,
};

const VALID_SORT_FIELDS = ['createdAt', 'totalAmount', 'status'];
const VALID_SORT_ORDERS = ['asc', 'desc'];
const VALID_ESCROW_STATUSES = new Set(['Active', 'Completed', 'Disputed', 'Cancelled']);

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Invalidate all cache entries for a specific escrow and the list collection. */
async function invalidateEscrowCache(id) {
  await cache.invalidateTags(['escrows', `escrow:${id}`]);
  console.log(`[Cache] Invalidated escrow:${id} + escrows collection`);
}

/** Log cache hit/miss metrics to console for monitoring. */
function logCacheMetrics() {
  const m = cache.analytics();
  console.log(
    `[Cache] backend=${m.backend} hits=${m.hits} misses=${m.misses} ` +
      `hitRate=${m.hitRate} sets=${m.sets} invalidations=${m.invalidations}`,
  );
}

/** Triggered after any escrow status transition to evict stale cache entries. */
async function onEscrowStatusChange(id) {
  try {
    await invalidateEscrowCache(id);
    // Also invalidate dashboard stats since they reflect current escrow states
    await invalidateStatsCaches();
    logCacheMetrics();
  } catch (err) {
    console.error('[Cache] invalidateEscrowCache failed:', err.message);
  }
}

// ── Read handlers (cached at route level) ─────────────────────────────────────

const listEscrows = async (req, res) => {
  try {
    const {
      status,
      client,
      freelancer,
      search,
      minAmount,
      maxAmount,
      dateFrom,
      dateTo,
    } = req.query;

    // ── Cursor-based pagination ────────────────────────────────────────────
    const { take, parsedCursor, sortField, sortDir } = parseCursorPagination(
      req.query,
      'createdAt',
      'desc',
    );

    const resolvedSortBy = VALID_SORT_FIELDS.includes(sortField) ? sortField : 'createdAt';
    const resolvedSortOrder = VALID_SORT_ORDERS.includes(sortDir) ? sortDir : 'desc';

    const where = {};

    if (status) {
      const statuses = status
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const invalid = statuses.filter((s) => !VALID_ESCROW_STATUSES.has(s));
      if (invalid.length > 0) {
        return res.status(400).json({
          error: 'Invalid status value(s)',
          invalid,
          allowed: [...VALID_ESCROW_STATUSES],
        });
      }
      where.status = statuses.length === 1 ? statuses[0] : { in: statuses };
    }
    if (client) where.clientAddress = client;
    if (freelancer) where.freelancerAddress = freelancer;

    if (search) {
      const term = search.trim();
      const numericId = /^\d+$/.test(term) ? BigInt(term) : null;
      where.OR = [
        ...(numericId ? [{ id: numericId }] : []),
        { clientAddress: { contains: term, mode: 'insensitive' } },
        { freelancerAddress: { contains: term, mode: 'insensitive' } },
      ];
    }

    if (minAmount) where.totalAmount = { ...where.totalAmount, gte: String(minAmount) };
    if (maxAmount) where.totalAmount = { ...where.totalAmount, lte: String(maxAmount) };

    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    // Escrow id is a BigInt — cursor id needs BigInt conversion
    const findArgs = buildPrismaFindArgs({
      parsedCursor: parsedCursor
        ? { ...parsedCursor, id: BigInt(parsedCursor.id) }
        : null,
      take,
      sortField: resolvedSortBy,
      sortDir: resolvedSortOrder,
      idField: 'id',
    });

    const data = await prisma.escrow.findMany({
      where,
      select: ESCROW_SUMMARY_SELECT,
      ...findArgs,
    });

    res.json(buildCursorResponse(data, take, 'id', resolvedSortBy, resolvedSortOrder));
  } catch (err) {
    logControllerError('escrow.listEscrows', err, req);
    res.status(500).json({ error: err.message });
  }
};

const getEscrow = async (req, res) => {
  try {
    const id = BigInt(req.params.id);

    const escrow = await prisma.escrow.findUnique({
      where: { id },
      include: {
        milestones: {
          orderBy: { milestoneIndex: 'asc' },
          select: {
            id: true,
            milestoneIndex: true,
            title: true,
            amount: true,
            status: true,
            submittedAt: true,
            resolvedAt: true,
          },
        },
        dispute: {
          select: {
            id: true,
            escrowId: true,
            raisedByAddress: true,
            raisedAt: true,
            resolvedAt: true,
            clientAmount: true,
            freelancerAmount: true,
            resolvedBy: true,
            resolution: true,
          },
        },
      },
    });

    if (!escrow) return res.status(404).json({ error: 'Escrow not found' });
    res.json(escrow);
  } catch (err) {
    if (err.message?.includes('Cannot convert')) {
      return res.status(400).json({ error: 'Invalid escrow id' });
    }
    logControllerError('escrow.getEscrow', err, req);
    res.status(500).json({ error: err.message });
  }
};

const broadcastCreateEscrow = async (req, res) => {
  try {
    const { signedXdr } = req.body;
    if (!signedXdr || typeof signedXdr !== 'string') {
      return res.status(400).json({ error: 'signedXdr is required' });
    }
    res.status(501).json({ error: 'Not implemented - see Issue #20' });
  } catch (err) {
    logControllerError('escrow.broadcastCreateEscrow', err, req);
    res.status(500).json({ error: err.message });
  }
};

const getMilestones = async (req, res) => {
  try {
    const escrowId = BigInt(req.params.id);
    const { take, parsedCursor, sortDir } = parseCursorPagination(req.query, 'milestoneIndex', 'asc');

    const findArgs = buildPrismaFindArgs({
      parsedCursor: parsedCursor
        ? { ...parsedCursor, id: parseInt(parsedCursor.id, 10) }
        : null,
      take,
      sortField: 'milestoneIndex',
      sortDir,
      idField: 'id',
    });

    const data = await prisma.milestone.findMany({
      where: { escrowId },
      ...findArgs,
      select: {
        id: true,
        milestoneIndex: true,
        title: true,
        amount: true,
        status: true,
        submittedAt: true,
        resolvedAt: true,
      },
    });

    res.json(buildCursorResponse(data, take, 'id', 'milestoneIndex', sortDir));
  } catch (err) {
    if (err.message?.includes('Cannot convert')) {
      return res.status(400).json({ error: 'Invalid escrow id' });
    }
    logControllerError('escrow.getMilestones', err, req);
    res.status(500).json({ error: err.message });
  }
};

const getMilestone = async (req, res) => {
  try {
    const escrowId = BigInt(req.params.id);
    const milestoneIndex = parseInt(req.params.milestoneId, 10);

    const milestone = await prisma.milestone.findUnique({
      where: { escrowId_milestoneIndex: { escrowId, milestoneIndex } },
      select: {
        id: true,
        milestoneIndex: true,
        escrowId: true,
        title: true,
        amount: true,
        status: true,
        submittedAt: true,
        resolvedAt: true,
      },
    });

    if (!milestone) return res.status(404).json({ error: 'Milestone not found' });
    res.json(milestone);
  } catch (err) {
    logControllerError('escrow.getMilestone', err, req);
    res.status(500).json({ error: err.message });
  }
};

// ── Stats endpoints (with Redis caching) ─────────────────────────────────────

const STATS_CACHE_TTL = 30; // 30 seconds as per issue #4 requirements

/**
 * Helper to get cached stats or fetch from DB with cache population
 * Falls back to DB if Redis is down without throwing errors
 */
async function getCachedStats(cacheKey, dbQuery) {
  try {
    // Try to get from cache
    const cached = await cache.get(cacheKey);
    if (cached !== null && cached !== undefined) {
      console.log(`[Cache] Stats hit: ${cacheKey}`);
      return JSON.parse(cached);
    }

    // Cache miss: fetch from database
    const result = await dbQuery();

    // Try to set cache (ignore errors if Redis is down)
    try {
      await cache.set(cacheKey, JSON.stringify(result), STATS_CACHE_TTL);
      console.log(`[Cache] Stats cached: ${cacheKey}`);
    } catch (cacheErr) {
      console.warn(`[Cache] Failed to cache ${cacheKey}:`, cacheErr.message);
    }

    return result;
  } catch (err) {
    console.warn(`[Cache] Error getting stats ${cacheKey}:`, err.message);
    // Fall back to direct DB query if caching fails completely
    return dbQuery();
  }
}

/**
 * Invalidate stats caches and prevent cache stampedes with a simple lock
 */
let invalidationInProgress = false;

async function invalidateStatsCaches() {
  if (invalidationInProgress) return;

  invalidationInProgress = true;
  try {
    await cache.invalidateTags(['stats:volume', 'stats:active', 'stats:success']);
    console.log('[Cache] Invalidated stats caches');
  } finally {
    invalidationInProgress = false;
  }
}

const getTotalVolume = async (req, res) => {
  try {
    const stats = await getCachedStats('stats:volume', async () => {
      const result = await prisma.escrow.aggregate({
        _sum: { totalAmount: true },
      });
      return {
        totalVolume: result._sum.totalAmount || 0,
      };
    });
    res.json(stats);
  } catch (err) {
    logControllerError('escrow.getTotalVolume', err, req);
    res.status(500).json({ error: err.message });
  }
};

const getActiveEscrows = async (req, res) => {
  try {
    const stats = await getCachedStats('stats:active', async () => {
      const count = await prisma.escrow.count({
        where: { status: 'Active' },
      });
      return {
        activeEscrowCount: count,
      };
    });
    res.json(stats);
  } catch (err) {
    logControllerError('escrow.getActiveEscrows', err, req);
    res.status(500).json({ error: err.message });
  }
};

const getSuccessRate = async (req, res) => {
  try {
    const stats = await getCachedStats('stats:success', async () => {
      const [completedCount, totalCount] = await Promise.all([
        prisma.escrow.count({ where: { status: 'Completed' } }),
        prisma.escrow.count(),
      ]);
      const successRate = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
      return {
        completedEscrows: completedCount,
        totalEscrows: totalCount,
        successRate: parseFloat(successRate.toFixed(2)),
      };
    });
    res.json(stats);
  } catch (err) {
    logControllerError('escrow.getSuccessRate', err, req);
    res.status(500).json({ error: err.message });
  }
};

// ── Audit trail ───────────────────────────────────────────────────────────────

/**
 * GET /api/escrows/:id/audit
 * Returns the immutable state-transition audit trail for a single escrow.
 * Access is restricted to: admins, the client address, and the freelancer address.
 */
const getEscrowAudit = async (req, res) => {
  try {
    const id = BigInt(req.params.id);

    // Load the escrow to check party access
    const escrow = await prisma.escrow.findUnique({
      where: { id },
      select: { clientAddress: true, freelancerAddress: true, tenantId: true },
    });

    if (!escrow) return res.status(404).json({ error: 'Escrow not found' });

    // Only admins and the escrow parties may access the audit log
    const callerAddress = req.user?.address;
    const isAdmin = req.user?.role === 'admin' || req.user?.roles?.includes('admin');
    const isParty =
      callerAddress === escrow.clientAddress ||
      callerAddress === escrow.freelancerAddress;

    if (!isAdmin && !isParty) {
      return res.status(403).json({ error: 'Access denied: not a party to this escrow' });
    }

    const result = await getEscrowAuditLog(id, escrow.tenantId, req.query);
    res.json(result);
  } catch (err) {
    if (err.message?.includes('Cannot convert')) {
      return res.status(400).json({ error: 'Invalid escrow id' });
    }
    logControllerError('escrow.getEscrowAudit', err, req);
    res.status(500).json({ error: err.message });
  }
};

export default {
  listEscrows,
  getEscrow,
  broadcastCreateEscrow,
  getMilestones,
  getMilestone,
  onEscrowStatusChange,
  getTotalVolume,
  getActiveEscrows,
  getSuccessRate,
  invalidateStatsCaches,
  getEscrowAudit,
};

// ── Validation rule sets (used by escrowRoutes) ───────────────────────────────
export const validateBroadcast = [signedXdrBody, handleValidationErrors];
export const validateEscrowId = [escrowIdParam, handleValidationErrors];
export const validatePagination = [...paginationQuery, handleValidationErrors];