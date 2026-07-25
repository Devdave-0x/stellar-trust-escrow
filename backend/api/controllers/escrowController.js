/**
 * Escrow Controller
 *
 * Read endpoints (listEscrows, getEscrow, getMilestones, getMilestone) are
 * cached at the route level via cacheResponse middleware.
 *
 * Status-changing operations (releaseFunds, raiseDispute) invalidate the
 * relevant cache tags directly so stale data is never served.
 */

import { stringify } from 'csv-stringify';
import prisma from '../../lib/prisma.js';
import cache from '../../lib/cache.js';
import { recordEscrowStateTransition } from '../../lib/metrics.js';
import {
  buildPaginatedResponse,
  parsePagination,
  parseCursorPagination,
  buildPrismaFindArgs,
  buildCursorResponse,
} from '../../lib/pagination.js';
import { logControllerError } from '../../config/logger.js';
import { submitTransaction } from '../../services/stellarService.js';
import { xdr, scValToNative } from '@stellar/stellar-sdk';
import {
  escrowIdParam,
  signedXdrBody,
  paginationQuery,
  handleValidationErrors,
} from '../../middleware/validation.js';
import { getEscrowAuditLog } from '../../services/escrowAuditService.js';
import { listArchiveTables } from '../../services/escrowArchiveService.js';
import {
  getMilestoneStatusHistory,
  getLastStatusChangeBatch,
  formatStatusChange,
} from '../../services/milestoneHistoryService.js';

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
const VALID_ESCROW_STATUSES = new Set(['Draft', 'Active', 'Completed', 'Disputed', 'Cancelled']);

const CSV_EXPORT_COLUMNS = [
  'id',
  'title',
  'amount',
  'currency',
  'status',
  'counterparty',
  'created_at',
  'completed_at',
];
const CSV_EXPORT_BATCH_SIZE = 500;

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
    const { status, client, freelancer, search, minAmount, maxAmount, dateFrom, dateTo } =
      req.query;

    // ── Cursor-based pagination ────────────────────────────────────────────
    const { take, parsedCursor, sortField, sortDir } = parseCursorPagination(
      req.query,
      'createdAt',
      'desc',
    );

    const resolvedSortBy = VALID_SORT_FIELDS.includes(sortField) ? sortField : 'createdAt';
    const resolvedSortOrder = VALID_SORT_ORDERS.includes(sortDir) ? sortDir : 'desc';

    const where = { deletedAt: null };

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

    // metadata[key]=value query filter, e.g. ?metadata[propertyType]=condo
    if (req.query.metadata && typeof req.query.metadata === 'object') {
      const metadataFilters = Object.entries(req.query.metadata).map(([key, value]) => ({
        metadata: { path: [key], equals: value },
      }));
      if (metadataFilters.length) {
        where.AND = [...(where.AND ?? []), ...metadataFilters];
      }
    }

    // Escrow id is a BigInt — cursor id needs BigInt conversion
    const findArgs = buildPrismaFindArgs({
      parsedCursor: parsedCursor ? { ...parsedCursor, id: BigInt(parsedCursor.id) } : null,
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

/**
 * GET /api/escrows/export.csv
 * Streams a CSV of the authenticated user's escrows (as client or freelancer).
 * Rows are fetched in batches ordered by id so the whole result set is never
 * buffered in memory at once.
 *
 * Note on column mapping: this schema has no dedicated `title`/`currency`/
 * `completedAt` fields, so `title` uses the escrow's brief hash (the closest
 * existing description reference), `currency` uses the Soroban token address
 * (the unit the amount is denominated in), and `completed_at` uses `updatedAt`
 * for escrows in the Completed status.
 */
const exportEscrowsCsv = async (req, res) => {
  try {
    const address = req.user?.address;
    if (!address) return res.status(401).json({ error: 'Authentication required' });

    const { from, to } = req.query;
    if (from && isNaN(Date.parse(from))) {
      return res.status(400).json({ error: 'from must be a valid ISO date string' });
    }
    if (to && isNaN(Date.parse(to))) {
      return res.status(400).json({ error: 'to must be a valid ISO date string' });
    }

    const where = {
      deletedAt: null,
      OR: [{ clientAddress: address }, { freelancerAddress: address }],
    };
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) {
        const end = new Date(to);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    const dateStamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="escrows-${dateStamp}.csv"`);

    const stringifier = stringify({ header: true, columns: CSV_EXPORT_COLUMNS });
    stringifier.on('error', (err) => {
      logControllerError('escrow.exportEscrowsCsv', err, req);
      res.destroy(err);
    });
    stringifier.pipe(res);

    let cursorId = null;
    for (;;) {
      const batchWhere = cursorId !== null ? { ...where, id: { gt: cursorId } } : where;
      const batch = await prisma.escrow.findMany({
        where: batchWhere,
        orderBy: { id: 'asc' },
        take: CSV_EXPORT_BATCH_SIZE,
        select: {
          id: true,
          briefHash: true,
          totalAmount: true,
          tokenAddress: true,
          status: true,
          clientAddress: true,
          freelancerAddress: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (batch.length === 0) break;

      for (const escrow of batch) {
        stringifier.write({
          id: escrow.id.toString(),
          title: escrow.briefHash || '',
          amount: escrow.totalAmount,
          currency: escrow.tokenAddress,
          status: escrow.status,
          counterparty:
            escrow.clientAddress === address ? escrow.freelancerAddress : escrow.clientAddress,
          created_at:
            escrow.createdAt instanceof Date ? escrow.createdAt.toISOString() : escrow.createdAt,
          completed_at:
            escrow.status === 'Completed'
              ? escrow.updatedAt instanceof Date
                ? escrow.updatedAt.toISOString()
                : escrow.updatedAt
              : '',
        });
      }

      cursorId = batch[batch.length - 1].id;
      if (batch.length < CSV_EXPORT_BATCH_SIZE) break;
    }

    stringifier.end();
  } catch (err) {
    logControllerError('escrow.exportEscrowsCsv', err, req);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    } else {
      res.destroy(err);
    }
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

    if (escrow && !escrow.deletedAt) return res.json(escrow);

    // Fallback: search archive partition tables
    const tables = await listArchiveTables(prisma);
    for (const table of tables) {
      const ARCHIVE_TABLE_RE = /^escrows_archive_\d{4}_\d{2}$/;
      if (!ARCHIVE_TABLE_RE.test(table)) continue;
      const [archived] = await prisma.$queryRawUnsafe(
        `SELECT * FROM ${table} WHERE id = $1 LIMIT 1`,
        id,
      );
      if (archived) return res.json({ ...archived, _source: 'archive' });
    }

    return res.status(404).json({ error: 'Escrow not found' });
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
    const { signedXdr, metadata } = req.body;
    if (!signedXdr || typeof signedXdr !== 'string') {
      return res.status(400).json({ error: 'signedXdr is required' });
    }

    const metadataValidation = validateEscrowMetadata(metadata);
    if (!metadataValidation.valid) {
      return res.status(400).json({ error: metadataValidation.error });
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
          metadata: metadata ?? undefined,
        },
        update: {}, // indexer will fill in the details on next tick
      });

      recordEscrowStateTransition('null', 'Active');
    }

    return res.status(200).json({
      hash: result.hash,
      escrowId: escrowId ? String(escrowId) : null,
    });
  } catch (err) {
    logControllerError('escrow.broadcastCreateEscrow', err, req);
    res.status(500).json({ error: err.message });
  }
};

/**
 * PATCH /api/escrows/:id/metadata
 * Merge-update (not replace) the escrow's custom metadata object.
 * Restricted to the escrow's parties (client/freelancer) and admins.
 */
const updateEscrowMetadata = async (req, res) => {
  try {
    const id = BigInt(req.params.id);
    const { metadata } = req.body;

    if (metadata === undefined || metadata === null || typeof metadata !== 'object') {
      return res.status(400).json({ error: 'metadata object is required' });
    }

    const patchValidation = validateEscrowMetadata(metadata);
    if (!patchValidation.valid) {
      return res.status(400).json({ error: patchValidation.error });
    }

    const escrow = await prisma.escrow.findUnique({
      where: { id },
      select: { metadata: true, clientAddress: true, freelancerAddress: true },
    });
    if (!escrow) return res.status(404).json({ error: 'Escrow not found' });

    const callerAddress = req.user?.address;
    const isAdmin = req.user?.role === 'admin' || req.user?.roles?.includes('admin');
    const isParty =
      callerAddress === escrow.clientAddress || callerAddress === escrow.freelancerAddress;
    if (!isAdmin && !isParty) {
      return res.status(403).json({ error: 'Access denied: not a party to this escrow' });
    }

    const merged = { ...(escrow.metadata ?? {}), ...metadata };
    const mergedValidation = validateEscrowMetadata(merged);
    if (!mergedValidation.valid) {
      return res.status(400).json({ error: mergedValidation.error });
    }

    const updated = await prisma.escrow.update({ where: { id }, data: { metadata: merged } });
    await invalidateEscrowCache(id);

    res.json({ id: updated.id.toString(), metadata: updated.metadata });
  } catch (err) {
    if (err.message?.includes('Cannot convert')) {
      return res.status(400).json({ error: 'Invalid escrow id' });
    }
    logControllerError('escrow.updateEscrowMetadata', err, req);
    res.status(500).json({ error: err.message });
  }
};

/**
 * DELETE /api/escrows/:id
 * Soft-deletes an escrow (sets deletedAt) instead of removing the row, so
 * audit history is preserved. Only allowed while the escrow is in Draft or
 * Cancelled status. Restricted to the escrow's owner/parties, or an admin.
 */
const deleteEscrow = async (req, res) => {
  try {
    const id = BigInt(req.params.id);
    const address = req.user?.address;
    if (!address) return res.status(401).json({ error: 'Authentication required' });

    const escrow = await prisma.escrow.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        deletedAt: true,
        ownerId: true,
        clientAddress: true,
        freelancerAddress: true,
      },
    });
    if (!escrow) return res.status(404).json({ error: 'Escrow not found' });

    const isAdmin = req.user?.role === 'admin' || req.user?.roles?.includes('admin');
    const isOwnerOrParty =
      address === escrow.ownerId ||
      address === escrow.clientAddress ||
      address === escrow.freelancerAddress;
    if (!isAdmin && !isOwnerOrParty) {
      return res.status(403).json({ error: 'Access denied: not a party to this escrow' });
    }

    if (escrow.deletedAt) {
      return res.status(409).json({ error: 'Escrow already deleted' });
    }

    if (escrow.status !== 'Draft' && escrow.status !== 'Cancelled') {
      return res
        .status(400)
        .json({ error: 'Only escrows in Draft or Cancelled status can be deleted' });
    }

    const deletedAt = new Date();
    await prisma.escrow.update({ where: { id }, data: { deletedAt } });
    await invalidateEscrowCache(id);

    res.json({ message: 'Escrow deleted.', escrowId: id.toString(), deletedAt });
  } catch (err) {
    if (err.message?.includes('Cannot convert')) {
      return res.status(400).json({ error: 'Invalid escrow id' });
    }
    logControllerError('escrow.deleteEscrow', err, req);
    res.status(500).json({ error: err.message });
  }
};

/**
 * POST /api/escrows/:id/clone
 * Duplicates an escrow's title/description/milestone structure/participant
 * addresses into a brand-new Draft escrow owned by the requesting user,
 * with all transaction data (balances, milestone progress) reset.
 * Accepts optional overrides: { title, amount, deadline }.
 */
const cloneEscrow = async (req, res) => {
  try {
    const sourceId = BigInt(req.params.id);
    const address = req.user?.address;
    if (!address) return res.status(401).json({ error: 'Authentication required' });

    const source = await prisma.escrow.findUnique({
      where: { id: sourceId },
      include: { milestones: { orderBy: { milestoneIndex: 'asc' } } },
    });
    if (!source) return res.status(404).json({ error: 'Escrow not found' });

    const { title: titleOverride, amount: amountOverride, deadline: deadlineOverride } =
      req.body || {};

    if (
      amountOverride !== undefined &&
      typeof amountOverride !== 'string' &&
      typeof amountOverride !== 'number'
    ) {
      return res.status(400).json({ error: 'amount must be a string or number' });
    }
    if (
      deadlineOverride !== undefined &&
      deadlineOverride !== null &&
      isNaN(Date.parse(deadlineOverride))
    ) {
      return res.status(400).json({ error: 'deadline must be a valid ISO date string' });
    }

    const baseTitle = source.title || 'Untitled Escrow';
    const title = titleOverride !== undefined ? String(titleOverride) : `${baseTitle} (Copy)`;
    const totalAmount = amountOverride !== undefined ? String(amountOverride) : source.totalAmount;
    const deadline =
      deadlineOverride !== undefined
        ? deadlineOverride === null
          ? null
          : new Date(deadlineOverride)
        : source.deadline;

    // Draft escrows have no on-chain counterpart yet, so they can't use a
    // real contract-assigned ID. Allocate a synthetic negative one instead —
    // on-chain IDs are always non-negative, so this can never collide.
    const [{ id: rawDraftId }] = await prisma.$queryRawUnsafe(
      `SELECT -nextval('escrow_draft_id_seq') AS id`,
    );

    const created = await prisma.escrow.create({
      data: {
        id: BigInt(rawDraftId),
        tenantId: source.tenantId,
        clientAddress: source.clientAddress,
        freelancerAddress: source.freelancerAddress,
        arbiterAddress: source.arbiterAddress,
        tokenAddress: source.tokenAddress,
        totalAmount,
        remainingBalance: totalAmount,
        status: 'Draft',
        briefHash: '',
        title,
        description: source.description,
        ownerId: address,
        deadline,
        createdAt: new Date(),
        createdLedger: BigInt(0),
        metadata: source.metadata ?? undefined,
        milestones: {
          create: source.milestones.map((m) => ({
            tenantId: m.tenantId,
            milestoneIndex: m.milestoneIndex,
            title: m.title,
            descriptionHash: m.descriptionHash,
            amount: m.amount,
            status: 'Pending',
          })),
        },
      },
      include: { milestones: { orderBy: { milestoneIndex: 'asc' } } },
    });

    await cache.invalidateTags(['escrows']);

    res.status(201).json({
      id: created.id.toString(),
      tenantId: created.tenantId,
      clientAddress: created.clientAddress,
      freelancerAddress: created.freelancerAddress,
      arbiterAddress: created.arbiterAddress,
      tokenAddress: created.tokenAddress,
      totalAmount: created.totalAmount,
      remainingBalance: created.remainingBalance,
      status: created.status,
      title: created.title,
      description: created.description,
      ownerId: created.ownerId,
      deadline: created.deadline,
      createdAt: created.createdAt,
      metadata: created.metadata,
      milestones: created.milestones.map((m) => ({
        id: m.id,
        milestoneIndex: m.milestoneIndex,
        title: m.title,
        amount: m.amount,
        status: m.status,
      })),
    });
  } catch (err) {
    if (err.message?.includes('Cannot convert')) {
      return res.status(400).json({ error: 'Invalid escrow id' });
    }
    logControllerError('escrow.cloneEscrow', err, req);
    res.status(500).json({ error: err.message });
  }
};

const getMilestones = async (req, res) => {
  try {
    const escrowId = BigInt(req.params.id);
    const { take, parsedCursor, sortDir } = parseCursorPagination(
      req.query,
      'milestoneIndex',
      'asc',
    );

    const findArgs = buildPrismaFindArgs({
      parsedCursor: parsedCursor ? { ...parsedCursor, id: parseInt(parsedCursor.id, 10) } : null,
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

    const lastChangeByMilestoneId = await getLastStatusChangeBatch(data.map((m) => m.id));
    const enriched = data.map((m) => ({
      ...m,
      last_status_change: formatStatusChange(lastChangeByMilestoneId.get(m.id) ?? null),
    }));

    res.json(buildCursorResponse(enriched, take, 'id', 'milestoneIndex', sortDir));
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

    const lastChangeByMilestoneId = await getLastStatusChangeBatch([milestone.id]);
    res.json({
      ...milestone,
      last_status_change: formatStatusChange(lastChangeByMilestoneId.get(milestone.id) ?? null),
    });
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
        where: { deletedAt: null },
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
        where: { status: 'Active', deletedAt: null },
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
        prisma.escrow.count({ where: { status: 'Completed', deletedAt: null } }),
        prisma.escrow.count({ where: { deletedAt: null } }),
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
      callerAddress === escrow.clientAddress || callerAddress === escrow.freelancerAddress;

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

/**
 * GET /api/escrows/:id/milestones/:milestoneId/history
 * Returns the paginated (oldest-first) status-change history for a single
 * milestone. Access is restricted to escrow participants: client, freelancer,
 * arbiter, and admins.
 */
const getMilestoneHistory = async (req, res) => {
  try {
    const escrowId = BigInt(req.params.id);
    const milestoneIndex = parseInt(req.params.milestoneId, 10);

    const escrow = await prisma.escrow.findUnique({
      where: { id: escrowId },
      select: { clientAddress: true, freelancerAddress: true, arbiterAddress: true },
    });
    if (!escrow) return res.status(404).json({ error: 'Escrow not found' });

    const callerAddress = req.user?.address;
    const isAdmin = req.user?.role === 'admin' || req.user?.roles?.includes('admin');
    const participants = [
      escrow.clientAddress,
      escrow.freelancerAddress,
      escrow.arbiterAddress,
    ].filter(Boolean);

    if (!isAdmin && !participants.includes(callerAddress)) {
      return res.status(403).json({ error: 'Access denied: not a participant in this escrow' });
    }

    const milestone = await prisma.milestone.findUnique({
      where: { escrowId_milestoneIndex: { escrowId, milestoneIndex } },
      select: { id: true },
    });
    if (!milestone) return res.status(404).json({ error: 'Milestone not found' });

    const result = await getMilestoneStatusHistory(milestone.id, req.query);
    res.json(result);
  } catch (err) {
    if (err.message?.includes('Cannot convert')) {
      return res.status(400).json({ error: 'Invalid escrow id' });
    }
    logControllerError('escrow.getMilestoneHistory', err, req);
    res.status(500).json({ error: err.message });
  }
};

export default {
  listEscrows,
  exportEscrowsCsv,
  getEscrow,
  broadcastCreateEscrow,
  cloneEscrow,
  deleteEscrow,
  updateEscrowMetadata,
  getMilestones,
  getMilestone,
  getMilestoneHistory,
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
