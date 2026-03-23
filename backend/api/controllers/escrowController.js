/**
 * Escrow Controller
 *
 * Handles HTTP requests for escrow-related routes.
 * Reads from PostgreSQL (indexed from chain events).
 * Write operations broadcast pre-signed transactions to Stellar.
 *
 * Performance optimizations applied:
 *  - Prisma singleton to avoid connection pool exhaustion
 *  - select projections to avoid over-fetching columns
 *  - DB indexes on clientAddress, freelancerAddress, status (see schema.prisma)
 *  - In-memory TTL cache for individual escrow reads (30 s)
 *  - Pagination capped at 100 rows per page
 */

import prisma from '../../lib/prisma.js';
import cache from '../../lib/cache.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const MAX_LIMIT = 100;

function parsePagination(query) {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(query.limit) || 20));
  return { page, limit, skip: (page - 1) * limit };
}

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

// ── Controllers ───────────────────────────────────────────────────────────────

/**
 * GET /api/escrows
 * Paginated list with optional filters.
 */
const listEscrows = async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const { status, client, freelancer } = req.query;

    const where = {};
    if (status) where.status = status;
    if (client) where.clientAddress = client;
    if (freelancer) where.freelancerAddress = freelancer;

    const cacheKey = `escrows:list:${JSON.stringify({ where, page, limit })}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    const [data, total] = await prisma.$transaction([
      prisma.escrow.findMany({ where, select: ESCROW_SUMMARY_SELECT, skip, take: limit, orderBy: { createdAt: 'desc' } }),
      prisma.escrow.count({ where }),
    ]);

    const result = { data, total, page, limit };
    cache.set(cacheKey, result, 15); // 15 s TTL — list changes frequently
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * GET /api/escrows/:id
 * Full escrow detail including milestones.
 */
const getEscrow = async (req, res) => {
  try {
    const id = BigInt(req.params.id);
    const cacheKey = `escrows:${id}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

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
        dispute: true,
      },
    });

    if (!escrow) return res.status(404).json({ error: 'Escrow not found' });

    cache.set(cacheKey, escrow, 30);
    res.json(escrow);
  } catch (err) {
    if (err.message?.includes('Cannot convert')) {
      return res.status(400).json({ error: 'Invalid escrow id' });
    }
    res.status(500).json({ error: err.message });
  }
};

/**
 * POST /api/escrows/broadcast
 * Broadcasts a pre-signed Stellar transaction XDR.
 */
const broadcastCreateEscrow = async (req, res) => {
  try {
    const { signedXdr } = req.body;
    if (!signedXdr || typeof signedXdr !== 'string') {
      return res.status(400).json({ error: 'signedXdr is required' });
    }
    // Stellar broadcast is handled by stellarService (Issue #43)
    res.status(501).json({ error: 'Not implemented — see Issue #20' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * GET /api/escrows/:id/milestones
 * Milestone list for an escrow — uses projection to avoid loading full escrow.
 */
const getMilestones = async (req, res) => {
  try {
    const escrowId = BigInt(req.params.id);
    const cacheKey = `escrows:${escrowId}:milestones`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    const milestones = await prisma.milestone.findMany({
      where: { escrowId },
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
    });

    cache.set(cacheKey, milestones, 30);
    res.json(milestones);
  } catch (err) {
    if (err.message?.includes('Cannot convert')) {
      return res.status(400).json({ error: 'Invalid escrow id' });
    }
    res.status(500).json({ error: err.message });
  }
};

/**
 * GET /api/escrows/:id/milestones/:milestoneId
 */
const getMilestone = async (req, res) => {
  try {
    const escrowId = BigInt(req.params.id);
    const milestoneIndex = parseInt(req.params.milestoneId);

    const milestone = await prisma.milestone.findUnique({
      where: { escrowId_milestoneIndex: { escrowId, milestoneIndex } },
    });

    if (!milestone) return res.status(404).json({ error: 'Milestone not found' });
    res.json(milestone);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export default { listEscrows, getEscrow, broadcastCreateEscrow, getMilestones, getMilestone };
