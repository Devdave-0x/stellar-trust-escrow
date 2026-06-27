/**
 * Idempotency Middleware Tests
 *
 * Tests three scenarios:
 *  1. First request — handler executes, response cached under the key
 *  2. Duplicate within TTL — cached response returned, handler NOT called again
 *  3. Duplicate while in-flight — 409 Conflict returned
 *  4. Key absent — request passes through unchanged
 *  5. Non-2xx response — not cached, subsequent request re-executes
 */

import { jest } from '@jest/globals';

// ── Mock cache service ────────────────────────────────────────────────────────

const store = new Map();
const lockStore = new Map();

// Combine store + lockStore into a single namespace (keys are distinct by prefix)
const allStore = { get: (k) => store.get(k) ?? lockStore.get(k) ?? null };

const mockCache = {
  get: jest.fn(async (key) => {
    if (key.startsWith('idempotency:lock:')) return lockStore.get(key) ?? null;
    return store.get(key) ?? null;
  }),
  set: jest.fn(async (key, value, _ttl) => {
    if (key.startsWith('idempotency:lock:')) {
      lockStore.set(key, value);
    } else {
      store.set(key, value);
    }
  }),
  invalidate: jest.fn(async (key) => {
    store.delete(key);
    lockStore.delete(key);
  }),
};

jest.unstable_mockModule('../lib/cache.js', () => ({ default: mockCache }));

// ── Load middleware AFTER mock is registered ──────────────────────────────────

const { idempotencyMiddleware } = await import('../api/middleware/idempotency.js');

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeReq(overrides = {}) {
  return {
    method: 'POST',
    path: '/api/escrows/broadcast',
    headers: { 'idempotency-key': 'test-key-abc123' },
    tenant: { id: 'tenant-1' },
    ip: '127.0.0.1',
    ...overrides,
  };
}

function makeRes() {
  let statusCode = 200;
  const res = {
    get statusCode() { return statusCode; },
    set statusCode(v) { statusCode = v; },
    setHeader: jest.fn(),
    status(code) {
      statusCode = code;
      return res;
    },
    json: jest.fn((body) => {
      res._body = body;
      return res;
    }),
    _body: null,
  };
  return res;
}

// ── Fixture ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  store.clear();
  lockStore.clear();
  jest.clearAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('idempotencyMiddleware', () => {
  const middleware = idempotencyMiddleware();

  test('1. first request — calls next() and caches the response', async () => {
    const req = makeReq();
    const res = makeRes();
    const next = jest.fn();

    await middleware(req, res, next);

    // next() should have been called (handler runs)
    expect(next).toHaveBeenCalledTimes(1);

    // Simulate handler setting response
    await res.json({ success: true, escrowId: '42' });

    // Response should now be cached
    const cacheKey = `idempotency:tenant-1:POST:/api/escrows/broadcast:test-key-abc123`;
    expect(mockCache.set).toHaveBeenCalledWith(
      cacheKey,
      expect.objectContaining({ status: 200, body: { success: true, escrowId: '42' } }),
      86400,
    );

    // Response header should be set
    expect(res.setHeader).toHaveBeenCalledWith('Idempotency-Key', 'test-key-abc123');
  });

  test('2. duplicate within TTL — returns cached response, does NOT call next()', async () => {
    const cacheKey = `idempotency:tenant-1:POST:/api/escrows/broadcast:test-key-abc123`;
    // Pre-populate cache as if first request already completed
    store.set(cacheKey, { status: 201, body: { id: '99', status: 'created' }, completedAt: new Date().toISOString() });

    const req = makeReq();
    const res = makeRes();
    const next = jest.fn();

    await middleware(req, res, next);

    // next() must NOT be called
    expect(next).not.toHaveBeenCalled();

    // Cached body should be returned
    expect(res.json).toHaveBeenCalledWith({ id: '99', status: 'created' });
    expect(res.statusCode).toBe(201);

    // Replay header should indicate cached response
    expect(res.setHeader).toHaveBeenCalledWith('X-Idempotency-Replayed', 'true');
  });

  test('3. duplicate while in-flight — returns 409 Conflict', async () => {
    const cacheKey = `idempotency:tenant-1:POST:/api/escrows/broadcast:test-key-abc123`;
    const lockKey = `idempotency:lock:${cacheKey}`;
    // Simulate in-flight lock
    lockStore.set(lockKey, '1');

    const req = makeReq();
    const res = makeRes();
    const next = jest.fn();

    await middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'IDEMPOTENCY_IN_FLIGHT' }),
    );
  });

  test('4. no Idempotency-Key header — passes through without caching', async () => {
    const req = makeReq({ headers: {} });
    const res = makeRes();
    const next = jest.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    // No cache operations should have occurred
    expect(mockCache.get).not.toHaveBeenCalled();
  });

  test('5. non-GET method passes through without caching (GET not a mutating method)', async () => {
    const req = makeReq({ method: 'GET' });
    const res = makeRes();
    const next = jest.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(mockCache.get).not.toHaveBeenCalled();
  });

  test('6. non-2xx response is NOT cached so client can retry', async () => {
    const req = makeReq();
    const res = makeRes();
    res.status(500);
    const next = jest.fn();

    await middleware(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);

    // Simulate 500 response
    res.statusCode = 500;
    await res.json({ error: 'Internal Server Error' });

    // The entry should NOT have been stored (only lock removal)
    const cacheKey = `idempotency:tenant-1:POST:/api/escrows/broadcast:test-key-abc123`;
    const stored = store.get(cacheKey);
    expect(stored).toBeUndefined();
  });
});
