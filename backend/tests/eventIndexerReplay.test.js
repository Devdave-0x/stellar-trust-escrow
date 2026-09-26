import { jest } from '@jest/globals';

const loggerMock = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

const prismaMock = {
  escrow: { update: jest.fn() },
  contractEvent: { create: jest.fn() },
  $transaction: jest.fn(),
};

jest.unstable_mockModule('../config/logger.js', () => ({
  createModuleLogger: () => loggerMock,
}));

jest.unstable_mockModule('../lib/prisma.js', () => ({ default: prismaMock }));
jest.unstable_mockModule('../services/stellarService.js', () => ({
  getContractEvents: jest.fn(),
  getLatestLedger: jest.fn(),
}));
jest.unstable_mockModule('../api/websocket/handlers.js', () => ({
  broadcastEscrowEvent: jest.fn(),
}));
jest.unstable_mockModule('../services/escrowRealtime.js', () => ({
  broadcastEscrowUpdate: jest.fn(),
}));
jest.unstable_mockModule('../services/reputationSearchService.js', () => ({
  indexRecord: jest.fn(),
}));
jest.unstable_mockModule('../services/webhookService.js', () => ({
  default: { queueEventWebhooks: jest.fn() },
}));
jest.unstable_mockModule('../lib/metrics.js', () => ({
  recordEscrowStateTransition: jest.fn(),
}));

const { dispatchEvent } = await import('../services/eventIndexer.js');

describe('eventIndexer duplicate replay handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.escrow.update.mockResolvedValue({});
    prismaMock.contractEvent.create.mockResolvedValue({});
  });

  it('skips duplicate raw event inserts without rethrowing', async () => {
    prismaMock.$transaction
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(Object.assign(new Error('duplicate event'), { code: 'P2002' }));

    const event = {
      topic: ['esc_can', '42'],
      value: [],
      ledger: 123,
      ledgerClosedAt: '2026-01-01T00:00:00.000Z',
      txHash: 'tx-duplicate',
      id: '123-0',
      contractId: 'contract-1',
    };

    await expect(dispatchEvent(event)).resolves.toBeUndefined();
    await expect(dispatchEvent(event)).resolves.toBeUndefined();

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(2);
    expect(loggerMock.error).not.toHaveBeenCalled();
  });
});
