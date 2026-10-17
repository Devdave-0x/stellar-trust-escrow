'use strict';

/**
 * Tests for backend/services/reputationSearchService.js
 *
 * Covers the reputation search fallback behavior:
 *  (a) primary Elasticsearch success path
 *  (b) fallback success path
 *  (c) fallback failure path
 *  (d) dependency-unavailable degraded response
 *  (e) partial-failure boundary
 *  (f) overlapping concurrent requests/workers producing identical,
 *      stably ordered results with no duplicate side effects
 *
 * Also asserts telemetry metrics are emitted with bounded labels and that
 * logs contain correlation IDs and no sensitive values (no raw query text,
 * addresses, or tenant IDs).
 */

const mockEsSearch = jest.fn();
const mockFallbackSearch = jest.fn();
const mockMetricsIncrement = jest.fn();
const mockMetricsObserve = jest.fn();
const mockLoggerInfo = jest.fn();
const mockLoggerWarn = jest.fn();
const mockLoggerError = jest.fn();
const mockLoggerDebug = jest.fn();

jest.mock('../config/elasticsearch', () => ({
  __esModule: true,
  getClient: jest.fn(() => ({ search: mockEsSearch })),
  isAvailable: jest.fn(() => true),
}));

jest.mock('../repositories/reputationFallbackRepository', () => ({
  __esModule: true,
  search: mockFallbackSearch,
}));

jest.mock('../observability/metrics', () => ({
  __esModule: true,
  increment: mockMetricsIncrement,
  observe: mockMetricsObserve,
}));

jest.mock('../observability/logger', () => ({
  __esModule: true,
  info: mockLoggerInfo,
  warn: mockLoggerWarn,
  error: mockLoggerError,
  debug: mockLoggerDebug,
}));

const esConfig = require('../config/elasticsearch');
const reputationSearchService = require('./reputationSearchService');

const SENSITIVE_QUERY = 'alice.very-secret@example.com';
const SENSITIVE_ADDRESS = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUV';
const SENSITIVE_TENANT = 'tenant-super-secret-123';

function makeEsHit(id, score, overrides = {}) {
  return {
    _id: id,
    _score: score,
    _source: {
      subject: `subject-${id}`,
      reputationScore: score,
      updatedAt: '2024-01-01T00:00:00.000Z',
      ...overrides,
    },
  };
}

function makeFallbackRow(id, score) {
  return {
    id,
    subject: `subject-${id}`,
    reputationScore: score,
    updatedAt: '2024-01-01T00:00:00.000Z',
  };
}

function baseRequest(overrides = {}) {
  return {
    query: SENSITIVE_QUERY,
    address: SENSITIVE_ADDRESS,
    tenantId: SENSITIVE_TENANT,
    correlationId: 'corr-abc-123',
    limit: 10,
    ...overrides,
  };
}

function collectAllLogCalls() {
  return [
    ...mockLoggerInfo.mock.calls,
    ...mockLoggerWarn.mock.calls,
    ...mockLoggerError.mock.calls,
    ...mockLoggerDebug.mock.calls,
  ];
}

function serializedLogs() {
  return JSON.stringify(collectAllLogCalls());
}

function metricNames() {
  return mockMetricsIncrement.mock.calls.map((call) => call[0]);
}

function metricLabelsFor(name) {
  return mockMetricsIncrement.mock.calls
    .filter((call) => call[0] === name)
    .map((call) => call[1] || {});
}

beforeEach(() => {
  jest.clearAllMocks();
  esConfig.isAvailable.mockReturnValue(true);
  esConfig.getClient.mockReturnValue({ search: mockEsSearch });
});

describe('reputationSearchService.searchReputation', () => {
  describe('(a) primary Elasticsearch success path', () => {
    it('returns results from Elasticsearch without invoking the fallback', async () => {
      mockEsSearch.mockResolvedValueOnce({
        hits: {
          total: { value: 2 },
          hits: [makeEsHit('a', 90), makeEsHit('b', 80)],
        },
      });

      const result = await reputationSearchService.searchReputation(baseRequest());

      expect(mockEsSearch).toHaveBeenCalledTimes(1);
      expect(mockFallbackSearch).not.toHaveBeenCalled();
      expect(result).toEqual(
        expect.objectContaining({
          degraded: false,
          source: 'elasticsearch',
          results: expect.arrayContaining([
            expect.objectContaining({ id: 'a', reputationScore: 90 }),
            expect.objectContaining({ id: 'b', reputationScore: 80 }),
          ]),
        })
      );
      expect(result.results).toHaveLength(2);
    });

    it('emits bounded telemetry for the primary path', async () => {
      mockEsSearch.mockResolvedValueOnce({
        hits: { total: { value: 1 }, hits: [makeEsHit('a', 90)] },
      });

      await reputationSearchService.searchReputation(baseRequest());

      const names = metricNames();
      expect(names).toEqual(
        expect.arrayContaining(['reputation_search_total', 'reputation_search_duration_ms'])
      );

      const outcomeLabels = metricLabelsFor('reputation_search_total');
      expect(outcomeLabels.length).toBeGreaterThan(0);
      outcomeLabels.forEach((labels) => {
        expect(labels).toEqual(
          expect.objectContaining({
            source: 'elasticsearch',
            outcome: 'success',
          })
        );
        // Bounded labels only: no raw query/address/tenant values.
        Object.values(labels).forEach((value) => {
          expect(String(value)).not.toContain(SENSITIVE_QUERY);
          expect(String(value)).not.toContain(SENSITIVE_ADDRESS);
          expect(String(value)).not.toContain(SENSITIVE_TENANT);
        });
      });
    });

    it('logs with a correlation ID and no sensitive values', async () => {
      mockEsSearch.mockResolvedValueOnce({
        hits: { total: { value: 1 }, hits: [makeEsHit('a', 90)] },
      });

      await reputationSearchService.searchReputation(baseRequest());

      const logs = serializedLogs();
      expect(logs).toContain('corr-abc-123');
      expect(logs).not.toContain(SENSITIVE_QUERY);
      expect(logs).not.toContain(SENSITIVE_ADDRESS);
      expect(logs).not.toContain(SENSITIVE_TENANT);
    });
  });

  describe('(b) fallback success path', () => {
    it('falls back when Elasticsearch errors and returns fallback results', async () => {
      mockEsSearch.mockRejectedValueOnce(new Error('es unavailable'));
      mockFallbackSearch.mockResolvedValueOnce([
        makeFallbackRow('a', 70),
        makeFallbackRow('b', 60),
      ]);

      const result = await reputationSearchService.searchReputation(baseRequest());

      expect(mockEsSearch).toHaveBeenCalledTimes(1);
      expect(mockFallbackSearch).toHaveBeenCalledTimes(1);
      expect(result).toEqual(
        expect.objectContaining({
          degraded: false,
          source: 'fallback',
        })
      );
      expect(result.results).toHaveLength(2);
      expect(result.results.map((r) => r.id)).toEqual(['a', 'b']);
    });

    it('emits fallback telemetry with bounded labels', async () => {
      mockEsSearch.mockRejectedValueOnce(new Error('es unavailable'));
      mockFallbackSearch.mockResolvedValueOnce([makeFallbackRow('a', 70)]);

      await reputationSearchService.searchReputation(baseRequest());

      const fallbackLabels = metricLabelsFor('reputation_search_total').filter(
        (labels) => labels.source === 'fallback'
      );
      expect(fallbackLabels.length).toBeGreaterThan(0);
      fallbackLabels.forEach((labels) => {
        expect(labels.outcome).toBe('success');
        Object.values(labels).forEach((value) => {
          expect(String(value)).not.toContain(SENSITIVE_QUERY);
          expect(String(value)).not.toContain(SENSITIVE_ADDRESS);
          expect(String(value)).not.toContain(SENSITIVE_TENANT);
        });
      });
    });

    it('logs fallback usage with correlation ID and no sensitive values', async () => {
      mockEsSearch.mockRejectedValueOnce(new Error('es unavailable'));
      mockFallbackSearch.mockResolvedValueOnce([makeFallbackRow('a', 70)]);

      await reputationSearchService.searchReputation(baseRequest());

      const logs = serializedLogs();
      expect(logs).toContain('corr-abc-123');
      expect(logs).not.toContain(SENSITIVE_QUERY);
      expect(logs).not.toContain(SENSITIVE_ADDRESS);
      expect(logs).not.toContain(SENSITIVE_TENANT);
    });
  });

  describe('(c) fallback failure path', () => {
    it('returns a stable degraded response when both ES and fallback fail', async () => {
      mockEsSearch.mockRejectedValueOnce(new Error('es unavailable'));
      mockFallbackSearch.mockRejectedValueOnce(new Error('fallback unavailable'));

      const result = await reputationSearchService.searchReputation(baseRequest());

      expect(result).toEqual(
        expect.objectContaining({
          degraded: true,
          source: 'degraded',
          results: [],
        })
      );
    });

    it('emits failure telemetry with bounded labels and no sensitive values', async () => {
      mockEsSearch.mockRejectedValueOnce(new Error('es unavailable'));
      mockFallbackSearch.mockRejectedValueOnce(new Error('fallback unavailable'));

      await reputationSearchService.searchReputation(baseRequest());

      const failureLabels = metricLabelsFor('reputation_search_total').filter(
        (labels) => labels.outcome === 'failure'
      );
      expect(failureLabels.length).toBeGreaterThan(0);
      failureLabels.forEach((labels) => {
        Object.values(labels).forEach((value) => {
          expect(String(value)).not.toContain(SENSITIVE_QUERY);
          expect(String(value)).not.toContain(SENSITIVE_ADDRESS);
          expect(String(value)).not.toContain(SENSITIVE_TENANT);
        });
      });
    });

    it('logs errors with correlation ID and no sensitive values', async () => {
      mockEsSearch.mockRejectedValueOnce(new Error('es unavailable'));
      mockFallbackSearch.mockRejectedValueOnce(new Error('fallback unavailable'));

      await reputationSearchService.searchReputation(baseRequest());

      const logs = serializedLogs();
      expect(logs).toContain('corr-abc-123');
      expect(logs).not.toContain(SENSITIVE_QUERY);
      expect(logs).not.toContain(SENSITIVE_ADDRESS);
      expect(logs).not.toContain(SENSITIVE_TENANT);
    });
  });

  describe('(d) dependency-unavailable degraded response', () => {
    it('skips Elasticsearch entirely when it is unavailable and uses fallback', async () => {
      esConfig.isAvailable.mockReturnValue(false);
      mockFallbackSearch.mockResolvedValueOnce([makeFallbackRow('a', 50)]);

      const result = await reputationSearchService.searchReputation(baseRequest());

      expect(mockEsSearch).not.toHaveBeenCalled();
      expect(mockFallbackSearch).toHaveBeenCalledTimes(1);
      expect(result).toEqual(
        expect.objectContaining({
          degraded: false,
          source: 'fallback',
        })
      );
      expect(result.results).toHaveLength(1);
    });

    it('returns a stable degraded response when all optional infrastructure is unavailable', async () => {
      esConfig.isAvailable.mockReturnValue(false);
      mockFallbackSearch.mockRejectedValueOnce(new Error('fallback unavailable'));

      const result = await reputationSearchService.searchReputation(baseRequest());

      expect(result).toEqual(
        expect.objectContaining({
          degraded: true,
          source: 'degraded',
          results: [],
        })
      );
    });

    it('emits a bounded unavailable metric when ES is unavailable', async () => {
      esConfig.isAvailable.mockReturnValue(false);
      mockFallbackSearch.mockResolvedValueOnce([makeFallbackRow('a', 50)]);

      await reputationSearchService.searchReputation(baseRequest());

      const labels = metricLabelsFor('reputation_search_total');
      expect(labels.length).toBeGreaterThan(0);
      labels.forEach((entry) => {
        Object.values(entry).forEach((value) => {
          expect(String(value)).not.toContain(SENSITIVE_QUERY);
          expect(String(value)).not.toContain(SENSITIVE_ADDRESS);
          expect(String(value)).not.toContain(SENSITIVE_TENANT);
        });
      });
    });
  });

  describe('(e) partial-failure boundary', () => {
    it('returns fallback results when ES returns a malformed payload', async () => {
      mockEsSearch.mockResolvedValueOnce({ hits: null });
      mockFallbackSearch.mockResolvedValueOnce([makeFallbackRow('a', 40)]);

      const result = await reputationSearchService.searchReputation(baseRequest());

      expect(mockFallbackSearch).toHaveBeenCalledTimes(1);
      expect(result).toEqual(
        expect.objectContaining({
          degraded: false,
          source: 'fallback',
        })
      );
      expect(result.results).toHaveLength(1);
    });

    it('returns fallback results when ES times out', async () => {
      const timeoutError = new Error('Request timed out');
      timeoutError.code = 'ETIMEDOUT';
      mockEsSearch.mockRejectedValueOnce(timeoutError);
      mockFallbackSearch.mockResolvedValueOnce([makeFallbackRow('a', 40)]);

      const result = await reputationSearchService.searchReputation(baseRequest());

      expect(result.source).toBe('fallback');
      expect(result.results).toHaveLength(1);
    });

    it('returns an empty success response when ES succeeds with zero hits', async () => {
      mockEsSearch.mockResolvedValueOnce({
        hits: { total: { value: 0 }, hits: [] },
      });

      const result = await reputationSearchService.searchReputation(baseRequest());

      expect(mockFallbackSearch).not.toHaveBeenCalled();
      expect(result).toEqual(
        expect.objectContaining({
          degraded: false,
          source: 'elasticsearch',
          results: [],
        })
      );
    });

    it('does not leak sensitive values in telemetry on partial failure', async () => {
      mockEsSearch.mockResolvedValueOnce({ hits: null });
      mockFallbackSearch.mockResolvedValueOnce([makeFallbackRow('a', 40)]);

      await reputationSearchService.searchReputation(baseRequest());

      const logs = serializedLogs();
      expect(logs).not.toContain(SENSITIVE_QUERY);
      expect(logs).not.toContain(SENSITIVE_ADDRESS);
      expect(logs).not.toContain(SENSITIVE_TENANT);
    });
  });

  describe('(f) overlapping concurrent requests and workers', () => {
    it('produces identical, stably ordered results for concurrent requests', async () => {
      mockEsSearch.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(
              () =>
                resolve({
                  hits: {
                    total: { value: 3 },
                    hits: [makeEsHit('c', 30), makeEsHit('a', 90), makeEsHit('b', 60)],
                  },
                }),
              5
            );
          })
      );

      const requests = Array.from({ length: 5 }, (_, i) =>
        reputationSearchService.searchReputation(
          baseRequest({ correlationId: `corr-concurrent-${i}` })
        )
      );

      const results = await Promise.all(requests);

      const first = results[0];
      results.forEach((result) => {
        expect(result.source).toBe('elasticsearch');
        expect(result.results.map((r) => r.id)).toEqual(first.results.map((r) => r.id));
      });

      // Stable ordering: descending reputation score.
      expect(first.results.map((r) => r.id)).toEqual(['a', 'b', 'c']);
    });

    it('produces identical fallback results for concurrent requests during ES outage', async () => {
      mockEsSearch.mockRejectedValue(new Error('es unavailable'));
      mockFallbackSearch.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(
              () => resolve([makeFallbackRow('b', 60), makeFallbackRow('a', 70)]),
              5
            );
          })
      );

      const requests = Array.from({ length: 4 }, (_, i) =>
        reputationSearchService.searchReputation(
          baseRequest({ correlationId: `corr-fallback-${i}` })
        )
      );

      const results = await Promise.all(requests);

      const first = results[0];
      results.forEach((result) => {
        expect(result.source).toBe('fallback');
        expect(result.results.map((r) => r.id)).toEqual(first.results.map((r) => r.id));
      });
      expect(first.results.map((r) => r.id)).toEqual(['a', 'b']);
    });

    it('does not duplicate side effects across overlapping workers', async () => {
      mockEsSearch.mockRejectedValue(new Error('es unavailable'));
      mockFallbackSearch.mockResolvedValue([makeFallbackRow('a', 70)]);

      const requests = Array.from({ length: 3 }, (_, i) =>
        reputationSearchService.searchReputation(
          baseRequest({ correlationId: `corr-worker-${i}` })
        )
      );

      await Promise.all(requests);

      // Each request performs exactly one fallback lookup; no shared retries.
      expect(mockFallbackSearch).toHaveBeenCalledTimes(3);
      expect(mockEsSearch).toHaveBeenCalledTimes(3);
    });

    it('keeps telemetry bounded and correlation IDs distinct under concurrency', async () => {
      mockEsSearch.mockResolvedValue({
        hits: { total: { value: 1 }, hits: [makeEsHit('a', 90)] },
      });

      const requests = Array.from({ length: 3 }, (_, i) =>
        reputationSearchService.searchReputation(
          baseRequest({ correlationId: `corr-distinct-${i}` })
        )
      );

      await Promise.all(requests);

      const logs = serializedLogs();
      expect(logs).toContain('corr-distinct-0');
      expect(logs).toContain('corr-distinct-1');
      expect(logs).toContain('corr-distinct-2');
      expect(logs).not.toContain(SENSITIVE_QUERY);
      expect(logs).not.toContain(SENSITIVE_ADDRESS);
      expect(logs).not.toContain(SENSITIVE_TENANT);

      metricLabelsFor('reputation_search_total').forEach((labels) => {
        Object.values(labels).forEach((value) => {
          expect(String(value)).not.toContain(SENSITIVE_QUERY);
          expect(String(value)).not.toContain(SENSITIVE_ADDRESS);
          expect(String(value)).not.toContain(SENSITIVE_TENANT);
        });
      });
    });
  });
});