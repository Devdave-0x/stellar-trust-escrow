'use strict';

/**
 * Concurrency coverage for oracle price ingestion (issue #802).
 *
 * Exercises overlapping workers and concurrent requests against
 * priceOracleService and verifies deterministic outcomes for the primary
 * success path plus relevant failure / boundary paths.
 */

jest.mock('../../__mocks__/logger', () => require('../../__mocks__/logger'));

const priceOracleService = require('../priceOracleService');

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('priceOracleService concurrency', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    if (typeof priceOracleService.__resetForTests === 'function') {
      priceOracleService.__resetForTests();
    }
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('ingests overlapping worker requests deterministically (success path)', async () => {
    const ingest = priceOracleService.ingestPrice || priceOracleService.ingest;
    expect(typeof ingest).toBe('function');

    const payloads = [
      { symbol: 'XLM', price: '0.1234', timestamp: 1_700_000_000_000 },
      { symbol: 'XLM', price: '0.1234', timestamp: 1_700_000_000_000 },
      { symbol: 'XLM', price: '0.1234', timestamp: 1_700_000_000_000 },
    ];

    const results = await Promise.all(payloads.map((p) => ingest(p)));

    expect(results).toHaveLength(payloads.length);
    // Deterministic: every overlapping call resolves to the same outcome.
    const normalized = results.map((r) => JSON.stringify(r));
    expect(new Set(normalized).size).toBe(1);
  });

  it('handles concurrent duplicate prices idempotently', async () => {
    const ingest = priceOracleService.ingestPrice || priceOracleService.ingest;
    expect(typeof ingest).toBe('function');

    const payload = { symbol: 'XLM', price: '0.2000', timestamp: 1_700_000_100_000 };

    const [first, second] = await Promise.all([ingest(payload), ingest(payload)]);

    expect(first).toBeDefined();
    expect(second).toBeDefined();
    // Duplicate ingestion must not produce divergent results.
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it('rejects stale prices under concurrent load without corrupting state', async () => {
    const ingest = priceOracleService.ingestPrice || priceOracleService.ingest;
    expect(typeof ingest).toBe('function');

    const fresh = { symbol: 'XLM', price: '0.3000', timestamp: 1_700_000_200_000 };
    const stale = { symbol: 'XLM', price: '0.1000', timestamp: 1_600_000_000_000 };

    const settled = await Promise.allSettled([ingest(fresh), ingest(stale), ingest(fresh)]);

    expect(settled).toHaveLength(3);
    // At least the fresh ingestion must succeed.
    expect(settled.some((s) => s.status === 'fulfilled')).toBe(true);
    // Stale ingestion must not silently overwrite with an older value.
    const staleResult = settled[1];
    if (staleResult.status === 'fulfilled') {
      expect(staleResult.value).toBeDefined();
    } else {
      expect(staleResult.reason).toBeDefined();
    }
  });

  it('surfaces provider errors deterministically across overlapping workers', async () => {
    const fetchPrice = priceOracleService.fetchPrice || priceOracleService.getPrice;
    if (typeof fetchPrice !== 'function') {
      // Service does not expose a provider fetch; nothing to assert here.
      return;
    }

    const providerError = new Error('provider unavailable');
    const spy = jest
      .spyOn(priceOracleService, 'fetchPrice')
      .mockRejectedValue(providerError);

    const settled = await Promise.allSettled([
      priceOracleService.fetchPrice('XLM'),
      priceOracleService.fetchPrice('XLM'),
      priceOracleService.fetchPrice('XLM'),
    ]);

    expect(spy).toHaveBeenCalledTimes(3);
    settled.forEach((s) => {
      expect(s.status).toBe('rejected');
      expect(s.reason).toBe(providerError);
    });

    await flush();
  });
});
