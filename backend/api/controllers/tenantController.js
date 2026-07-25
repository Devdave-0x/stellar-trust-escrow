/**
 * Tenant Controller
 *
 * Usage/quota visibility for the current tenant (Issue #222).
 *
 * @module controllers/tenantController
 */

import prisma from '../../lib/prisma.js';
import redis from '../../lib/redis.js';
import { currentYearMonth, usageCounterKey } from '../middleware/apiUsageCounter.js';

function startOfMonthUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Distinct escrow-party addresses for the tenant, used as a proxy for active users. */
async function countActiveUsers(tenantId) {
  const escrows = await prisma.escrow.findMany({
    where: { tenantId },
    select: { clientAddress: true, freelancerAddress: true },
  });

  const addresses = new Set();
  for (const escrow of escrows) {
    addresses.add(escrow.clientAddress);
    if (escrow.freelancerAddress) addresses.add(escrow.freelancerAddress);
  }
  return addresses.size;
}

/**
 * GET /api/tenants/me/usage
 * Returns the current tenant's plan usage: API calls, escrows, storage, users.
 * Requires a valid `x-tenant-id` header (resolved by resolveTenant middleware).
 */
const getUsage = async (req, res) => {
  try {
    if (!req.tenant) {
      return res
        .status(401)
        .json({ error: 'x-tenant-id header is required and must reference a known tenant.' });
    }

    const tenant = req.tenant;

    const [apiCallsThisMonth, escrowsTotal, escrowsThisMonth, storageAgg, activeUsers] =
      await Promise.all([
        redis.get(usageCounterKey(tenant.id, currentYearMonth())).catch(() => null),
        prisma.escrow.count({ where: { tenantId: tenant.id } }),
        prisma.escrow.count({
          where: { tenantId: tenant.id, createdAt: { gte: startOfMonthUtc() } },
        }),
        prisma.attachment.aggregate({
          where: { tenantId: tenant.id, deletedAt: null },
          _sum: { sizeBytes: true },
        }),
        countActiveUsers(tenant.id),
      ]);

    res.json({
      api_calls_this_month: parseInt(apiCallsThisMonth || '0', 10),
      escrows_total: escrowsTotal,
      escrows_this_month: escrowsThisMonth,
      storage_bytes_used: storageAgg._sum.sizeBytes || 0,
      active_users: activeUsers,
      plan_limits: {
        api_calls: tenant.apiCallLimit,
        escrows: tenant.escrowLimit,
        storage_bytes: Number(tenant.storageLimitBytes),
        users: tenant.userLimit,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export default { getUsage };
