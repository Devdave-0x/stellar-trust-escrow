import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const queueInstances = [];
jest.unstable_mockModule('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => {
    const queue = { add: jest.fn(), getJob: jest.fn() };
    queueInstances.push(queue);
    return queue;
  }),
  Worker: jest.fn().mockImplementation(() => ({ on: jest.fn() })),
}));
jest.unstable_mockModule('../lib/prisma.js', () => ({ default: {} }));
jest.unstable_mockModule('../config/logger.js', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const { redriveFailedEvent, __resetForTests } = await import('../queues/eventQueue.js');

describe('dead-letter redrive', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    __resetForTests();
  });

  it('redrives a failed job exactly once', async () => {
    const failedJob = { data: { originalJobData: { eventType: 'created' } }, remove: jest.fn() };
    const sourceQueue = { getJob: jest.fn().mockResolvedValue(failedJob) };
    const targetQueue = { add: jest.fn().mockResolvedValue({ id: 'new-job' }) };

    await expect(redriveFailedEvent('job-1', { sourceQueue, targetQueue })).resolves.toEqual({
      status: 'redriven',
      jobId: 'job-1',
    });
    await expect(redriveFailedEvent('job-1', { sourceQueue, targetQueue })).resolves.toMatchObject({
      status: 'duplicate',
    });
    expect(targetQueue.add).toHaveBeenCalledTimes(1);
  });

  it('coalesces concurrent redrive requests', async () => {
    let release;
    const failedJob = { data: {}, remove: jest.fn() };
    const sourceQueue = {
      getJob: jest.fn(() => new Promise((resolve) => (release = () => resolve(failedJob)))),
    };
    const targetQueue = { add: jest.fn() };
    const first = redriveFailedEvent('job-2', { sourceQueue, targetQueue });
    const second = redriveFailedEvent('job-2', { sourceQueue, targetQueue });
    expect(second).toBe(first);
    release();
    await first;
  });

  it('returns a stable result when the failed job is absent', async () => {
    await expect(
      redriveFailedEvent('missing', {
        sourceQueue: { getJob: jest.fn().mockResolvedValue(null) },
        targetQueue: { add: jest.fn() },
      }),
    ).resolves.toEqual({ status: 'not_found', jobId: 'missing' });
  });
});
