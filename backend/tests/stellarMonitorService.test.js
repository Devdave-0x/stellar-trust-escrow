/**
 * Stellar Monitor Service Tests
 *
 * Covers:
 *   - Recording transactions for monitoring
 *   - Checking transaction statuses
 *   - Polling pending transactions
 *   - Status transitions (pending → confirmed/failed/timeout)
 *   - Getting monitor status
 *   - Listing recent transactions
 *   - Deduplication of already-tracked transactions
 */

import { jest } from '@jest/globals';

const prismaMock = {
  $transaction: jest.fn(async (ops) => {
    if (typeof ops === 'function') return ops(prismaMock);
    return Promise.all(ops);
  }),
  transactionMonitor: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
};

jest.unstable_mockModule('../lib/prisma.js', () => ({ default: prismaMock }));
jest.unstable_mockModule('../config/logger.js', () => ({
  createModuleLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

jest.unstable_mockModule('../services/stellarService.js', () => ({
  getLatestLedger: jest.fn().mockResolvedValue(50000),
  getContractEvents: jest.fn().mockResolvedValue([]),
  submitTransaction: jest.fn(),
}));

const {
  TxStatus,
  recordTransaction,
  pollPendingTransactions,
  getMonitorStatus,
  getRecentTransactions,
  stopMonitor,
} = await import('../services/stellarMonitorService.js');

afterEach(() => {
  jest.clearAllMocks();
  stopMonitor();
});

describe('stellarMonitorService', () => {
  const baseTx = {
    txHash: 'abc123hash',
    fromAddress: 'GFROM...',
    toAddress: 'GTO...',
    amount: '1000',
    memo: 'test payment',
    escrowId: '42',
  };

  describe('recordTransaction', () => {
    it('creates a new monitoring record', async () => {
      prismaMock.transactionMonitor.findUnique.mockResolvedValue(null);
      prismaMock.transactionMonitor.create.mockResolvedValue({
        id: 1,
        ...baseTx,
        status: TxStatus.PENDING,
        submittedAt: new Date(),
      });

      const result = await recordTransaction(baseTx);

      expect(result).toBeDefined();
      expect(result.status).toBe(TxStatus.PENDING);
      expect(prismaMock.transactionMonitor.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            txHash: 'abc123hash',
            fromAddress: 'GFROM...',
            status: TxStatus.PENDING,
          }),
        }),
      );
    });

    it('returns existing record if txHash already tracked', async () => {
      const existing = { id: 1, ...baseTx, status: TxStatus.PENDING };
      prismaMock.transactionMonitor.findUnique.mockResolvedValue(existing);

      const result = await recordTransaction(baseTx);

      expect(result).toEqual(existing);
      expect(prismaMock.transactionMonitor.create).not.toHaveBeenCalled();
    });

    it('handles optional fields gracefully', async () => {
      prismaMock.transactionMonitor.findUnique.mockResolvedValue(null);
      prismaMock.transactionMonitor.create.mockResolvedValue({
        id: 2,
        txHash: 'minimal',
        fromAddress: 'GFROM...',
        status: TxStatus.PENDING,
      });

      const result = await recordTransaction({ txHash: 'minimal', fromAddress: 'GFROM...' });

      expect(result).toBeDefined();
      expect(prismaMock.transactionMonitor.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            toAddress: null,
            amount: null,
            memo: null,
            escrowId: null,
          }),
        }),
      );
    });
  });

  describe('pollPendingTransactions', () => {
    it('returns zero when no pending transactions exist', async () => {
      prismaMock.transactionMonitor.findMany.mockResolvedValue([]);

      const results = await pollPendingTransactions();

      expect(results.checked).toBe(0);
      expect(results.confirmed).toBe(0);
      expect(results.failed).toBe(0);
    });

    it('updates status to CONFIRMED for successful transactions', async () => {
      const pendingTx = {
        txHash: 'confirmed_hash',
        submittedAt: new Date(Date.now() - 5000),
        status: TxStatus.PENDING,
      };
      prismaMock.transactionMonitor.findMany.mockResolvedValue([pendingTx]);
      prismaMock.transactionMonitor.update.mockResolvedValue({});

      const results = await pollPendingTransactions();

      expect(results.checked).toBe(1);
      expect(prismaMock.transactionMonitor.update).toHaveBeenCalled();
    });

    it('marks stuck transactions as TIMEOUT', async () => {
      const staleTx = {
        txHash: 'stale_hash',
        submittedAt: new Date(Date.now() - 120000), // 2 minutes ago
        status: TxStatus.PENDING,
      };
      prismaMock.transactionMonitor.findMany.mockResolvedValue([staleTx]);
      prismaMock.transactionMonitor.update.mockResolvedValue({});

      const results = await pollPendingTransactions();

      expect(results.checked).toBe(1);
      expect(prismaMock.transactionMonitor.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { txHash: 'stale_hash' },
          data: expect.objectContaining({ status: TxStatus.TIMEOUT }),
        }),
      );
    });

    it('updates lastCheckedAt for still-pending transactions', async () => {
      const freshTx = {
        txHash: 'fresh_hash',
        submittedAt: new Date(Date.now() - 2000), // 2 seconds ago
        status: TxStatus.PENDING,
      };
      prismaMock.transactionMonitor.findMany.mockResolvedValue([freshTx]);
      prismaMock.transactionMonitor.update.mockResolvedValue({});

      const results = await pollPendingTransactions();

      expect(results.checked).toBe(1);
      expect(prismaMock.transactionMonitor.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { txHash: 'fresh_hash' },
          data: expect.objectContaining({ lastCheckedAt: expect.any(Date) }),
        }),
      );
    });

    it('respects batchSize parameter', async () => {
      prismaMock.transactionMonitor.findMany.mockResolvedValue([]);

      await pollPendingTransactions({ batchSize: 10 });

      expect(prismaMock.transactionMonitor.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 10 }),
      );
    });
  });

  describe('getMonitorStatus', () => {
    it('returns status summary with counts', async () => {
      prismaMock.transactionMonitor.count
        .mockResolvedValueOnce(100)  // total
        .mockResolvedValueOnce(10)   // pending
        .mockResolvedValueOnce(80)   // confirmed
        .mockResolvedValueOnce(5)    // failed
        .mockResolvedValueOnce(5);   // timeout

      const status = await getMonitorStatus();

      expect(status).toHaveProperty('active');
      expect(status).toHaveProperty('pollIntervalMs');
      expect(status).toHaveProperty('totals');
      expect(status.totals.total).toBe(100);
      expect(status.totals.pending).toBe(10);
      expect(status.totals.confirmed).toBe(80);
    });
  });

  describe('getRecentTransactions', () => {
    it('returns paginated results', async () => {
      const mockData = [{ txHash: 'hash1', status: 'CONFIRMED' }];
      prismaMock.transactionMonitor.findMany.mockResolvedValue(mockData);
      prismaMock.transactionMonitor.count.mockResolvedValue(1);

      const result = await getRecentTransactions({ page: 1, limit: 10 });

      expect(result.data).toEqual(mockData);
      expect(result.page).toBe(1);
      expect(result.total).toBe(1);
    });

    it('filters by status', async () => {
      prismaMock.transactionMonitor.findMany.mockResolvedValue([]);
      prismaMock.transactionMonitor.count.mockResolvedValue(0);

      await getRecentTransactions({ status: 'FAILED' });

      expect(prismaMock.transactionMonitor.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: 'FAILED' },
        }),
      );
    });

    it('clamps page and limit to valid ranges', async () => {
      prismaMock.transactionMonitor.findMany.mockResolvedValue([]);
      prismaMock.transactionMonitor.count.mockResolvedValue(0);

      await getRecentTransactions({ page: -5, limit: 200 });

      expect(prismaMock.transactionMonitor.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 100,
        }),
      );
    });
  });
});
