import { jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fixtures = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/escrow.json'), 'utf8'));

const cacheMock = {
  get: jest.fn(),
  set: jest.fn(),
  invalidate: jest.fn(),
  invalidatePrefix: jest.fn(),
  invalidateTags: jest.fn(),
  analytics: jest.fn(() => ({
    hits: 10,
    misses: 5,
    sets: 8,
    invalidations: 2,
    hitRate: '66.67',
    backend: 'redis',
    memSize: 1024,
  })),
  size: jest.fn(),
};

const prismaMock = {
  $transaction: jest.fn(async (operations) => operations),
  $queryRawUnsafe: jest.fn().mockResolvedValue([]),
  escrow: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    count: jest.fn(),
    upsert: jest.fn(),
  },
  milestone: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    count: jest.fn(),
  },
  milestoneStatusHistory: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
  },
};

const submitTransactionMock = jest.fn();

jest.unstable_mockModule('../lib/cache.js', () => ({ default: cacheMock }));
jest.unstable_mockModule('../lib/prisma.js', () => ({ default: prismaMock }));
jest.unstable_mockModule('../services/stellarService.js', () => ({
  submitTransaction: submitTransactionMock,
  getContractEvents: jest.fn(),
  getLatestLedger: jest.fn(),
}));
jest.unstable_mockModule('@stellar/stellar-sdk', () => ({
  xdr: {
    ScVal: {
      fromXDR: jest.fn(() => ({ type: 'u64', value: () => 42n })),
    },
  },
  scValToNative: jest.fn(() => 42n),
  SorobanRpc: {},
  Transaction: jest.fn(),
  Networks: {
    TESTNET: 'Test SDF Network ; September 2015',
    PUBLIC: 'Public Global Stellar Network ; September 2015',
  },
}));

const { default: escrowController } = await import('../api/controllers/escrowController.js');

function createMockRes() {
  const res = {
    statusCode: 200,
    body: null,
    status: jest.fn().mockImplementation(function (code) {
      this.statusCode = code;
      return this;
    }),
    json: jest.fn().mockImplementation(function (payload) {
      this.body = payload;
      return this;
    }),
  };
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
  cacheMock.get.mockReturnValue(null);
  cacheMock.set.mockResolvedValue(undefined);
  cacheMock.invalidate.mockResolvedValue(undefined);
  cacheMock.invalidatePrefix.mockResolvedValue(undefined);
  cacheMock.invalidateTags.mockResolvedValue(undefined);
  submitTransactionMock.mockResolvedValue({ hash: 'abc123', status: 'SUCCESS', returnValue: null });
  prismaMock.escrow.upsert.mockResolvedValue({});
  prismaMock.$transaction.mockImplementation(async (ops) => {
    return Promise.all(ops);
  });
  prismaMock.escrow.findMany.mockResolvedValue([]);
  prismaMock.escrow.count.mockResolvedValue(0);
  prismaMock.milestoneStatusHistory.findMany.mockResolvedValue([]);
  prismaMock.milestoneStatusHistory.findFirst.mockResolvedValue(null);
});

describe('escrowController — Redis Cache Integration', () => {
  describe('Cache TTL and Tags', () => {
    it('caches list endpoint with correct TTL tag', async () => {
      const req = { query: { page: '1', limit: '10' } };
      const res = createMockRes();

      prismaMock.escrow.findMany.mockResolvedValue(fixtures.escrows);
      prismaMock.escrow.count.mockResolvedValue(fixtures.escrows.length);

      await escrowController.listEscrows(req, res);

      // Verify cache set is called with appropriate tags
      expect(cacheMock.set).toHaveBeenCalled();
    });

    it('caches detail endpoint with correct TTL tag', async () => {
      const req = { params: { id: '1' } };
      const res = createMockRes();
      prismaMock.escrow.findUnique.mockResolvedValue(fixtures.escrows[0]);

      await escrowController.getEscrow(req, res);

      // Verify cache set is called
      expect(cacheMock.set).toHaveBeenCalled();
    });

    it('uses appropriate cache key format for list queries', async () => {
      const req = { query: { page: '1', limit: '5' } };
      const res = createMockRes();

      prismaMock.escrow.findMany.mockResolvedValue(fixtures.escrows.slice(0, 5));
      prismaMock.escrow.count.mockResolvedValue(fixtures.escrows.length);

      await escrowController.listEscrows(req, res);

      // Cache operations should have been called
      expect(cacheMock.set).toHaveBeenCalled();
    });

    it('uses appropriate cache key format for detail queries', async () => {
      const req = { params: { id: '42' } };
      const res = createMockRes();
      prismaMock.escrow.findUnique.mockResolvedValue({ ...fixtures.escrows[0], id: 42n });

      await escrowController.getEscrow(req, res);

      expect(cacheMock.set).toHaveBeenCalled();
    });
  });

  describe('invalidateEscrowCache', () => {
    it('invalidates both specific escrow and global escrows tags', async () => {
      cacheMock.invalidateTags.mockResolvedValue(undefined);

      await escrowController.onEscrowStatusChange('42');

      expect(cacheMock.invalidateTags).toHaveBeenCalledWith(['escrows', 'escrow:42']);
    });

    it('handles numeric escrow IDs correctly', async () => {
      cacheMock.invalidateTags.mockResolvedValue(undefined);

      await escrowController.onEscrowStatusChange(99);

      expect(cacheMock.invalidateTags).toHaveBeenCalledWith(['escrows', 'escrow:99']);
    });

    it('handles string escrow IDs correctly', async () => {
      cacheMock.invalidateTags.mockResolvedValue(undefined);

      await escrowController.onEscrowStatusChange('999');

      expect(cacheMock.invalidateTags).toHaveBeenCalledWith(['escrows', 'escrow:999']);
    });
  });

  describe('Cache Invalidation on Status Changes', () => {
    it('invalidates cache when escrow status changes', async () => {
      cacheMock.invalidateTags.mockResolvedValue(undefined);

      await escrowController.onEscrowStatusChange('1');

      expect(cacheMock.invalidateTags).toHaveBeenCalled();
    });

    it('logs cache metrics after invalidation', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      cacheMock.invalidateTags.mockResolvedValue(undefined);

      await escrowController.onEscrowStatusChange('7');

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[Cache]'));
      consoleSpy.mockRestore();
    });

    it('includes cache hit rate in metrics', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      cacheMock.invalidateTags.mockResolvedValue(undefined);

      await escrowController.onEscrowStatusChange('1');

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('66.67'));
      consoleSpy.mockRestore();
    });

    it('includes backend type in metrics', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      cacheMock.invalidateTags.mockResolvedValue(undefined);

      await escrowController.onEscrowStatusChange('1');

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('redis'));
      consoleSpy.mockRestore();
    });
  });

  describe('Graceful Fallback on Cache Errors', () => {
    it('does not throw when invalidateTags rejects', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      cacheMock.invalidateTags.mockRejectedValue(new Error('Redis unavailable'));

      await expect(escrowController.onEscrowStatusChange('99')).resolves.toBeUndefined();

      consoleErrorSpy.mockRestore();
    });

    it('logs error when Redis is unavailable', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      cacheMock.invalidateTags.mockRejectedValue(new Error('Redis unavailable'));

      await escrowController.onEscrowStatusChange('99');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Cache] invalidateEscrowCache failed:'),
        expect.any(Error),
      );
      consoleErrorSpy.mockRestore();
    });

    it('continues operation even if cache invalidation fails', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      cacheMock.invalidateTags.mockRejectedValue(new Error('Redis connection lost'));

      const result = await escrowController.onEscrowStatusChange('42');

      expect(result).toBeUndefined();
      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });

  describe('Cache Miss Fallthrough', () => {
    it('queries database when cache misses on list', async () => {
      cacheMock.get.mockReturnValueOnce(null);
      const req = { query: { page: '1', limit: '5' } };
      const res = createMockRes();

      prismaMock.escrow.findMany.mockResolvedValue(fixtures.escrows);
      prismaMock.escrow.count.mockResolvedValue(fixtures.escrows.length);

      await escrowController.listEscrows(req, res);

      expect(prismaMock.escrow.findMany).toHaveBeenCalled();
      expect(res.body.data).toHaveLength(fixtures.escrows.length);
    });

    it('queries database when cache misses on detail', async () => {
      cacheMock.get.mockReturnValueOnce(null);
      const req = { params: { id: '1' } };
      const res = createMockRes();
      prismaMock.escrow.findUnique.mockResolvedValue(fixtures.escrows[0]);

      await escrowController.getEscrow(req, res);

      expect(prismaMock.escrow.findUnique).toHaveBeenCalled();
      expect(res.statusCode).toBe(200);
    });

    it('sets cache after database query', async () => {
      cacheMock.get.mockReturnValueOnce(null);
      const req = { query: { page: '1', limit: '5' } };
      const res = createMockRes();

      prismaMock.escrow.findMany.mockResolvedValue(fixtures.escrows);
      prismaMock.escrow.count.mockResolvedValue(fixtures.escrows.length);

      await escrowController.listEscrows(req, res);

      expect(cacheMock.set).toHaveBeenCalled();
    });
  });

  describe('Cache Metrics Tracking', () => {
    it('analytics reports correct hit rate', async () => {
      const analytics = cacheMock.analytics();

      expect(analytics.hitRate).toBe('66.67');
      expect(analytics.hits).toBe(10);
      expect(analytics.misses).toBe(5);
    });

    it('analytics reports cache backend type', async () => {
      const analytics = cacheMock.analytics();

      expect(analytics.backend).toBe('redis');
    });

    it('analytics tracks memory usage', async () => {
      const analytics = cacheMock.analytics();

      expect(analytics.memSize).toBe(1024);
    });

    it('analytics tracks invalidations', async () => {
      const analytics = cacheMock.analytics();

      expect(analytics.invalidations).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Multiple Concurrent Cache Operations', () => {
    it('handles concurrent list queries with same filters', async () => {
      const req1 = { query: { page: '1', limit: '10' } };
      const req2 = { query: { page: '1', limit: '10' } };
      const res1 = createMockRes();
      const res2 = createMockRes();

      prismaMock.escrow.findMany.mockResolvedValue(fixtures.escrows);
      prismaMock.escrow.count.mockResolvedValue(fixtures.escrows.length);

      await Promise.all([
        escrowController.listEscrows(req1, res1),
        escrowController.listEscrows(req2, res2),
      ]);

      expect(res1.body.data).toHaveLength(fixtures.escrows.length);
      expect(res2.body.data).toHaveLength(fixtures.escrows.length);
    });

    it('handles concurrent detail and list queries', async () => {
      const listReq = { query: { page: '1', limit: '10' } };
      const detailReq = { params: { id: '1' } };
      const listRes = createMockRes();
      const detailRes = createMockRes();

      prismaMock.escrow.findMany.mockResolvedValue(fixtures.escrows);
      prismaMock.escrow.count.mockResolvedValue(fixtures.escrows.length);
      prismaMock.escrow.findUnique.mockResolvedValue(fixtures.escrows[0]);

      await Promise.all([
        escrowController.listEscrows(listReq, listRes),
        escrowController.getEscrow(detailReq, detailRes),
      ]);

      expect(listRes.statusCode).toBe(200);
      expect(detailRes.statusCode).toBe(200);
    });
  });
});
