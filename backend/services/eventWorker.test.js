'use strict';

jest.mock('../lib/redis', () => {
  const store = new Map();
  const locks = new Map();
  return {
    __store: store,
    __locks: locks,
    __reset: () => {
      store.clear();
      locks.clear();
    },
    get: jest.fn(async (key) => (store.has(key) ? store.get(key) : null)),
    set: jest.fn(async (key, value) => {
      store.set(key, value);
      return 'OK';
    }),
    del: jest.fn(async (key) => {
      const existed = store.delete(key);
      return existed ? 1 : 0;
    }),
    setNx: jest.fn(async (key, value) => {
      if (locks.has(key)) {
        return false;
      }
      locks.set(key, value);
      return true;
    }),
    releaseLock: jest.fn(async (key) => {
      return locks.delete(key);
    }),
    isAvailable: jest.fn(async () => true),
  };
});

jest.mock('../lib/metrics', () => ({
  increment: jest.fn(),
  gauge: jest.fn(),
  timing: jest.fn(),
  __reset: () => {
    const m = require('../lib/metrics');
    m.increment.mockClear();
    m.gauge.mockClear();
    m.timing.mockClear();
  },
}));

const redis = require('../lib/redis');
const metrics = require('../lib/metrics');
const eventWorker = require('./eventWorker');

describe('eventWorker checkpoint recovery concurrency', () => {
  let dbMock;

  beforeEach(() => {
    redis.__reset();
    metrics.__reset();
    redis.isAvailable.mockResolvedValue(true);
    dbMock = {
      getCheckpoint: jest.fn(async () => ({ lastProcessedBlock: 100 })),
      saveCheckpoint: jest.fn(async () => ({ ok: true })),
      applyRecovery: jest.fn(async () => ({ applied: true })),
    };
    eventWorker.__setDbForTests(dbMock);
  });

  afterEach(() => {
    eventWorker.__resetForTests();
  });

  test('primary success path: single recovery applies checkpoint', async () => {
    const result = await eventWorker.recoverCheckpoint({ workerId: 'w1' });

    expect(result).toEqual(
      expect.objectContaining({ status: 'applied', workerId: 'w1' })
    );
    expect(dbMock.applyRecovery).toHaveBeenCalledTimes(1);
    expect(dbMock.saveCheckpoint).toHaveBeenCalledTimes(1);
    expect(redis.releaseLock).toHaveBeenCalledTimes(1);
  });

  test('exactly-once: concurrent recoveries apply once, others report duplicate', async () => {
    const results = await Promise.all([
      eventWorker.recoverCheckpoint({ workerId: 'w1' }),
      eventWorker.recoverCheckpoint({ workerId: 'w2' }),
      eventWorker.recoverCheckpoint({ workerId: 'w3' }),
      eventWorker.recoverCheckpoint({ workerId: 'w4' }),
    ]);

    const applied = results.filter((r) => r.status === 'applied');
    const duplicates = results.filter((r) => r.status === 'duplicate');

    expect(applied).toHaveLength(1);
    expect(duplicates).toHaveLength(3);
    expect(dbMock.applyRecovery).toHaveBeenCalledTimes(1);
    expect(dbMock.saveCheckpoint).toHaveBeenCalledTimes(1);
    expect(redis.releaseLock).toHaveBeenCalledTimes(1);
  });

  test('deterministic ordering: applied result is consistent across runs', async () => {
    const runOnce = async () => {
      redis.__reset();
      metrics.__reset();
      redis.isAvailable.mockResolvedValue(true);
      dbMock.applyRecovery.mockClear();
      dbMock.saveCheckpoint.mockClear();
      redis.releaseLock.mockClear();

      const results = await Promise.all([
        eventWorker.recoverCheckpoint({ workerId: 'a' }),
        eventWorker.recoverCheckpoint({ workerId: 'b' }),
        eventWorker.recoverCheckpoint({ workerId: 'c' }),
      ]);

      return results.map((r) => r.status).sort();
    };

    const first = await runOnce();
    const second = await runOnce();

    expect(first).toEqual(['applied', 'duplicate', 'duplicate']);
    expect(second).toEqual(first);
  });

  test('lock contention: worker that cannot acquire lock returns duplicate without applying', async () => {
    redis.setNx.mockResolvedValueOnce(false);

    const result = await eventWorker.recoverCheckpoint({ workerId: 'w1' });

    expect(result.status).toBe('duplicate');
    expect(dbMock.applyRecovery).not.toHaveBeenCalled();
    expect(dbMock.saveCheckpoint).not.toHaveBeenCalled();
    expect(redis.releaseLock).not.toHaveBeenCalled();
  });

  test('partial failure: lock is released and error is deterministic', async () => {
    dbMock.applyRecovery.mockRejectedValueOnce(new Error('db write failed'));

    await expect(
      eventWorker.recoverCheckpoint({ workerId: 'w1' })
    ).rejects.toThrow('db write failed');

    expect(redis.releaseLock).toHaveBeenCalledTimes(1);
    expect(dbMock.saveCheckpoint).not.toHaveBeenCalled();
  });

  test('partial failure does not poison subsequent recovery', async () => {
    dbMock.applyRecovery.mockRejectedValueOnce(new Error('transient'));

    await expect(
      eventWorker.recoverCheckpoint({ workerId: 'w1' })
    ).rejects.toThrow('transient');

    const retry = await eventWorker.recoverCheckpoint({ workerId: 'w2' });

    expect(retry.status).toBe('applied');
    expect(dbMock.applyRecovery).toHaveBeenCalledTimes(2);
    expect(dbMock.saveCheckpoint).toHaveBeenCalledTimes(1);
  });

  test('degraded mode: Redis unavailable falls back without throwing', async () => {
    redis.isAvailable.mockResolvedValue(false);

    const result = await eventWorker.recoverCheckpoint({ workerId: 'w1' });

    expect(result).toEqual(
      expect.objectContaining({ status: 'degraded', workerId: 'w1' })
    );
    expect(dbMock.applyRecovery).toHaveBeenCalledTimes(1);
    expect(redis.setNx).not.toHaveBeenCalled();
    expect(redis.releaseLock).not.toHaveBeenCalled();
  });

  test('degraded mode: concurrent recoveries still apply exactly once via db guard', async () => {
    redis.isAvailable.mockResolvedValue(false);
    let appliedCount = 0;
    dbMock.applyRecovery.mockImplementation(async () => {
      appliedCount += 1;
      return { applied: appliedCount === 1 };
    });

    const results = await Promise.all([
      eventWorker.recoverCheckpoint({ workerId: 'w1' }),
      eventWorker.recoverCheckpoint({ workerId: 'w2' }),
      eventWorker.recoverCheckpoint({ workerId: 'w3' }),
    ]);

    const applied = results.filter((r) => r.status === 'applied');
    const duplicates = results.filter((r) => r.status === 'duplicate');

    expect(applied).toHaveLength(1);
    expect(duplicates).toHaveLength(2);
  });

  test('metrics are recorded without secrets', async () => {
    await eventWorker.recoverCheckpoint({ workerId: 'w1' });

    expect(metrics.increment).toHaveBeenCalled();
    const serialized = JSON.stringify(metrics.increment.mock.calls);
    expect(serialized).not.toMatch(/secret|password|token/i);
  });
});