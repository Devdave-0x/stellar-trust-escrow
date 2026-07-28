/**
 * Expiry Service Tests
 *
 * Covers:
 *   - Finding expired escrows
 *   - Expiring a single escrow
 *   - Processing a batch of expired escrows
 *   - Handling already-cancelled escrows gracefully
 *   - Handling escrows not yet past deadline
 *   - Status reporting
 */

import { jest } from '@jest/globals';

const prismaMock = {
  $transaction: jest.fn(async (fn) => fn(prismaMock)),
  escrow: {
    findMany: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  adminAuditLog: {
    create: jest.fn(),
  },
  auditLog: {
    create: jest.fn(),
  },
};

jest.unstable_mockModule('../lib/prisma.js', () => ({ default: prismaMock }));
jest.unstable_mockModule('../lib/transaction.js', () => ({
  withTransaction: jest.fn(async (fn) => fn(prismaMock)),
}));
jest.unstable_mockModule('../config/logger.js', () => ({
  createModuleLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

const {
  findExpiredEscrows,
  expireEscrow,
  processExpiredEscrows,
  getExpiryStatus,
  stopExpiryJob,
} = await import('../services/expiryService.js');

afterEach(() => {
  jest.clearAllMocks();
  stopExpiryJob();
});

describe('expiryService', () => {
  const now = new Date();
  const pastDate = new Date(now.getTime() - 86_400_000); // 1 day ago
  const futureDate = new Date(now.getTime() + 86_400_000);

  const expiredEscrow = {
    id: 1001n,
    clientAddress: 'GCLIENT1...',
    freelancerAddress: 'GFREELANCER1...',
    totalAmount: '1000',
    remainingBalance: '500',
    deadline: pastDate,
    createdAt: new Date(now.getTime() - 7 * 86_400_000),
  };

  const activeEscrow = {
    id: 1002n,
    clientAddress: 'GCLIENT2...',
    freelancerAddress: 'GFREELANCER2...',
    totalAmount: '2000',
    remainingBalance: '2000',
    deadline: futureDate,
    createdAt: new Date(now.getTime() - 3 * 86_400_000),
  };

  describe('findExpiredEscrows', () => {
    it('returns Active escrows past their deadline', async () => {
      prismaMock.escrow.findMany.mockResolvedValue([expiredEscrow]);

      const result = await findExpiredEscrows({ batchSize: 50, tx: prismaMock });

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(1001n);
      expect(prismaMock.escrow.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'Active',
            deadline: { lt: expect.any(Date) },
          }),
        }),
      );
    });

    it('returns empty array when no escrows are expired', async () => {
      prismaMock.escrow.findMany.mockResolvedValue([]);

      const result = await findExpiredEscrows({ batchSize: 50, tx: prismaMock });

      expect(result).toHaveLength(0);
    });

    it('respects batchSize parameter', async () => {
      prismaMock.escrow.findMany.mockResolvedValue([]);

      await findExpiredEscrows({ batchSize: 10, tx: prismaMock });

      expect(prismaMock.escrow.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 10 }),
      );
    });
  });

  describe('expireEscrow', () => {
    it('transitions an Active expired escrow to Cancelled', async () => {
      prismaMock.escrow.findUniqueOrThrow.mockResolvedValue({
        status: 'Active',
        deadline: pastDate,
        remainingBalance: '500',
      });
      prismaMock.escrow.update.mockResolvedValue({ id: 1001n, status: 'Cancelled' });
      prismaMock.adminAuditLog.create.mockResolvedValue({});
      prismaMock.auditLog.create.mockResolvedValue({});

      const result = await expireEscrow(expiredEscrow, 'system');

      expect(result).not.toBeNull();
      expect(prismaMock.escrow.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1001n },
          data: expect.objectContaining({ status: 'Cancelled' }),
        }),
      );
      expect(prismaMock.adminAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'ESCROW_EXPIRED',
            targetAddress: 'GCLIENT1...',
          }),
        }),
      );
      expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            category: 'ESCROW',
            action: 'CANCEL_ESCROW',
          }),
        }),
      );
    });

    it('returns null for escrow that is already Cancelled', async () => {
      prismaMock.escrow.findUniqueOrThrow.mockResolvedValue({
        status: 'Cancelled',
        deadline: pastDate,
        remainingBalance: '500',
      });

      const result = await expireEscrow(expiredEscrow, 'system');

      expect(result).toBeNull();
      expect(prismaMock.escrow.update).not.toHaveBeenCalled();
    });

    it('returns null for escrow that is already Completed', async () => {
      prismaMock.escrow.findUniqueOrThrow.mockResolvedValue({
        status: 'Completed',
        deadline: pastDate,
        remainingBalance: '0',
      });

      const result = await expireEscrow(expiredEscrow, 'system');

      expect(result).toBeNull();
      expect(prismaMock.escrow.update).not.toHaveBeenCalled();
    });

    it('returns null for escrow not yet past deadline', async () => {
      prismaMock.escrow.findUniqueOrThrow.mockResolvedValue({
        status: 'Active',
        deadline: futureDate,
        remainingBalance: '2000',
      });

      const result = await expireEscrow(activeEscrow, 'system');

      expect(result).toBeNull();
      expect(prismaMock.escrow.update).not.toHaveBeenCalled();
    });

    it('returns null for escrow with no deadline set', async () => {
      prismaMock.escrow.findUniqueOrThrow.mockResolvedValue({
        status: 'Active',
        deadline: null,
        remainingBalance: '1000',
      });

      const result = await expireEscrow({ ...expiredEscrow, deadline: null }, 'system');

      expect(result).toBeNull();
      expect(prismaMock.escrow.update).not.toHaveBeenCalled();
    });
  });

  describe('processExpiredEscrows', () => {
    it('processes multiple expired escrows in a batch', async () => {
      const escrow1 = { ...expiredEscrow, id: 1001n };
      const escrow2 = { ...expiredEscrow, id: 1002n };
      prismaMock.escrow.findMany.mockResolvedValue([escrow1, escrow2]);
      prismaMock.escrow.findUniqueOrThrow.mockResolvedValue({
        status: 'Active',
        deadline: pastDate,
        remainingBalance: '500',
      });
      prismaMock.escrow.update.mockResolvedValue({});
      prismaMock.adminAuditLog.create.mockResolvedValue({});
      prismaMock.auditLog.create.mockResolvedValue({});

      const results = await processExpiredEscrows({ batchSize: 50, actor: 'test' });

      expect(results.processed).toBe(2);
      expect(results.succeeded).toBe(2);
      expect(results.failed).toBe(0);
      expect(results.errors).toHaveLength(0);
    });

    it('returns zero results when no escrows are expired', async () => {
      prismaMock.escrow.findMany.mockResolvedValue([]);

      const results = await processExpiredEscrows();

      expect(results.processed).toBe(0);
      expect(results.succeeded).toBe(0);
      expect(results.failed).toBe(0);
    });

    it('handles individual expiry failures without crashing', async () => {
      const escrow1 = { ...expiredEscrow, id: 1001n };
      const escrow2 = { ...expiredEscrow, id: 1002n };
      prismaMock.escrow.findMany.mockResolvedValue([escrow1, escrow2]);

      let callCount = 0;
      prismaMock.escrow.findUniqueOrThrow.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error('DB connection lost');
        }
        return { status: 'Active', deadline: pastDate, remainingBalance: '500' };
      });
      prismaMock.escrow.update.mockResolvedValue({});
      prismaMock.adminAuditLog.create.mockResolvedValue({});
      prismaMock.auditLog.create.mockResolvedValue({});

      const results = await processExpiredEscrows({ batchSize: 50 });

      expect(results.processed).toBe(2);
      expect(results.succeeded).toBe(1);
      expect(results.failed).toBe(1);
      expect(results.errors).toHaveLength(1);
      expect(results.errors[0]).toContain('1001');
    });

    it('skips escrows that transition between find and expire', async () => {
      const escrow1 = { ...expiredEscrow, id: 1001n };
      prismaMock.escrow.findMany.mockResolvedValue([escrow1]);
      prismaMock.escrow.findUniqueOrThrow.mockResolvedValue({
        status: 'Completed',
        deadline: pastDate,
        remainingBalance: '0',
      });

      const results = await processExpiredEscrows({ batchSize: 50 });

      expect(results.processed).toBe(1);
      expect(results.succeeded).toBe(0);
      expect(results.skipped).toBe(1);
      expect(results.failed).toBe(0);
    });
  });

  describe('getExpiryStatus', () => {
    it('returns default status when job is not running', () => {
      const status = getExpiryStatus();

      expect(status).toHaveProperty('active');
      expect(status).toHaveProperty('pollIntervalMs');
      expect(status).toHaveProperty('lastRunAt');
    });

    it('shows active=true when job is started', async () => {
      const { startExpiryJob } = await import('../services/expiryService.js');
      prismaMock.escrow.findMany.mockResolvedValue([]);
      prismaMock.escrow.findUniqueOrThrow.mockResolvedValue({});

      startExpiryJob({ pollIntervalMs: 60000 });
      const status = getExpiryStatus();

      expect(status.active).toBe(true);

      stopExpiryJob();
    });
  });
});
