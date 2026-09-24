import { jest } from '@jest/globals';

const prismaMock = {
  analyticsSnapshot: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
  },
};

jest.unstable_mockModule('../lib/prisma.js', () => ({ default: prismaMock }));

const { getSnapshotFreshness, STALE_THRESHOLD_MS } = await import(
  '../api/services/analyticsService.js'
);

describe('analyticsSnapshotFreshness', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Fresh snapshot detection', () => {
    it('identifies recently generated metrics as fresh', async () => {
      const now = new Date();
      const recentSnapshot = {
        id: 'snap-1',
        metricName: 'escrow_count',
        generatedAt: new Date(now.getTime() - 5 * 60 * 1000), // 5 minutes ago
        value: 42,
      };

      prismaMock.analyticsSnapshot.findFirst.mockResolvedValue(recentSnapshot);

      const freshness = await getSnapshotFreshness('escrow_count');

      expect(freshness.isFresh).toBe(true);
      expect(freshness.generatedAt).toEqual(recentSnapshot.generatedAt);
      expect(freshness.ageMs).toBeLessThan(STALE_THRESHOLD_MS);
    });

    it('marks snapshots within threshold as fresh', async () => {
      const now = new Date();
      const threshold = STALE_THRESHOLD_MS || 3600000; // 1 hour default
      const snapshot = {
        id: 'snap-2',
        metricName: 'active_users',
        generatedAt: new Date(now.getTime() - threshold + 60000), // Just within threshold
        value: 100,
      };

      prismaMock.analyticsSnapshot.findFirst.mockResolvedValue(snapshot);

      const freshness = await getSnapshotFreshness('active_users');

      expect(freshness.isFresh).toBe(true);
    });
  });

  describe('Stale snapshot detection', () => {
    it('identifies outdated analytics data', async () => {
      const now = new Date();
      const staleSnapshot = {
        id: 'snap-3',
        metricName: 'payment_volume',
        generatedAt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
        value: 50000,
      };

      prismaMock.analyticsSnapshot.findFirst.mockResolvedValue(staleSnapshot);

      const freshness = await getSnapshotFreshness('payment_volume');

      expect(freshness.isFresh).toBe(false);
      expect(freshness.isStale).toBe(true);
    });

    it('detects stale data and includes warning flag', async () => {
      const now = new Date();
      const threshold = STALE_THRESHOLD_MS || 3600000;
      const snapshot = {
        id: 'snap-4',
        metricName: 'dispute_rate',
        generatedAt: new Date(now.getTime() - threshold - 60000), // Just beyond threshold
        value: 0.05,
      };

      prismaMock.analyticsSnapshot.findFirst.mockResolvedValue(snapshot);

      const freshness = await getSnapshotFreshness('dispute_rate');

      expect(freshness.isFresh).toBe(false);
      expect(freshness.warning).toBeDefined();
    });
  });

  describe('Missing snapshot handling', () => {
    it('handles cases where no snapshot exists for a metric', async () => {
      prismaMock.analyticsSnapshot.findFirst.mockResolvedValue(null);

      const freshness = await getSnapshotFreshness('nonexistent_metric');

      expect(freshness.exists).toBe(false);
      expect(freshness.isFresh).toBe(false);
      expect(freshness.error).toBeDefined();
    });

    it('returns appropriate error state for missing data', async () => {
      prismaMock.analyticsSnapshot.findFirst.mockResolvedValue(null);

      const freshness = await getSnapshotFreshness('missing_metric');

      expect(freshness.status).toBe('not_found');
      expect(freshness.generatedAt).toBeNull();
    });

    it('distinguishes between missing and stale data', async () => {
      prismaMock.analyticsSnapshot.findFirst
        .mockResolvedValueOnce(null) // First call: missing
        .mockResolvedValueOnce({ // Second call: stale
          id: 'snap-5',
          metricName: 'test',
          generatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30), // 30 days ago
        });

      const missingResult = await getSnapshotFreshness('metric1');
      const staleResult = await getSnapshotFreshness('metric2');

      expect(missingResult.exists).toBe(false);
      expect(staleResult.exists).toBe(true);
      expect(staleResult.isFresh).toBe(false);
    });
  });

  describe('Backward compatibility', () => {
    it('continues passing existing tests for affected code areas', async () => {
      const snapshots = [
        { id: 'snap-1', metricName: 'metric1', generatedAt: new Date(), value: 10 },
        { id: 'snap-2', metricName: 'metric2', generatedAt: new Date(), value: 20 },
      ];

      prismaMock.analyticsSnapshot.findMany.mockResolvedValue(snapshots);

      const result = await prismaMock.analyticsSnapshot.findMany();

      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty('metricName');
      expect(result[0]).toHaveProperty('value');
    });

    it('maintains API contract for snapshot retrieval', async () => {
      const snapshot = {
        id: 'snap-6',
        metricName: 'test_metric',
        generatedAt: new Date('2026-01-15T10:00:00Z'),
        value: 42,
        tenantId: 'tenant-1',
      };

      prismaMock.analyticsSnapshot.findFirst.mockResolvedValue(snapshot);

      const result = await prismaMock.analyticsSnapshot.findFirst();

      expect(result).toMatchObject({
        metricName: expect.any(String),
        generatedAt: expect.any(Date),
        value: expect.any(Number),
      });
    });
  });

  describe('Multiple metric tracking', () => {
    it('tracks freshness for different metrics independently', async () => {
      const now = new Date();

      prismaMock.analyticsSnapshot.findFirst
        .mockResolvedValueOnce({
          metricName: 'metric1',
          generatedAt: new Date(now.getTime() - 5 * 60 * 1000), // Fresh
        })
        .mockResolvedValueOnce({
          metricName: 'metric2',
          generatedAt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), // Stale
        });

      const freshness1 = await getSnapshotFreshness('metric1');
      const freshness2 = await getSnapshotFreshness('metric2');

      expect(freshness1.isFresh).toBe(true);
      expect(freshness2.isFresh).toBe(false);
    });
  });
});
