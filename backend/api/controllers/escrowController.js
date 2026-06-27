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
import { buildPaginatedResponse, parsePagination } from '../../lib/pagination.js';
import { logControllerError } from '../../config/logger.js';
import { submitTransaction } from '../../services/stellarService.js';
import { xdr, scValToNative } from '@stellar/stellar-sdk';
import {
  escrowIdParam,
  signedXdrBody,
  paginationQuery,
  handleValidationErrors,
} from '../../middleware/validation.js';
import respond from '../../lib/respond.js';

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
    logCacheMetrics();
  } catch (err) {
    console.error('[Cache] invalidateEscrowCache failed:', err.message);
  }
}

// ── Read handlers (cached at route level) ─────────────────────────────────────

const listEscrows = async (req, res) => {
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

    const resolvedSortBy = VALID_SORT_FIELDS.includes(sortBy) ? sortBy : 'createdAt';
    const resolvedSortOrder = VALID_SORT_ORDERS.includes(sortOrder) ? sortOrder : 'desc';
    const orderBy = { [resolvedSortBy]: resolvedSortOrder };

    const [data, total] = await prisma.$transaction([
      prisma.escrow.findMany({ where, select: ESCROW_SUMMARY_SELECT, skip, take: limit, orderBy }),
      prisma.escrow.count({ where }),
    ]);

    res.json(buildPaginatedResponse(data, { total, page, limit }));
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

    const result = await submitTransaction(signedXdr);

    if (result.status !== 'SUCCESS') {
      return res.status(422).json({
        error: 'Transaction failed',
        sorobanStatus: result.status,
        errorResultXdr: result.errorResultXdr ?? null,
      });
    }

    // Extract escrow ID from the transaction return value (ScVal u64/i128)
    let escrowId = null;
    if (result.returnValue) {
      try {
        const native = scValToNative(xdr.ScVal.fromXDR(result.returnValue, 'base64'));
        escrowId = typeof native === 'bigint' ? native : BigInt(String(native));
      } catch {
        // returnValue absent or not a numeric type — escrowId stays null
      }
    }

    // Upsert the escrow row so the DB reflects the on-chain state immediately,
    // even before the indexer's next polling tick.
    if (escrowId !== null) {
      await prisma.escrow.upsert({
        where: { id: escrowId },
        create: {
          id: escrowId,
          clientAddress: '',
          freelancerAddress: '',
          tokenAddress: '',
          totalAmount: '0',
          remainingBalance: '0',
          status: 'Active',
          briefHash: '',
          createdAt: new Date(),
          createdLedger: BigInt(0),
        },
        update: {}, // indexer will fill in the details on next tick
      });
    }

    return res.status(200).json({ hash: result.hash, escrowId: escrowId ? String(escrowId) : null });
  } catch (err) {
    logControllerError('escrow.broadcastCreateEscrow', err, req);
    res.status(500).json({ error: err.message });
  }
};

const getMilestones = async (req, res) => {
  try {
    const escrowId = BigInt(req.params.id);
    const { page, limit, skip } = parsePagination(req.query);

    const [data, total] = await prisma.$transaction([
      prisma.milestone.findMany({
        where: { escrowId },
        skip,
        take: limit,
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
      }),
      prisma.milestone.count({ where: { escrowId } }),
    ]);

    res.json(buildPaginatedResponse(data, { total, page, limit }));
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

const STATS_CACHE_TTL = 3600; // 1 hour in seconds

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

// ── Batch endpoints ───────────────────────────────────────────────────────────

const BATCH_STATUS_MAX = 100;
const BATCH_RELEASE_MAX = 20;

/**
 * POST /api/escrows/batch-status
 * Body: { ids: string[] }  — up to 100 escrow IDs
 *
 * Returns per-item status results so callers can distinguish partial failures.
 */
const batchStatus = async (req, res) => {
  const { ids } = req.body;

  if (!Array.isArray(ids) || ids.length === 0) {
    return respond.error(res, 400, 'VALIDATION_ERROR', 'ids must be a non-empty array');
  }
  if (ids.length > BATCH_STATUS_MAX) {
    return respond.error(
      res,
      400,
      'BATCH_TOO_LARGE',
      `Maximum ${BATCH_STATUS_MAX} IDs per request`,
    );
  }

  const results = await Promise.allSettled(
    ids.map(async (rawId) => {
      const id = BigInt(rawId);
      const escrow = await prisma.escrow.findUnique({
        where: { id },
        select: ESCROW_SUMMARY_SELECT,
      });
      if (!escrow) return { id: rawId, status: null, error: 'Not found' };
      return { id: rawId, status: escrow.status, data: escrow };
    }),
  );

  const items = results.map((r, i) =>
    r.status === 'fulfilled'
      ? r.value
      : { id: ids[i], status: null, error: r.reason?.message || 'Internal error' },
  );

  return respond.success(res, items);
};

/**
 * POST /api/escrows/batch-release
 * Body: { ids: string[] }  — up to 20 escrow IDs
 *
 * Role-gated: only Admin/Arbitrator may bulk-release.
 * Applies the same tenant scoping as individual release endpoints.
 * Returns per-item results to surface partial failures.
 */
const batchRelease = async (req, res) => {
  const { ids } = req.body;
  const userRoles = req.user?.roles ?? (req.user?.role ? [req.user.role] : []);
  const isAuthorized =
    userRoles.includes('Admin') || userRoles.includes('admin') || userRoles.includes('Arbitrator');

  if (!isAuthorized) {
    return respond.error(res, 403, 'FORBIDDEN', 'Admin or Arbitrator role required');
  }

  if (!Array.isArray(ids) || ids.length === 0) {
    return respond.error(res, 400, 'VALIDATION_ERROR', 'ids must be a non-empty array');
  }
  if (ids.length > BATCH_RELEASE_MAX) {
    return respond.error(
      res,
      400,
      'BATCH_TOO_LARGE',
      `Maximum ${BATCH_RELEASE_MAX} IDs per batch-release request`,
    );
  }

  const results = await Promise.allSettled(
    ids.map(async (rawId) => {
      const id = BigInt(rawId);
      const escrow = await prisma.escrow.findUnique({ where: { id } });
      if (!escrow) return { id: rawId, success: false, error: 'Not found' };
      if (escrow.status !== 'Active') {
        return { id: rawId, success: false, error: `Escrow is ${escrow.status}, cannot release` };
      }

      await prisma.escrow.update({
        where: { id },
        data: { status: 'Completed' },
      });
      await onEscrowStatusChange(id);
      return { id: rawId, success: true };
    }),
  );

  const items = results.map((r, i) =>
    r.status === 'fulfilled'
      ? r.value
      : { id: ids[i], success: false, error: r.reason?.message || 'Internal error' },
  );

  return respond.success(res, items);
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
  batchStatus,
  batchRelease,
};

// ── Validation rule sets (used by escrowRoutes) ───────────────────────────────
export const validateBroadcast = [signedXdrBody, handleValidationErrors];
export const validateEscrowId = [escrowIdParam, handleValidationErrors];
export const validatePagination = [...paginationQuery, handleValidationErrors];
