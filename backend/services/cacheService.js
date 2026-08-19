

/**
 * Three-tier caching service
 *
 * L1 – in-process LRU cache (max 500 entries)
 * L2 – Redis cache with per-key TTL
 * L3 – Prisma DB fallback via caller-supplied fetcher
 */

// ---------------------------------------------------------------------------
// Minimal LRU cache backed by a Map (insertion order == access order trick)
// ---------------------------------------------------------------------------
class LRUCache {
  constructor(maxSize = 500) {
    this.maxSize = maxSize;
    this.map = new Map();
  }

  get(key) {
    if (!this.map.has(key)) return undefined;
    // Move to end (most-recently-used position)
    const value = this.map.get(key);
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key, value) {
    if (this.map.has(key)) this.map.delete(key);
    else if (this.map.size >= this.maxSize) {
      // Evict least-recently-used (first entry)
      const firstKey = this.map.keys().next().value;
      this.map.delete(firstKey);
    }
    this.map.set(key, value);
  }

  delete(key) {
    return this.map.delete(key);
  }

  keys() {
    return this.map.keys();
  }

  clear() {
    this.map.clear();
  }
}

// ---------------------------------------------------------------------------
// Stubbed Redis client – replace with real ioredis in production
// ---------------------------------------------------------------------------
const _redisStore = new Map();

const redis = {
  async get(key) {
    const entry = _redisStore.get(key);
    if (!entry) return null;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      _redisStore.delete(key);
      return null;
    }
    return entry.value;
  },

  async set(key, value, expiryMode, ttlSeconds) {
    const expiresAt =
      expiryMode === 'EX' && ttlSeconds
        ? Date.now() + ttlSeconds * 1000
        : null;
    _redisStore.set(key, { value, expiresAt });
    return 'OK';
  },

  async del(key) {
    return _redisStore.delete(key) ? 1 : 0;
  },

  async keys(pattern) {
    // Simple glob-style: only handles trailing '*'
    const prefix = pattern.replace(/\*$/, '');
    return [..._redisStore.keys()].filter((k) => k.startsWith(prefix));
  },
};

// ---------------------------------------------------------------------------
// Metrics counters
// ---------------------------------------------------------------------------
const metrics = {
  l1Hits: 0,
  l2Hits: 0,
  l3Hits: 0,
  misses: 0,
};

// ---------------------------------------------------------------------------
// L1 instance
// ---------------------------------------------------------------------------
const l1 = new LRUCache(500);

// ---------------------------------------------------------------------------
// Public cache service
// ---------------------------------------------------------------------------
const cacheService = {
  /**
   * Retrieve a value by key. Resolution order: L1 -> L2 -> L3 (fetcher).
   *
   * @param {string} key
   * @param {Function} fetcher  async () => value  - called only on full miss
   * @param {number}  [ttl=300]  TTL in seconds for L2
   * @returns {Promise<*>}
   */
  async get(key, fetcher, ttl = 300) {
    // L1 check
    const l1Value = l1.get(key);
    if (l1Value !== undefined) {
      metrics.l1Hits++;
      return l1Value;
    }

    // L2 check
    let l2Value = null;
    try {
      l2Value = await redis.get(key);
    } catch (err) {
      console.warn('[CacheService] Redis get error:', err.message);
    }

    if (l2Value !== null) {
      metrics.l2Hits++;
      // Populate L1 from L2
      l1.set(key, l2Value);
      return l2Value;
    }

    // L3 check (DB via fetcher)
    if (typeof fetcher !== 'function') {
      metrics.misses++;
      return null;
    }

    let dbValue = null;
    try {
      dbValue = await fetcher();
    } catch (err) {
      console.error('[CacheService] Fetcher error for key', key, err.message);
      metrics.misses++;
      throw err;
    }

    if (dbValue === null || dbValue === undefined) {
      metrics.misses++;
      return null;
    }

    metrics.l3Hits++;

    // Back-fill L1 and L2
    l1.set(key, dbValue);
    try {
      const serialized =
        typeof dbValue === 'string' ? dbValue : JSON.stringify(dbValue);
      await redis.set(key, serialized, 'EX', ttl);
    } catch (err) {
      console.warn('[CacheService] Redis set error after L3 hit:', err.message);
    }

    return dbValue;
  },

  /**
   * Write a value to all three cache layers.
   *
   * @param {string} key
   * @param {*}      value
   * @param {number} [ttl=300]
   */
  async set(key, value, ttl = 300) {
    l1.set(key, value);

    try {
      const serialized =
        typeof value === 'string' ? value : JSON.stringify(value);
      await redis.set(key, serialized, 'EX', ttl);
    } catch (err) {
      console.warn('[CacheService] Redis set error:', err.message);
    }
  },

  /**
   * Remove a single key from all cache layers.
   *
   * @param {string} key
   */
  async invalidate(key) {
    l1.delete(key);
    try {
      await redis.del(key);
    } catch (err) {
      console.warn('[CacheService] Redis del error:', err.message);
    }
  },

  /**
   * Remove all keys matching a pattern from Redis and L1.
   * Pattern supports trailing wildcard, e.g. "user:*"
   *
   * @param {string} pattern
   */
  async invalidatePattern(pattern) {
    // Redis pattern invalidation
    let matchedKeys = [];
    try {
      matchedKeys = await redis.keys(pattern);
      await Promise.all(matchedKeys.map((k) => redis.del(k)));
    } catch (err) {
      console.warn('[CacheService] Redis pattern invalidation error:', err.message);
    }

    // L1 pattern invalidation (simple prefix match on trailing '*')
    const prefix = pattern.replace(/\*$/, '');
    for (const k of l1.keys()) {
      if (k.startsWith(prefix)) {
        l1.delete(k);
      }
    }

    return matchedKeys.length;
  },

  /**
   * Return cumulative cache hit/miss statistics.
   *
   * @returns {{ l1Hits: number, l2Hits: number, l3Hits: number, misses: number }}
   */
  getMetrics() {
    return { ...metrics };
  },

  /**
   * Reset metrics counters (useful in tests).
   */
  resetMetrics() {
    metrics.l1Hits = 0;
    metrics.l2Hits = 0;
    metrics.l3Hits = 0;
    metrics.misses = 0;
  },

  /**
   * Flush all layers (primarily for testing).
   */
  async flush() {
    l1.clear();
    _redisStore.clear();
  },
};

export default cacheService;
