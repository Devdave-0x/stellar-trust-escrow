import { jest } from '@jest/globals';

const store = new Map();

class FakeRedis {
  on() {}
  async get(key) {
    return store.has(key) ? store.get(key) : null;
  }
  async set(key, value) {
    store.set(key, value);
    return 'OK';
  }
}

jest.unstable_mockModule('ioredis', () => ({ default: FakeRedis }));

process.env.REDIS_URL = 'redis://localhost:6379';
const { default: suggestionsService } = await import('../services/suggestionsService.js');

function buildPrismaMock() {
  return {
    escrow: { findMany: jest.fn().mockResolvedValue([]) },
    userProfile: { findMany: jest.fn().mockResolvedValue([]) },
    tag: { findMany: jest.fn().mockResolvedValue([]) },
  };
}

beforeEach(() => {
  store.clear();
});

describe('suggestionsService', () => {
  it('returns empty arrays for queries shorter than 2 characters without hitting the DB', async () => {
    const prismaMock = buildPrismaMock();
    const result = await suggestionsService.getSuggestions(prismaMock, 1, 'a');

    expect(result).toEqual({ escrows: [], users: [], tags: [] });
    expect(prismaMock.escrow.findMany).not.toHaveBeenCalled();
  });

  it('ranks prefix matches above substring matches within each category', () => {
    const items = [
      { title: 'Website substring foo' },
      { title: 'Foo project' }, // prefix match
      { title: 'Another foo mention' },
    ];

    const ranked = suggestionsService.rankAndLimit(items, 'foo', (i) => i.title);

    expect(ranked[0].title).toBe('Foo project');
  });

  it('limits results to 5 per category', async () => {
    const prismaMock = buildPrismaMock();
    prismaMock.escrow.findMany.mockResolvedValue(
      Array.from({ length: 10 }, (_, i) => ({ id: BigInt(i), title: `Project ${i}` })),
    );

    const result = await suggestionsService.getSuggestions(prismaMock, 1, 'project');

    expect(result.escrows).toHaveLength(5);
  });

  it('caches results in Redis keyed by user id and query, and serves cache hits without re-querying', async () => {
    const prismaMock = buildPrismaMock();
    prismaMock.escrow.findMany.mockResolvedValue([{ id: 1n, title: 'Foo bar' }]);

    const first = await suggestionsService.getSuggestions(prismaMock, 7, 'foo');
    expect(prismaMock.escrow.findMany).toHaveBeenCalledTimes(1);
    expect(store.has('suggestions:7:foo')).toBe(true);

    const second = await suggestionsService.getSuggestions(prismaMock, 7, 'foo');
    expect(prismaMock.escrow.findMany).toHaveBeenCalledTimes(1); // no additional DB call — served from cache
    expect(second).toEqual(first);
  });

  it('keys the cache separately per user', async () => {
    const prismaMock = buildPrismaMock();
    prismaMock.escrow.findMany.mockResolvedValue([{ id: 1n, title: 'Foo bar' }]);

    await suggestionsService.getSuggestions(prismaMock, 1, 'foo');
    await suggestionsService.getSuggestions(prismaMock, 2, 'foo');

    expect(store.has('suggestions:1:foo')).toBe(true);
    expect(store.has('suggestions:2:foo')).toBe(true);
  });
});
