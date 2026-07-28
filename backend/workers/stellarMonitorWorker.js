/**
 * Stellar Monitor Worker
 *
 * BullMQ worker that processes Stellar transaction monitoring jobs.
 * Delegates to the stellarMonitorService for actual status checking.
 */

import { createModuleLogger } from '../config/logger.js';
import { pollPendingTransactions } from '../services/stellarMonitorService.js';

const log = createModuleLogger('stellarMonitorWorker');

/**
 * Process a single monitoring job from the queue.
 *
 * @param {object} job — BullMQ job object
 * @returns {Promise<object>} results summary
 */
export async function handleMonitorJob(job) {
  log.info({ message: 'monitor_job_received', jobId: job?.id });

  const results = await pollPendingTransactions({
    batchSize: job?.data?.batchSize || 50,
  });

  log.info({
    message: 'monitor_job_complete',
    jobId: job?.id,
    ...results,
  });

  return results;
}

export default { handleMonitorJob };
