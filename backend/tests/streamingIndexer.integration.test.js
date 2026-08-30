/**
 * Integration Test for streamingIndexer.js
 *
 * Exercises the complete happy-path flow of the StreamingIndexer:
 *  1. Service initialization & checkpoint restoration
 *  2. Ingestion & processing of Soroban contract events (EscrowCreated, FundsReleased)
 *  3. Storage operations in PostgreSQL via Prisma (escrow upsert, contractEvent creation)
 *  4. Checkpoint state updates in indexerState
 *  5. Realtime WebSocket notification broadcast
 *  6. Teardown & handle cleanup
 */

import { jest } from '@jest/globals';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const loggerMock = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};
jest.unstable_mockModule('../config/logger.js', () => ({
  createModuleLogger: () => loggerMock,
}));

const prismaMock = {
  indexerState: {
    upsert: jest.fn(),
    update: jest.fn(),
  },
  escrow: {
    upsert: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  milestone: {
    upsert: jest.fn(),
  },
  contractEvent: {
    create: jest.fn(),
  },
  $transaction: jest.fn(async (ops) => Promise.all(ops)),
};
jest.unstable_mockModule('../lib/prisma.js', () => ({ default: prismaMock }));

const stellarServiceMock = {
  getLatestLedger: jest.fn(),
  getContractEvents: jest.fn(),
};
jest.unstable_mockModule('../services/stellarService.js', () => stellarServiceMock);

const websocketMock = {
  broadcastEscrowEvent: jest.fn(),
};
jest.unstable_mockModule('../api/websocket/handlers.js', () => websocketMock);

// ── Import SUT ────────────────────────────────────────────────────────────────

const { StreamingIndexer, processEvent } = await import('../services/streamingIndexer.js');

describe('StreamingIndexer Integration Flow', () => {
  let indexer;

  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.indexerState.upsert.mockResolvedValue({ id: 1, lastProcessedLedger: 100n });
    prismaMock.indexerState.update.mockResolvedValue({ id: 1, lastProcessedLedger: 105n });
    prismaMock.escrow.upsert.mockResolvedValue({ id: 101n, status: 'Active' });
    prismaMock.escrow.findUnique.mockResolvedValue({ id: 101n, remainingBalance: '1000' });
    prismaMock.escrow.update.mockResolvedValue({
      id: 101n,
      status: 'Completed',
      remainingBalance: '0',
    });
    prismaMock.contractEvent.create.mockResolvedValue({ id: 1 });

    indexer = new StreamingIndexer({
      contractId: 'C_ESCROW_CONTRACT_ID_123',
      pollIntervalMs: 60000, // Large interval to prevent unexpected background interval ticks
    });
  });

  afterEach(async () => {
    if (indexer) {
      await indexer.stop();
    }
  });

  it('completes the full happy-path streaming indexer flow from event receipt to DB and checkpoint update', async () => {
    const startTime = Date.now();

    // 1. Initialise indexer
    const initialLedger = await indexer.initialize();
    expect(initialLedger).toBe(100);
    expect(prismaMock.indexerState.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 1 } }),
    );

    // 2. Setup mock contract events emitted between ledger 101 and 105
    const mockEvents = [
      {
        topic: ['esc_crt', 101n],
        value: ['GCLIENT123456789', 'GFREELANCER987654321', 1000n],
        ledger: 102,
        ledgerClosedAt: '2026-08-29T12:00:00Z',
        txHash: '0xhash123',
      },
      {
        topic: ['funds_rel', 101n],
        value: [1000n],
        ledger: 104,
        ledgerClosedAt: '2026-08-29T12:05:00Z',
        txHash: '0xhash456',
      },
    ];

    stellarServiceMock.getLatestLedger.mockResolvedValue(105);
    stellarServiceMock.getContractEvents.mockResolvedValue(mockEvents);

    // 3. Start indexer & run tick
    indexer.isRunning = true;
    await indexer.tick();

    // 4. Verify contract events fetched for expected ledger range
    expect(stellarServiceMock.getContractEvents).toHaveBeenCalledWith(
      101,
      105,
      'C_ESCROW_CONTRACT_ID_123',
    );

    // 5. Verify database storage operations
    expect(prismaMock.escrow.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 101n },
        create: expect.objectContaining({
          id: 101n,
          clientAddress: 'GCLIENT123456789',
          freelancerAddress: 'GFREELANCER987654321',
          totalAmount: '1000',
          remainingBalance: '1000',
          status: 'Active',
        }),
      }),
    );

    // 6. Verify funds release updated remaining balance and set status to Completed
    expect(prismaMock.escrow.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 101n },
        data: expect.objectContaining({
          remainingBalance: '0',
          status: 'Completed',
        }),
      }),
    );

    // 7. Verify contract event records were created
    expect(prismaMock.contractEvent.create).toHaveBeenCalledTimes(2);

    // 8. Verify WebSocket broadcast was sent
    expect(websocketMock.broadcastEscrowEvent).toHaveBeenCalledWith(
      101n,
      'escrow:funded',
      'Active',
    );

    // 9. Verify checkpoint state was updated to ledger 105
    expect(prismaMock.indexerState.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { lastProcessedLedger: 105n },
    });
    expect(indexer.lastProcessedLedger).toBe(105);

    // 10. Clean shutdown
    await indexer.stop();
    expect(indexer.isRunning).toBe(false);
    expect(indexer.timer).toBeNull();

    // Execution time check (must be well under 5 seconds)
    const duration = Date.now() - startTime;
    expect(duration).toBeLessThan(5000);
  });

  it('handles isolated processEvent transformations directly', async () => {
    const rawEvent = {
      topic: ['mil_add', 200n],
      value: [1n, 500n],
    };

    const res = await processEvent(rawEvent, { ledger: 150 });
    expect(res).toEqual({ escrowId: 200n, eventType: 'mil_add', ledger: 150 });
    expect(prismaMock.milestone.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { escrowId_milestoneIndex: { escrowId: 200n, milestoneIndex: 1 } },
        create: expect.objectContaining({
          escrowId: 200n,
          milestoneIndex: 1,
          amount: '500',
          status: 'Pending',
        }),
      }),
    );
  });
});
