/**
 * Expiry Worker
 *
 * BullMQ worker that processes auto-expiry of timed-out escrows.
 * Consumes from the 'expiry' queue and delegates to expiryService.
 *
 * In production, this worker is started by the server alongside other BullMQ
 * workers. In test mode, the in-memory queue is used instead.
 */

import { createModuleLogger } from '../config/logger.js';
import { processExpiredEscrows } from '../services/expiryService.js';

const log = createModuleLogger('expiryWorker');

/**
 * Process a single expiry job from the queue.
 *
 * @param {object} job — BullMQ job object
 * @returns {Promise<object>} results summary
 */
export async function handleExpiryJob(job) {
  log.info({ message: 'expiry_job_received', jobId: job?.id });

  const results = await processExpiredEscrows({
    batchSize: job?.data?.batchSize || 50,
    actor: 'expiry-worker',
  });

  log.info({
    message: 'expiry_job_complete',
    jobId: job?.id,
    processed: results.processed,
    succeeded: results.succeeded,
    failed: results.failed,
  });

  return results;
}

export default { handleExpiryJob };
