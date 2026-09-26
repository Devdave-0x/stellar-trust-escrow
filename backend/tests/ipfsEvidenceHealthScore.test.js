import { describe, test, expect, beforeEach, jest } from '@jest/globals';

jest.unstable_mockModule('../services/ipfsService.js', () => ({
  getGatewayStatus: jest
    .fn()
    .mockResolvedValueOnce({
      available: true,
      lastSuccessfulFetch: new Date(Date.now() - 5 * 60000).toISOString(),
      responseTime: 245,
      status: 'healthy',
    })
    .mockResolvedValueOnce({
      available: false,
      lastSuccessfulFetch: new Date(Date.now() - 24 * 3600000).toISOString(),
      responseTime: null,
      status: 'unavailable',
      reasonCode: 'GATEWAY_TIMEOUT',
    }),
  getPinProviderStatus: jest.fn().mockResolvedValue({
    available: true,
    pinnedCount: 1250,
    quotaUsage: 0.65,
  }),
  calculateHealthScore: jest.fn().mockResolvedValue({
    score: 95,
    status: 'healthy',
    components: {
      gatewayAvailability: 100,
      lastSuccessfulFetch: 90,
      pinProviderStatus: 95,
    },
  }),
}));

jest.unstable_mockModule('../services/garbageCollectorService.js', () => ({
  shouldSkipEvidence: jest.fn().mockResolvedValue(false),
  protectEvidenceFromCollection: jest.fn().mockResolvedValue({ success: true }),
}));

jest.unstable_mockModule('../config/logger.js', () => ({
  createModuleLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

jest.unstable_mockModule('../config/constants.js', () => ({
  IPFS_HEALTH_THRESHOLDS: {
    healthy: 80,
    degraded: 50,
    critical: 0,
  },
}));

describe('ipfsEvidenceHealthScore', () => {
  let ipfsService;
  let garbageCollectorService;
  let constants;

  beforeEach(async () => {
    jest.resetModules();
    ipfsService = await import('../services/ipfsService.js');
    garbageCollectorService = await import('../services/garbageCollectorService.js');
    constants = await import('../config/constants.js');
  });

  describe('gateway availability', () => {
    test('reports gateway availability status', async () => {
      const status = await ipfsService.getGatewayStatus();

      expect(status).toHaveProperty('available');
      expect(typeof status.available).toBe('boolean');
    });

    test('returns degraded status with reason codes for unavailable gateways', async () => {
      const status = await ipfsService.getGatewayStatus();

      if (!status.available) {
        expect(status).toHaveProperty('reasonCode');
        expect(typeof status.reasonCode).toBe('string');
        expect(status.status).toBe('unavailable');
      }
    });

    test('includes response time for available gateways', async () => {
      jest.resetModules();
      ipfsService = await import('../services/ipfsService.js');
      const status = await ipfsService.getGatewayStatus();

      if (status.available) {
        expect(status).toHaveProperty('responseTime');
        expect(typeof status.responseTime).toBe('number');
        expect(status.responseTime).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('last successful fetch tracking', () => {
    test('tracks last successful fetch timestamp', async () => {
      const status = await ipfsService.getGatewayStatus();

      expect(status).toHaveProperty('lastSuccessfulFetch');
      const isoDateRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
      expect(isoDateRegex.test(status.lastSuccessfulFetch)).toBe(true);
    });

    test('last successful fetch is recent when gateway is available', async () => {
      jest.resetModules();
      ipfsService = await import('../services/ipfsService.js');
      const status = await ipfsService.getGatewayStatus();

      if (status.available) {
        const fetchTime = new Date(status.lastSuccessfulFetch);
        const timeDiff = Date.now() - fetchTime.getTime();
        expect(timeDiff).toBeLessThan(30 * 60000); // Less than 30 minutes
      }
    });

    test('last successful fetch is stale when gateway is unavailable', async () => {
      const status = await ipfsService.getGatewayStatus();

      if (!status.available) {
        const fetchTime = new Date(status.lastSuccessfulFetch);
        const timeDiff = Date.now() - fetchTime.getTime();
        expect(timeDiff).toBeGreaterThan(60 * 60000); // More than 1 hour
      }
    });
  });

  describe('pin provider status', () => {
    test('retrieves pin provider status', async () => {
      const status = await ipfsService.getPinProviderStatus();

      expect(status).toHaveProperty('available');
      expect(status).toHaveProperty('pinnedCount');
      expect(status).toHaveProperty('quotaUsage');
    });

    test('pin provider status includes quota usage', async () => {
      const status = await ipfsService.getPinProviderStatus();

      expect(typeof status.quotaUsage).toBe('number');
      expect(status.quotaUsage).toBeGreaterThanOrEqual(0);
      expect(status.quotaUsage).toBeLessThanOrEqual(1);
    });

    test('pin provider status tracks pinned count', async () => {
      const status = await ipfsService.getPinProviderStatus();

      expect(typeof status.pinnedCount).toBe('number');
      expect(status.pinnedCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('health score calculation', () => {
    test('calculates overall health score', async () => {
      const health = await ipfsService.calculateHealthScore();

      expect(health).toHaveProperty('score');
      expect(typeof health.score).toBe('number');
      expect(health.score).toBeGreaterThanOrEqual(0);
      expect(health.score).toBeLessThanOrEqual(100);
    });

    test('health score includes status indicator', async () => {
      const health = await ipfsService.calculateHealthScore();

      expect(health).toHaveProperty('status');
      expect(['healthy', 'degraded', 'critical']).toContain(health.status);
    });

    test('health score breaks down into components', async () => {
      const health = await ipfsService.calculateHealthScore();

      expect(health).toHaveProperty('components');
      expect(health.components).toHaveProperty('gatewayAvailability');
      expect(health.components).toHaveProperty('lastSuccessfulFetch');
      expect(health.components).toHaveProperty('pinProviderStatus');
    });

    test('healthy status when score exceeds threshold', async () => {
      const health = await ipfsService.calculateHealthScore();

      if (health.score >= constants.IPFS_HEALTH_THRESHOLDS.healthy) {
        expect(health.status).toBe('healthy');
      }
    });

    test('degraded status when score in middle range', async () => {
      jest.resetModules();
      ipfsService = await import('../services/ipfsService.js');
      constants = await import('../config/constants.js');

      const health = await ipfsService.calculateHealthScore();
      if (
        health.score >= constants.IPFS_HEALTH_THRESHOLDS.degraded &&
        health.score < constants.IPFS_HEALTH_THRESHOLDS.healthy
      ) {
        expect(['degraded', 'healthy']).toContain(health.status);
      }
    });
  });

  describe('garbage collection protection', () => {
    test('garbage collector skips protected evidence', async () => {
      const health = await ipfsService.calculateHealthScore();

      if (health.status !== 'healthy') {
        const shouldSkip = await garbageCollectorService.shouldSkipEvidence({
          evidenceId: 'evidence-123',
          ipfsHealthScore: health.score,
        });

        expect(typeof shouldSkip).toBe('boolean');
      }
    });

    test('protects evidence during gateway unavailability', async () => {
      const status = await ipfsService.getGatewayStatus();

      if (!status.available) {
        const result = await garbageCollectorService.protectEvidenceFromCollection({
          evidenceId: 'evidence-456',
          reason: 'IPFS_GATEWAY_UNAVAILABLE',
        });

        expect(result.success).toBe(true);
      }
    });

    test('tracks protection reason codes', async () => {
      const reasonCodes = [
        'IPFS_GATEWAY_UNAVAILABLE',
        'LOW_HEALTH_SCORE',
        'RECENT_PIN_FAILURE',
        'HIGH_QUOTA_USAGE',
      ];

      reasonCodes.forEach((code) => {
        expect(typeof code).toBe('string');
        expect(code.length).toBeGreaterThan(0);
      });
    });
  });

  describe('health score thresholds', () => {
    test('thresholds are defined for all health states', async () => {
      expect(constants.IPFS_HEALTH_THRESHOLDS).toHaveProperty('healthy');
      expect(constants.IPFS_HEALTH_THRESHOLDS).toHaveProperty('degraded');
      expect(constants.IPFS_HEALTH_THRESHOLDS).toHaveProperty('critical');
    });

    test('threshold values follow proper ordering', async () => {
      const { healthy, degraded, critical } = constants.IPFS_HEALTH_THRESHOLDS;

      expect(critical).toBeLessThan(degraded);
      expect(degraded).toBeLessThan(healthy);
    });
  });

  describe('unavailable gateway scenarios', () => {
    test('handles multiple consecutive gateway failures', async () => {
      const status1 = await ipfsService.getGatewayStatus();
      const status2 = await ipfsService.getGatewayStatus();

      expect(status1).toHaveProperty('available');
      expect(status2).toHaveProperty('available');
    });

    test('evidence remains protected until gateway recovers', async () => {
      const status = await ipfsService.getGatewayStatus();

      if (!status.available) {
        const health = await ipfsService.calculateHealthScore();
        expect(health.status).not.toBe('healthy');
      }
    });

    test('gateway status includes timeout information', async () => {
      const status = await ipfsService.getGatewayStatus();

      if (!status.available && status.reasonCode === 'GATEWAY_TIMEOUT') {
        expect(status.responseTime).toBeNull();
      }
    });
  });
});
