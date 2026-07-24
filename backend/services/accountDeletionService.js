import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import prisma from '../lib/prisma.js';
import { createModuleLogger } from '../config/logger.js';

const logger = createModuleLogger('accountDeletionService');

const SOFT_DELETE_DAYS = 30;

/**
 * Request account deletion. Sets a 30-day countdown timer.
 * Calling again while a request is pending resets the timer.
 *
 * @param {number} userId
 * @returns {Promise<{ scheduledFor: Date }>}
 */
export async function requestAccountDeletion(userId) {
  const now = new Date();

  await prisma.user.update({
    where: { id: userId },
    data: { deletionRequestedAt: now },
  });

  const scheduledFor = new Date(now.getTime() + SOFT_DELETE_DAYS * 24 * 60 * 60 * 1000);
  logger.info({ userId, scheduledFor }, 'Account deletion requested');
  return { scheduledFor };
}

/**
 * Cancel a pending deletion request.
 *
 * @param {number} userId
 */
export async function cancelAccountDeletion(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { deletionRequestedAt: true, deletedAt: true },
  });

  if (!user) throw Object.assign(new Error('User not found'), { statusCode: 404 });
  if (!user.deletionRequestedAt)
    throw Object.assign(new Error('No pending deletion request'), { statusCode: 409 });
  if (user.deletedAt)
    throw Object.assign(new Error('Account has already been anonymised'), { statusCode: 410 });

  await prisma.user.update({
    where: { id: userId },
    data: { deletionRequestedAt: null },
  });

  logger.info({ userId }, 'Account deletion cancelled');
}

/**
 * Permanently anonymise a user's PII. Idempotent — safe to call more than once.
 *
 * @param {number} userId
 */
export async function finaliseAccountDeletion(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, anonymisedAt: true },
  });

  if (!user) return;
  if (user.anonymisedAt) {
    logger.info({ userId }, 'Account already anonymised — skipping');
    return;
  }

  // Replace PII with deterministic-but-unrecoverable placeholders
  const anonEmail = `deleted_${userId}@deleted.invalid`;
  // Random password hash — account cannot be logged into
  const anonPasswordHash = await bcrypt.hash(randomBytes(32).toString('hex'), 12);
  const now = new Date();

  await prisma.user.update({
    where: { id: userId },
    data: {
      email: anonEmail,
      password: anonPasswordHash,
      walletAddress: null,
      deletedAt: now,
      anonymisedAt: now,
      deletionRequestedAt: null,
    },
  });

  logger.info({ userId }, 'Account anonymised successfully');
}

/**
 * Scheduled job: anonymise all accounts whose 30-day window has elapsed.
 * Meant to be called daily by the cron scheduler.
 */
export async function purgeScheduledDeletions() {
  const cutoff = new Date(Date.now() - SOFT_DELETE_DAYS * 24 * 60 * 60 * 1000);

  const due = await prisma.user.findMany({
    where: {
      deletionRequestedAt: { lte: cutoff },
      anonymisedAt: null,
    },
    select: { id: true },
  });

  if (due.length === 0) {
    logger.info('purgeScheduledDeletions: nothing due');
    return;
  }

  logger.info({ count: due.length }, 'purgeScheduledDeletions: anonymising accounts');
  await Promise.allSettled(due.map((u) => finaliseAccountDeletion(u.id)));
}
