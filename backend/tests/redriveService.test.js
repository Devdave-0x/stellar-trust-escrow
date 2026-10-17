import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  readRedriveConfig,
  redriveJob,
  resetRedriveState,
} from '../queues/redriveService.js';

describe('dead-letter redrive service', () => {
  beforeEach(resetRedriveState);

  it('validates bounded configuration', () => {
    expect(readRedriveConfig({ DLQ_REDRIVE_CONCURRENCY: '4', DLQ_REDRIVE_BATCH_SIZE: '50' })).toEqual(
      { concurrency: 4, batchSize: 50 },
    );
    expect(() => readRedriveConfig({ DLQ_REDRIVE_CONCURRENCY: '0' })).toThrow(
      'DLQ_REDRIVE_CONCURRENCY',
    );
    expect(() => readRedriveConfig({ DLQ_REDRIVE_BATCH_SIZE: '101' })).toThrow(
      'DLQ_REDRIVE_BATCH_SIZE',
    );
  });

  it('coalesces overlapping redrive requests', async () => {
    let release;
    const job = { data: { originalJobData: { id: 1 } }, remove: jest.fn() };
    const sourceQueue = {
      getJob: jest.fn(() => new Promise((resolve) => (release = () => resolve(job)))),
    };
    const targetQueue = { add: jest.fn() };

    const first = redriveJob('failed-1', { sourceQueue, targetQueue });
    const second = redriveJob('failed-1', { sourceQueue, targetQueue });
    expect(second).toBe(first);
    release();
    await first;
    expect(targetQueue.add).toHaveBeenCalledTimes(1);
  });

  it('degrades when queue infrastructure is absent', async () => {
    await expect(redriveJob('failed-2')).resolves.toEqual({
      status: 'degraded',
      reason: 'queue_unavailable',
      jobId: 'failed-2',
    });
  });

  it('degrades on queue connection failure', async () => {
    const error = Object.assign(new Error('private endpoint'), { code: 'ECONNREFUSED' });
    await expect(
      redriveJob('failed-3', {
        sourceQueue: { getJob: jest.fn().mockRejectedValue(error) },
        targetQueue: {},
      }),
    ).resolves.toMatchObject({ status: 'degraded', reason: 'queue_unavailable' });
  });
});
