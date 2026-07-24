import prisma from '../lib/prisma.js';
import { createModuleLogger } from '../config/logger.js';

const logger = createModuleLogger('userActivityService');

const RETENTION_DAYS = 90;

export const ActivityCategory = {
  AUTH: 'AUTH',
  ESCROW: 'ESCROW',
  MILESTONE: 'MILESTONE',
  DISPUTE: 'DISPUTE',
  PAYMENT: 'PAYMENT',
  PROFILE: 'PROFILE',
  KYC: 'KYC',
  ADMIN: 'ADMIN',
};

/**
 * Record a user activity entry into the shared AuditLog.
 *
 * @param {{ actor: string, category: string, action: string, resourceId?: string, escrowId?: bigint|number, metadata?: object, ipAddress?: string, tenantId: string }} params
 */
export async function recordActivity({
  actor,
  category,
  action,
  resourceId,
  escrowId,
  metadata,
  ipAddress,
  tenantId,
}) {
  try {
    await prisma.auditLog.create({
      data: {
        tenantId,
        category,
        action,
        actor,
        resourceId: resourceId ?? null,
        escrowId: escrowId ? BigInt(escrowId) : null,
        metadata: metadata ?? undefined,
        ipAddress: ipAddress ?? null,
      },
    });
  } catch (err) {
    logger.error({ err, actor, action }, 'Failed to record user activity');
  }
}

/**
 * Retrieve paginated activity log for a specific user address.
 *
 * @param {{ address: string, page?: number, limit?: number, category?: string, tenantId: string }} params
 * @returns {{ entries: object[], total: number, page: number, totalPages: number }}
 */
export async function getUserActivity({ address, page = 1, limit = 20, category, tenantId }) {
  const where = {
    tenantId,
    actor: address,
    createdAt: {
      gte: new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000),
    },
    ...(category ? { category } : {}),
  };

  const [entries, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        category: true,
        action: true,
        resourceId: true,
        escrowId: true,
        metadata: true,
        ipAddress: true,
        createdAt: true,
      },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return {
    entries: entries.map((e) => ({
      ...e,
      id: e.id.toString(),
      escrowId: e.escrowId?.toString() ?? null,
    })),
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * Purge activity log entries older than RETENTION_DAYS for all actors.
 * Intended to be called from the daily scheduler.
 *
 * @returns {number} deleted count
 */
export async function purgeExpiredActivity() {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const { count } = await prisma.auditLog.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  logger.info({ count, cutoff }, 'Purged expired activity log entries');
  return count;
}
