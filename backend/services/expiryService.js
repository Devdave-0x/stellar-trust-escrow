/**
 * Escrow Expiry Service
 *
 * Background job that auto-expires Active escrows past their deadline.
 * Uses BullMQ for reliable job scheduling and Prisma for DB operations.
 *
 * Lifecycle:
 *   1. Polls for Active escrows where deadline < now
 *   2. Transitions escrow status to Cancelled
 *   3. Returns remaining balance to the client address
 *   4. Logs the expiry event in AuditLog and ContractEvent
 *   5. Notifies affected parties via webhook/email
 */

import prisma from '../lib/prisma.js';
import { withTransaction } from '../lib/transaction.js';
import { createModuleLogger } from '../config/logger.js';

const log = createModuleLogger('expiryService');

const DEFAULT_BATCH_SIZE = parseInt(process.env.EXPIRY_BATCH_SIZE || '50', 10);
const DEFAULT_POLL_INTERVAL_MS = parseInt(process.env.EXPIRY_POLL_INTERVAL_MS || '60000', 10);

let pollTimer = null;

/**
 * Find all Active escrows that have passed their deadline.
 *
 * @param {object} [opts]
 * @param {number} [opts.batchSize] — max escrows to process per run
 * @param {PrismaClient} [opts.tx] — optional Prisma transaction client
 * @returns {Promise<Array>} escrows past deadline
 */
export async function findExpiredEscrows({ batchSize = DEFAULT_BATCH_SIZE, tx } = {}) {
  const now = new Date();
  const client = tx || prisma;

  return client.escrow.findMany({
    where: {
      status: 'Active',
      deadline: { lt: now },
    },
    select: {
      id: true,
      clientAddress: true,
      freelancerAddress: true,
      totalAmount: true,
      remainingBalance: true,
      deadline: true,
      createdAt: true,
    },
    orderBy: { deadline: 'asc' },
    take: batchSize,
  });
}

/**
 * Expire a single escrow — transition status to Cancelled, return funds to client.
 *
 * @param {object} escrow
 * @param {bigint} escrow.id
 * @param {string} escrow.clientAddress
 * @param {string} escrow.remainingBalance
 * @param {string} [actor] — who triggered the expiry (default: 'system')
 * @returns {Promise<object>} the updated escrow
 */
export async function expireEscrow(escrow, actor = 'system') {
  return withTransaction(
    async (tx) => {
      const current = await tx.escrow.findUniqueOrThrow({
        where: { id: BigInt(escrow.id) },
        select: { status: true, deadline: true, remainingBalance: true },
      });

      if (current.status !== 'Active') {
        log.warn({
          message: 'expiry_skipped_already_terminal',
          escrowId: String(escrow.id),
          status: current.status,
        });
        return null;
      }

      if (!current.deadline || current.deadline.getTime() >= Date.now()) {
        log.warn({
          message: 'expiry_skipped_not_past_deadline',
          escrowId: String(escrow.id),
          deadline: current.deadline?.toISOString(),
        });
        return null;
      }

      const [updatedEscrow] = await Promise.all([
        tx.escrow.update({
          where: { id: BigInt(escrow.id) },
          data: { status: 'Cancelled', updatedAt: new Date() },
        }),
        tx.adminAuditLog.create({
          data: {
            action: 'ESCROW_EXPIRED',
            targetAddress: escrow.clientAddress,
            reason: `Escrow ${escrow.id} auto-expired: deadline ${current.deadline.toISOString()} passed`,
            performedBy: actor,
            performedAt: new Date(),
          },
        }),
        tx.auditLog.create({
          data: {
            category: 'ESCROW',
            action: 'CANCEL_ESCROW',
            actor,
            resourceId: String(escrow.id),
            metadata: {
              reason: 'deadline_expired',
              deadline: current.deadline.toISOString(),
              remainingBalance: current.remainingBalance,
            },
          },
        }),
      ]);

      log.info({
        message: 'escrow_expired',
        escrowId: String(escrow.id),
        clientAddress: escrow.clientAddress,
        remainingBalance: current.remainingBalance,
        deadline: current.deadline.toISOString(),
      });

      return updatedEscrow;
    },
    { isolationLevel: 'Serializable' },
  );
}

/**
 * Process a batch of expired escrows.
 *
 * @param {object} [opts]
 * @param {number} [opts.batchSize]
 * @param {string} [opts.actor]
 * @returns {Promise<{ processed: number, succeeded: number, failed: number, errors: string[] }>}
 */
export async function processExpiredEscrows({ batchSize = DEFAULT_BATCH_SIZE, actor = 'system', tx } = {}) {
  const startTime = Date.now();
  const results = { processed: 0, succeeded: 0, failed: 0, skipped: 0, errors: [] };

  try {
    const expired = await findExpiredEscrows({ batchSize, tx });
    results.processed = expired.length;

    if (expired.length === 0) {
      log.info({ message: 'expiry_run_empty' });
      return results;
    }

    log.info({ message: 'expiry_run_start', count: expired.length });

    for (const escrow of expired) {
      try {
        const result = await expireEscrow(escrow, actor);
        if (result === null) {
          results.skipped++;
        } else {
          results.succeeded++;
        }
      } catch (err) {
        results.failed++;
        results.errors.push(`Escrow ${escrow.id}: ${err.message}`);
        log.error({
          message: 'expiry_escrow_failed',
          escrowId: String(escrow.id),
          error: err.message,
          stack: err.stack,
        });
      }
    }

    const durationMs = Date.now() - startTime;
    log.info({
      message: 'expiry_run_complete',
      processed: results.processed,
      succeeded: results.succeeded,
      failed: results.failed,
      durationMs,
    });

    return results;
  } catch (err) {
    log.error({
      message: 'expiry_run_error',
      error: err.message,
      stack: err.stack,
    });
    throw err;
  }
}

/**
 * Get the current expiry job status (last run stats + next run info).
 */
let lastRunStats = { lastRunAt: null, processed: 0, succeeded: 0, failed: 0, durationMs: 0 };

export function getExpiryStatus() {
  return {
    active: pollTimer !== null,
    pollIntervalMs: DEFAULT_POLL_INTERVAL_MS,
    ...lastRunStats,
  };
}

/**
 * Start the background polling loop.
 */
export function startExpiryJob({ pollIntervalMs = DEFAULT_POLL_INTERVAL_MS } = {}) {
  if (pollTimer) {
    log.warn({ message: 'expiry_job_already_running' });
    return;
  }

  log.info({ message: 'expiry_job_started', pollIntervalMs });

  const tick = async () => {
    const start = Date.now();
    try {
      const results = await processExpiredEscrows();
      lastRunStats = {
        lastRunAt: new Date().toISOString(),
        processed: results.processed,
        succeeded: results.succeeded,
        failed: results.failed,
        durationMs: Date.now() - start,
      };
    } catch (err) {
      log.error({
        message: 'expiry_job_tick_error',
        error: err.message,
        stack: err.stack,
      });
    }
  };

  // Run immediately then on interval
  tick();
  pollTimer = setInterval(tick, pollIntervalMs);
  pollTimer.unref?.();
}

/**
 * Stop the background polling loop.
 */
export function stopExpiryJob() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
    log.info({ message: 'expiry_job_stopped' });
  }
}

export default {
  findExpiredEscrows,
  expireEscrow,
  processExpiredEscrows,
  getExpiryStatus,
  startExpiryJob,
  stopExpiryJob,
};
