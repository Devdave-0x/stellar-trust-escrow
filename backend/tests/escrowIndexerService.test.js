import { jest } from '@jest/globals';

const prismaMock = {
  escrow: { updateMany: jest.fn(), upsert: jest.fn(), findUnique: jest.fn() },
  milestone: { updateMany: jest.fn(), upsert: jest.fn() },
};
jest.unstable_mockModule('../lib/prisma.js', () => ({ default: prismaMock }));
jest.unstable_mockModule('../config/logger.js', () => ({
  createModuleLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

const { handleEscrowCancelled } = await import('../services/escrowIndexer.js');

describe('escrowIndexer service — null/undefined handling', () => {
  beforeEach(() => jest.clearAllMocks());

  it('processes an event whose escrowId is 0 (a valid id, not a missing value)', async () => {
    await handleEscrowCancelled({ topic: ['esc_can', '0'] });
    expect(prismaMock.escrow.updateMany).toHaveBeenCalledWith({
      where: { id: BigInt(0) },
      data: { status: 'Cancelled' },
    });
  });

  it('skips an event with a genuinely missing escrowId', async () => {
    await handleEscrowCancelled({ topic: ['esc_can'] });
    expect(prismaMock.escrow.updateMany).not.toHaveBeenCalled();
  });
});
