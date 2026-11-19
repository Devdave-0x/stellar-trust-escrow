import { describe, expect, it, jest } from '@jest/globals';

const prismaMock = {
  indexerState: { update: jest.fn() },
  escrow: { findUnique: jest.fn(), updateMany: jest.fn() },
  $transaction: jest.fn(async (ops) => Promise.all(ops)),
};

jest.unstable_mockModule('../lib/prisma.js', () => ({ default: prismaMock }));

const {
  compareChainEventOrder,
  sortEventsByChainOrder,
  commitIndexerCheckpoint,
  reconcileIndexedEscrowState,
} = await import('../services/escrowIndexer.js');

describe('escrowIndexer — issues 891-894', () => {
  it('orders events by ledger, tx hash, then operation index', () => {
    const shuffled = [
      { ledger: 2, txHash: 'b', id: 1 },
      { ledger: 1, txHash: 'a', id: 0 },
      { ledger: 2, txHash: 'a', id: 2 },
    ];
    expect(sortEventsByChainOrder(shuffled).map((e) => e.id)).toEqual([0, 2, 1]);
    expect(compareChainEventOrder({ ledger: 1 }, { ledger: 2 })).toBeLessThan(0);
  });

  it('commits the cursor atomically after a successful batch', async () => {
    prismaMock.indexerState.update.mockResolvedValue({});
    await commitIndexerCheckpoint(42, 3);
    expect(prismaMock.$transaction).toHaveBeenCalled();
  });

  it('does not advance the cursor when the batch is empty', async () => {
    prismaMock.$transaction.mockClear();
    await commitIndexerCheckpoint(99, 0);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('reconciles mismatched escrow state without clobbering newer projections', async () => {
    prismaMock.escrow.findUnique.mockResolvedValue({
      status: 'Active',
      createdLedger: BigInt(100),
    });
    const stale = await reconcileIndexedEscrowState(1n, 'Completed', { ledger: 50, txHash: 'x' });
    expect(stale.repaired).toBe(false);
    expect(stale.reason).toBe('stale_chain_read');

    prismaMock.escrow.findUnique.mockResolvedValue({
      status: 'Active',
      createdLedger: BigInt(10),
    });
    prismaMock.escrow.updateMany.mockResolvedValue({ count: 1 });
    const fixed = await reconcileIndexedEscrowState(2n, 'Completed', { ledger: 200, txHash: 'y' });
    expect(fixed.repaired).toBe(true);
    expect(fixed.to).toBe('Completed');
  });
});