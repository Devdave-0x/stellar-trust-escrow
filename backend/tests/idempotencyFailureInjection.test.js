import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const cache = {
  get: jest.fn(),
  set: jest.fn(),
  invalidate: jest.fn().mockResolvedValue(undefined),
};
jest.unstable_mockModule('../lib/cache.js', () => ({ default: cache }));
const { idempotencyMiddleware } = await import('../api/middleware/idempotency.js');

function request() {
  return {
    method: 'POST',
    path: '/resource',
    headers: { 'idempotency-key': 'stable-key' },
    tenant: { id: 'tenant-1' },
  };
}

function response() {
  const res = {
    statusCode: 200,
    setHeader: jest.fn(),
    status: jest.fn(() => res),
    json: jest.fn(),
  };
  return res;
}

describe('idempotency lifecycle failures', () => {
  beforeEach(() => jest.clearAllMocks());

  it('forwards cache read failures and releases the lock', async () => {
    cache.get.mockRejectedValueOnce(new Error('cache timeout'));
    const next = jest.fn();
    await idempotencyMiddleware()(request(), response(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'cache timeout' }));
    expect(cache.invalidate).toHaveBeenCalled();
  });

  it('forwards lock acquisition failures', async () => {
    cache.get.mockResolvedValue(null);
    cache.set.mockRejectedValueOnce(new Error('lock unavailable'));
    const next = jest.fn();
    await idempotencyMiddleware()(request(), response(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'lock unavailable' }));
  });

  it('does not fail a successful response when cache persistence fails', async () => {
    cache.get.mockResolvedValue(null);
    cache.set.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('write timeout'));
    const res = response();
    const next = jest.fn();
    await idempotencyMiddleware()(request(), res, next);
    await expect(res.json({ ok: true })).resolves.toBeUndefined();
    expect(next).toHaveBeenCalledTimes(1);
  });
});
