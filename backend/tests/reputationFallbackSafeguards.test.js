import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.unstable_mockModule('@elastic/elasticsearch', () => ({ Client: jest.fn() }));
jest.unstable_mockModule('../lib/prisma.js', () => ({ default: {} }));
const { runPrismaFallback, resetFallbackState } = await import(
  '../services/reputationSearchService.js'
);

function database() {
  const reputationRecord = {
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
  };
  return {
    reputationRecord,
    $transaction: jest.fn(async (operations) => Promise.all(operations)),
  };
}

describe('reputation fallback safeguards', () => {
  beforeEach(resetFallbackState);

  it('returns a deterministic Prisma fallback response', async () => {
    await expect(runPrismaFallback('GA', {}, database())).resolves.toEqual({
      hits: [],
      total: 0,
      source: 'prisma',
    });
  });

  it('coalesces duplicate concurrent fallback searches', async () => {
    const db = database();
    let release;
    db.reputationRecord.findMany.mockImplementation(
      () => new Promise((resolve) => (release = () => resolve([]))),
    );
    const first = runPrismaFallback('GA', { tenantId: 'tenant-1' }, db);
    const second = runPrismaFallback('GA', { tenantId: 'tenant-1' }, db);
    expect(second).toBe(first);
    release();
    await first;
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });

  it('propagates fallback database failures', async () => {
    const db = database();
    db.$transaction.mockRejectedValue(new Error('database timeout'));
    await expect(runPrismaFallback('', {}, db)).rejects.toThrow('database timeout');
  });

  it('clears the idempotency slot after terminal failure', async () => {
    const db = database();
    db.$transaction.mockRejectedValueOnce(new Error('temporary')).mockResolvedValueOnce([[], 0]);
    await expect(runPrismaFallback('retry', {}, db)).rejects.toThrow('temporary');
    await expect(runPrismaFallback('retry', {}, db)).resolves.toMatchObject({ source: 'prisma' });
  });
});
