import crypto from 'crypto';
import prisma from '../lib/prisma.js';
import cache from '../lib/cache.js';
import { log, AuditCategory } from './auditService.js';

const FLAG_CACHE_TTL = 30; // seconds

/**
 * Deterministic hash of userId + flagKey → integer 0–99.
 * Same user always gets the same bucket for a given flag.
 */
function hashBucket(userId, flagKey) {
  const hash = crypto.createHash('sha256').update(`${userId}:${flagKey}`).digest('hex');
  return parseInt(hash.slice(0, 8), 16) % 100;
}

/**
 * Evaluate whether a feature flag is active for a given user + tenant context.
 *
 * Lookup order:
 *  1. Tenant-specific flag (key + tenantId) — takes precedence over global
 *  2. Global flag (key, tenant_id IS NULL)
 *
 * Evaluation rules (same for both):
 *  1. Flag disabled → false (unless user is in targetUsers)
 *  2. User explicitly in targetUsers → true
 *  3. User's hash bucket < percentage → true
 *  4. Otherwise → false
 *
 * Results are cached for 30 seconds per (flagKey, tenantId) pair.
 *
 * @param {string} flagKey
 * @param {{ id: string|number, tenantId?: string }} userContext
 * @returns {Promise<boolean>}
 */
export async function isFeatureEnabled(flagKey, userContext) {
  const tenantId = userContext.tenantId ?? null;
  const cacheKey = `feature_flag:${flagKey}:${tenantId ?? 'global'}`;

  // Try cache first
  let flag = await cache.get(cacheKey);

  if (flag === null || flag === undefined) {
    // Prefer tenant-specific flag; fall back to global
    if (tenantId) {
      flag = await prisma.featureFlag.findFirst({
        where: { key: flagKey, tenantId },
      });
    }
    if (!flag) {
      flag = await prisma.featureFlag.findFirst({
        where: { key: flagKey, tenantId: null },
      });
    }

    await cache.set(cacheKey, flag ?? false, FLAG_CACHE_TTL);
  }

  if (!flag) return false;

  const userId = String(userContext.id);

  if (!flag.isEnabled) {
    return flag.targetUsers.includes(userId);
  }

  if (flag.targetUsers.includes(userId)) return true;

  return hashBucket(userId, flagKey) < flag.percentage;
}

/**
 * Return all flags (for admin listing).
 * Accepts optional tenantId to filter tenant-specific + global flags.
 */
export async function listFlags(tenantId) {
  if (tenantId) {
    return prisma.featureFlag.findMany({
      where: { OR: [{ tenantId }, { tenantId: null }] },
      orderBy: { key: 'asc' },
    });
  }
  return prisma.featureFlag.findMany({ orderBy: { key: 'asc' } });
}

/**
 * Create a new feature flag.
 */
export async function createFlag(
  { key, tenantId = null, isEnabled = false, percentage = 0, targetUsers = [], description = '' },
  adminId,
) {
  const flag = await prisma.featureFlag.create({
    data: { key, tenantId, isEnabled, percentage, targetUsers, description },
  });
  await _invalidateFlagCache(key, tenantId);
  await _auditFlagChange('FLAG_CREATED', flag.key, adminId, { isEnabled, percentage, tenantId });
  return flag;
}

/**
 * Update an existing flag. Logs every change.
 */
export async function updateFlag(key, patch, adminId) {
  const flag = await prisma.featureFlag.update({
    where: { key },
    data: patch,
  });
  await _invalidateFlagCache(key, flag.tenantId);
  await _auditFlagChange('FLAG_UPDATED', key, adminId, patch);
  return flag;
}

/**
 * Delete a flag.
 */
export async function deleteFlag(key, adminId) {
  const flag = await prisma.featureFlag.findUnique({ where: { key } });
  await prisma.featureFlag.delete({ where: { key } });
  await _invalidateFlagCache(key, flag?.tenantId);
  await _auditFlagChange('FLAG_DELETED', key, adminId, {});
}

async function _invalidateFlagCache(key, tenantId) {
  await cache.invalidate(`feature_flag:${key}:${tenantId ?? 'global'}`);
  await cache.invalidate(`feature_flag:${key}:global`);
}

async function _auditFlagChange(action, flagKey, adminId, changes) {
  await log({
    category: AuditCategory.ADMIN,
    action,
    actor: String(adminId ?? 'admin'),
    resourceId: flagKey,
    metadata: changes,
  });
}
