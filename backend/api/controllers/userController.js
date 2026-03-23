/**
 * User Controller
 *
 * Handles profile, history, and stats queries for Stellar addresses.
 *
 * Performance optimizations:
 *  - Parallel DB queries via Promise.all
 *  - select projections (no over-fetching)
 *  - TTL cache for profiles (60 s) and stats (120 s)
 */

import prisma from '../../lib/prisma.js';
import cache from '../../lib/cache.js';

const STELLAR_ADDRESS_RE = /^G[A-Z2-7]{55}$/;

function validateAddress(address, res) {
  if (!STELLAR_ADDRESS_RE.test(address)) {
    res.status(400).json({ error: 'Invalid Stellar address' });
    return false;
  }
  return true;
}

const ESCROW_SUMMARY_SELECT = {
  id: true,
  status: true,
  totalAmount: true,
  remainingBalance: true,
  deadline: true,
  createdAt: true,
};

/**
 * GET /api/users/:address
 * Combined profile: reputation + last 5 escrows.
 */
const getUserProfile = async (req, res) => {
  try {
    const { address } = req.params;
    if (!validateAddress(address, res)) return;

    const cacheKey = `users:profile:${address}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    // Run both queries in parallel
    const [reputation, recentEscrows] = await Promise.all([
      prisma.reputationRecord.findUnique({ where: { address } }),
      prisma.escrow.findMany({
        where: { OR: [{ clientAddress: address }, { freelancerAddress: address }] },
        select: ESCROW_SUMMARY_SELECT,
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ]);

    const profile = {
      address,
      reputation: reputation ?? {
        address,
        totalScore: 0,
        completedEscrows: 0,
        disputedEscrows: 0,
        disputesWon: 0,
        totalVolume: '0',
      },
      recentEscrows,
    };

    cache.set(cacheKey, profile, 60);
    res.json(profile);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * GET /api/users/:address/escrows
 * Paginated escrow list for a user, filterable by role and status.
 */
const getUserEscrows = async (req, res) => {
  try {
    const { address } = req.params;
    if (!validateAddress(address, res)) return;

    const { role = 'all', status, page: rawPage = 1, limit: rawLimit = 20 } = req.query;
    const page = Math.max(1, parseInt(rawPage));
    const limit = Math.min(100, Math.max(1, parseInt(rawLimit)));
    const skip = (page - 1) * limit;

    const where = {};
    if (status) where.status = status;

    if (role === 'client') {
      where.clientAddress = address;
    } else if (role === 'freelancer') {
      where.freelancerAddress = address;
    } else {
      where.OR = [{ clientAddress: address }, { freelancerAddress: address }];
    }

    const cacheKey = `users:escrows:${address}:${role}:${status}:${page}:${limit}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    const [data, total] = await prisma.$transaction([
      prisma.escrow.findMany({ where, select: ESCROW_SUMMARY_SELECT, skip, take: limit, orderBy: { createdAt: 'desc' } }),
      prisma.escrow.count({ where }),
    ]);

    const result = { data, total, page, limit };
    cache.set(cacheKey, result, 15);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * GET /api/users/:address/stats
 * Aggregated metrics — uses Prisma aggregate to avoid loading all rows.
 */
const getUserStats = async (req, res) => {
  try {
    const { address } = req.params;
    if (!validateAddress(address, res)) return;

    const cacheKey = `users:stats:${address}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    const [reputation, escrowCounts] = await Promise.all([
      prisma.reputationRecord.findUnique({
        where: { address },
        select: { totalScore: true, completedEscrows: true, disputedEscrows: true, totalVolume: true },
      }),
      prisma.escrow.groupBy({
        by: ['status'],
        where: { OR: [{ clientAddress: address }, { freelancerAddress: address }] },
        _count: { id: true },
      }),
    ]);

    const countsByStatus = Object.fromEntries(escrowCounts.map((r) => [r.status, r._count.id]));
    const totalEscrows = escrowCounts.reduce((sum, r) => sum + r._count.id, 0);
    const completed = countsByStatus['Completed'] ?? 0;

    const stats = {
      address,
      totalEscrows,
      completionRate: totalEscrows > 0 ? (completed / totalEscrows).toFixed(4) : '0',
      escrowsByStatus: countsByStatus,
      reputation: reputation ?? null,
    };

    cache.set(cacheKey, stats, 120);
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export default { getUserProfile, getUserEscrows, getUserStats };
