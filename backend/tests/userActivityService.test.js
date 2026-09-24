import { jest } from '@jest/globals';
import prisma from '../lib/prisma.js';
import {
  recordActivity,
  getUserActivity,
  purgeExpiredActivity,
} from '../services/userActivityService.js';

jest.mock('../lib/prisma.js');

describe('userActivityService - bounded retention', () => {
  let mockAuditLog;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAuditLog = {
      create: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    };
    prisma.auditLog = mockAuditLog;
  });

  describe('recordActivity', () => {
    it('creates an audit log entry with all fields', async () => {
      const params = {
        actor: 'G123456789',
        category: 'AUTH',
        action: 'login',
        resourceId: 'resource1',
        escrowId: 12345n,
        metadata: { device: 'mobile' },
        ipAddress: '192.168.1.1',
        tenantId: 'tenant1',
      };

      await recordActivity(params);

      expect(mockAuditLog.create).toHaveBeenCalledWith({
        data: {
          tenantId: 'tenant1',
          category: 'AUTH',
          action: 'login',
          actor: 'G123456789',
          resourceId: 'resource1',
          escrowId: 12345n,
          metadata: { device: 'mobile' },
          ipAddress: '192.168.1.1',
        },
      });
    });

    it('creates an audit log entry with minimal fields', async () => {
      const params = {
        actor: 'G123456789',
        category: 'ESCROW',
        action: 'create',
        tenantId: 'tenant1',
      };

      await recordActivity(params);

      expect(mockAuditLog.create).toHaveBeenCalledWith({
        data: {
          tenantId: 'tenant1',
          category: 'ESCROW',
          action: 'create',
          actor: 'G123456789',
          resourceId: null,
          escrowId: null,
          metadata: undefined,
          ipAddress: null,
        },
      });
    });

    it('handles optional fields correctly', async () => {
      const params = {
        actor: 'G123456789',
        category: 'PAYMENT',
        action: 'send',
        tenantId: 'tenant1',
      };

      await recordActivity(params);

      expect(mockAuditLog.create).toHaveBeenCalled();
      const call = mockAuditLog.create.mock.calls[0][0];
      expect(call.data.resourceId).toBeNull();
      expect(call.data.escrowId).toBeNull();
      expect(call.data.ipAddress).toBeNull();
    });
  });

  describe('getUserActivity', () => {
    it('returns paginated activity entries for a user within retention window', async () => {
      const mockEntries = [
        {
          id: 1n,
          category: 'AUTH',
          action: 'login',
          resourceId: null,
          escrowId: null,
          metadata: {},
          ipAddress: '192.168.1.1',
          createdAt: new Date(),
        },
        {
          id: 2n,
          category: 'ESCROW',
          action: 'create',
          resourceId: 'esc1',
          escrowId: 100n,
          metadata: {},
          ipAddress: '192.168.1.1',
          createdAt: new Date(),
        },
      ];
      mockAuditLog.findMany.mockResolvedValue(mockEntries);
      mockAuditLog.count.mockResolvedValue(2);

      const result = await getUserActivity({ address: 'G123456789', tenantId: 'tenant1' });

      expect(result.entries.length).toBe(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.totalPages).toBe(1);
    });

    it('filters activity by category when provided', async () => {
      mockAuditLog.findMany.mockResolvedValue([]);
      mockAuditLog.count.mockResolvedValue(0);

      await getUserActivity({ address: 'G123456789', category: 'AUTH', tenantId: 'tenant1' });

      const call = mockAuditLog.findMany.mock.calls[0][0];
      expect(call.where.category).toBe('AUTH');
    });

    it('applies retention date filter to query', async () => {
      mockAuditLog.findMany.mockResolvedValue([]);
      mockAuditLog.count.mockResolvedValue(0);

      await getUserActivity({ address: 'G123456789', tenantId: 'tenant1' });

      const call = mockAuditLog.findMany.mock.calls[0][0];
      expect(call.where.createdAt).toHaveProperty('gte');
      expect(call.where.createdAt.gte).toBeInstanceOf(Date);
    });

    it('respects pagination parameters', async () => {
      mockAuditLog.findMany.mockResolvedValue([]);
      mockAuditLog.count.mockResolvedValue(50);

      await getUserActivity({ address: 'G123456789', page: 2, limit: 25, tenantId: 'tenant1' });

      const call = mockAuditLog.findMany.mock.calls[0][0];
      expect(call.skip).toBe(25);
      expect(call.take).toBe(25);
    });

    it('returns paginated results with correct page info', async () => {
      mockAuditLog.findMany.mockResolvedValue([]);
      mockAuditLog.count.mockResolvedValue(100);

      const result = await getUserActivity({
        address: 'G123456789',
        limit: 20,
        tenantId: 'tenant1',
      });

      expect(result.total).toBe(100);
      expect(result.totalPages).toBe(5);
    });

    it('converts escrowId to string in results', async () => {
      const mockEntries = [
        {
          id: 1n,
          category: 'ESCROW',
          action: 'create',
          resourceId: null,
          escrowId: 12345n,
          metadata: {},
          ipAddress: null,
          createdAt: new Date(),
        },
      ];
      mockAuditLog.findMany.mockResolvedValue(mockEntries);
      mockAuditLog.count.mockResolvedValue(1);

      const result = await getUserActivity({ address: 'G123456789', tenantId: 'tenant1' });

      expect(result.entries[0].escrowId).toBe('12345');
    });

    it('is tenant-scoped in query', async () => {
      mockAuditLog.findMany.mockResolvedValue([]);
      mockAuditLog.count.mockResolvedValue(0);

      await getUserActivity({ address: 'G123456789', tenantId: 'tenant1' });

      const findManyCall = mockAuditLog.findMany.mock.calls[0][0];
      const countCall = mockAuditLog.count.mock.calls[0][0];
      expect(findManyCall.where.tenantId).toBe('tenant1');
      expect(countCall.where.tenantId).toBe('tenant1');
    });
  });

  describe('purgeExpiredActivity', () => {
    it('deletes activity entries older than retention window', async () => {
      mockAuditLog.deleteMany.mockResolvedValue({ count: 50 });

      const result = await purgeExpiredActivity();

      expect(result).toBe(50);
      expect(mockAuditLog.deleteMany).toHaveBeenCalled();
    });

    it('uses createdAt field with lt operator for cutoff date', async () => {
      mockAuditLog.deleteMany.mockResolvedValue({ count: 0 });

      await purgeExpiredActivity();

      const call = mockAuditLog.deleteMany.mock.calls[0][0];
      expect(call.where.createdAt).toHaveProperty('lt');
      expect(call.where.createdAt.lt).toBeInstanceOf(Date);
    });

    it('logs deleted count for audit trail', async () => {
      mockAuditLog.deleteMany.mockResolvedValue({ count: 100 });

      const result = await purgeExpiredActivity();

      expect(result).toBe(100);
    });

    it('returns zero when no expired entries exist', async () => {
      mockAuditLog.deleteMany.mockResolvedValue({ count: 0 });

      const result = await purgeExpiredActivity();

      expect(result).toBe(0);
    });

    it('deletes entries globally across all tenants', async () => {
      mockAuditLog.deleteMany.mockResolvedValue({ count: 25 });

      await purgeExpiredActivity();

      const call = mockAuditLog.deleteMany.mock.calls[0][0];
      // The where clause should only check createdAt, not tenantId
      expect(Object.keys(call.where)).toEqual(['createdAt']);
    });

    it('handles large cleanup operations', async () => {
      mockAuditLog.deleteMany.mockResolvedValue({ count: 10000 });

      const result = await purgeExpiredActivity();

      expect(result).toBe(10000);
    });
  });
});
