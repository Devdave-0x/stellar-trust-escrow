/**
 * Monthly Usage Counter Reset Job
 *
 * Tenant API-call counters are already namespaced by year-month
 * (tenant:{id}:api_calls:{year_month}), so a new month starts counting
 * from zero automatically. This job just sweeps stale prior-month keys
 * out of Redis so they don't accumulate indefinitely.
 *
 * @module lib/jobs/resetUsageCounters
 */

import cron from 'node-cron';
import redis from '../redis.js';
import { currentYearMonth } from '../../api/middleware/apiUsageCounter.js';

export async function resetUsageCounters() {
  const currentSuffix = currentYearMonth();
  const keys = await redis.keys('tenant:*:api_calls:*');
  const stale = keys.filter((key) => !key.endsWith(`:api_calls:${currentSuffix}`));

  if (stale.length > 0) {
    await redis.del(...stale);
  }

  return stale.length;
}

/** Schedules the reset to run at 00:00 UTC on the 1st of each month. */
export function scheduleUsageCounterReset() {
  return cron.schedule('0 0 1 * *', () => {
    resetUsageCounters().catch((err) => {
      console.error('[resetUsageCounters] failed:', err.message);
    });
  });
}
