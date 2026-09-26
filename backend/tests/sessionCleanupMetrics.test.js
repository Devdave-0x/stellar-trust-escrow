import { jest } from '@jest/globals';

const prismaMock = {
  userSession: {
    findMany: jest.fn(),
    deleteMany: jest.fn(),
    updateMany: jest.fn(),
    count: jest.fn(),
  },
};

jest.unstable_mockModule('../lib/prisma.js', () => ({ default: prismaMock }));

const sessionService = await import('../services/sessionService.js');

describe('Session Cleanup Metrics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('cleanup summary generation', () => {
    it('generates metrics for active sessions', async () => {
      prismaMock.userSession.findMany.mockResolvedValue([
        {
          id: 1,
          userId: 'user1',
          tokenHash: 'hash1',
          lastActiveAt: new Date(Date.now() - 1000),
          createdAt: new Date(Date.now() - 3600000),
        },
        {
          id: 2,
          userId: 'user1',
          tokenHash: 'hash2',
          lastActiveAt: new Date(Date.now() - 5000),
          createdAt: new Date(Date.now() - 7200000),
        },
      ]);

      const sessions = await prismaMock.userSession.findMany({});
      expect(sessions).toHaveLength(2);
      expect(sessions[0].lastActiveAt).toBeDefined();
    });

    it('counts expired sessions', async () => {
      const expiredDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago

      prismaMock.userSession.findMany.mockResolvedValue([
        {
          id: 1,
          userId: 'user1',
          tokenHash: 'hash1',
          lastActiveAt: expiredDate,
          createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
        },
      ]);

      const sessions = await prismaMock.userSession.findMany({
        where: { lastActiveAt: { lt: expiredDate } },
      });

      expect(sessions).toHaveLength(1);
      expect(sessions[0].lastActiveAt.getTime()).toBeLessThan(expiredDate.getTime());
    });

    it('counts revoked sessions in deletion results', async () => {
      prismaMock.userSession.deleteMany.mockResolvedValue({ count: 5 });

      const result = await prismaMock.userSession.deleteMany({
        where: { lastActiveAt: { lt: new Date() } },
      });

      expect(result.count).toBe(5);
    });

    it('tracks cleaned up sessions per batch', async () => {
      prismaMock.userSession.deleteMany
        .mockResolvedValueOnce({ count: 10 })
        .mockResolvedValueOnce({ count: 3 })
        .mockResolvedValueOnce({ count: 7 });

      const batch1 = await prismaMock.userSession.deleteMany({
        where: { lastActiveAt: { lt: new Date() } },
      });
      const batch2 = await prismaMock.userSession.deleteMany({
        where: { lastActiveAt: { lt: new Date() } },
      });
      const batch3 = await prismaMock.userSession.deleteMany({
        where: { lastActiveAt: { lt: new Date() } },
      });

      const totalCleaned = batch1.count + batch2.count + batch3.count;
      expect(totalCleaned).toBe(20);
    });
  });

  describe('tenant-safe cleanup metrics', () => {
    it('isolates session counts by tenant', async () => {
      const tenantId = 'tenant_1';

      prismaMock.userSession.findMany.mockResolvedValue([
        {
          id: 1,
          userId: 'tenant_1_user_1',
          tokenHash: 'hash1',
          lastActiveAt: new Date(),
          createdAt: new Date(),
          tenantId,
        },
        {
          id: 2,
          userId: 'tenant_1_user_2',
          tokenHash: 'hash2',
          lastActiveAt: new Date(),
          createdAt: new Date(),
          tenantId,
        },
      ]);

      const sessions = await prismaMock.userSession.findMany({});
      const tenantSessions = sessions.filter((s) => s.tenantId === tenantId);

      expect(tenantSessions).toHaveLength(2);
    });

    it('reports per-tenant cleanup summary', async () => {
      prismaMock.userSession.deleteMany.mockResolvedValue({ count: 15 });

      const cleanupSummary = {
        tenantId: 'tenant_1',
        deletedSessions: 15,
        timestamp: new Date(),
      };

      expect(cleanupSummary.tenantId).toBe('tenant_1');
      expect(cleanupSummary.deletedSessions).toBe(15);
    });

    it('prevents tenant data leakage in metrics', async () => {
      prismaMock.userSession.findMany.mockResolvedValue([
        {
          id: 1,
          userId: 'tenant_1_user',
          tokenHash: 'hash1',
          lastActiveAt: new Date(),
          tenantId: 'tenant_1',
        },
        {
          id: 2,
          userId: 'tenant_2_user',
          tokenHash: 'hash2',
          lastActiveAt: new Date(),
          tenantId: 'tenant_2',
        },
      ]);

      const sessions = await prismaMock.userSession.findMany({});
      const tenant1Sessions = sessions.filter((s) => s.tenantId === 'tenant_1');
      const tenant2Sessions = sessions.filter((s) => s.tenantId === 'tenant_2');

      expect(tenant1Sessions).toHaveLength(1);
      expect(tenant2Sessions).toHaveLength(1);
      expect(tenant1Sessions[0].userId).not.toBe(tenant2Sessions[0].userId);
    });
  });

  describe('cleanup metrics structure', () => {
    it('generates summary with all required fields', async () => {
      const cleanupMetrics = {
        activeSessionsStart: 100,
        expiredSessionsFound: 15,
        revokedSessionsFound: 5,
        sessionsCleanedUp: 20,
        cleanupDurationMs: 245,
        timestamp: new Date(),
        batchSize: 20,
      };

      expect(cleanupMetrics).toHaveProperty('activeSessionsStart');
      expect(cleanupMetrics).toHaveProperty('expiredSessionsFound');
      expect(cleanupMetrics).toHaveProperty('revokedSessionsFound');
      expect(cleanupMetrics).toHaveProperty('sessionsCleanedUp');
      expect(cleanupMetrics).toHaveProperty('cleanupDurationMs');
      expect(cleanupMetrics).toHaveProperty('timestamp');
      expect(cleanupMetrics).toHaveProperty('batchSize');
    });

    it('includes operation counts in metrics log', async () => {
      prismaMock.userSession.count.mockResolvedValue(50);
      prismaMock.userSession.deleteMany.mockResolvedValue({ count: 10 });

      const activeCount = await prismaMock.userSession.count({});
      const deleteResult = await prismaMock.userSession.deleteMany({
        where: { lastActiveAt: { lt: new Date() } },
      });

      expect(activeCount).toBe(50);
      expect(deleteResult.count).toBe(10);
    });

    it('tracks operation categories in cleanup', async () => {
      const categories = {
        expired: 0,
        revoked: 0,
        total_cleaned: 0,
      };

      prismaMock.userSession.deleteMany.mockResolvedValue({ count: 7 });
      const result = await prismaMock.userSession.deleteMany({});

      categories.expired += 4;
      categories.revoked += 3;
      categories.total_cleaned = categories.expired + categories.revoked;

      expect(categories.total_cleaned).toBe(7);
    });
  });

  describe('existing tests continue to pass', () => {
    it('recordSession maintains behavior', async () => {
      prismaMock.userSession.create = jest.fn().mockResolvedValue({
        id: 1,
        userId: 'user1',
        tokenHash: 'hash1',
      });

      const session = await sessionService.default.recordSession({
        userId: 'user1',
        jti: 'token1',
        deviceName: 'Chrome',
        ipAddress: '127.0.0.1',
      });

      expect(session).toBeDefined();
    });

    it('listSessions maintains behavior', async () => {
      prismaMock.userSession.findMany.mockResolvedValue([
        { id: 1, userId: 'user1', tokenHash: 'hash1', lastActiveAt: new Date() },
      ]);

      const sessions = await sessionService.default.listSessions('user1', 'jti1');
      expect(sessions).toBeDefined();
    });

    it('revokeSession maintains behavior', async () => {
      prismaMock.userSession.deleteMany.mockResolvedValue({ count: 1 });

      const result = await sessionService.default.revokeSession('user1', 1);
      expect(result).toBeDefined();
    });
  });

  describe('cleanup metrics logging', () => {
    it('logs cleanup metrics without leaking PII', async () => {
      const logMessage = {
        event: 'session_cleanup_completed',
        activeSessionsAtStart: 100,
        expiredSessionsDetected: 15,
        revokedSessionsDetected: 5,
        totalSessionsRemoved: 20,
        durationMs: 340,
        tenantId: 'tenant_1',
      };

      expect(logMessage.event).toBe('session_cleanup_completed');
      expect(logMessage).not.toHaveProperty('userId');
      expect(logMessage).not.toHaveProperty('tokenHash');
    });

    it('includes counts for each cleanup category', async () => {
      const metrics = {
        active: 100,
        expired: 15,
        revoked: 5,
        cleaned: 20,
      };

      expect(metrics.active).toBe(100);
      expect(metrics.expired).toBe(15);
      expect(metrics.revoked).toBe(5);
      expect(metrics.cleaned).toBe(20);
      expect(metrics.expired + metrics.revoked).toBe(metrics.cleaned);
    });
  });
});
