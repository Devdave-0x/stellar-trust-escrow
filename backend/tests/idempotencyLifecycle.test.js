import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const cache = {
  get: jest.fn(),
  set: jest.fn(),
  invalidate: jest.fn().mockResolvedValue(undefined),
};
const logger = { debug: jest.fn(), warn: jest.fn(), error: jest.fn() };
jest.unstable_mockModule('../lib/cache.js', () => ({ default: cache }));
jest.unstable_mockModule('../config/logger.js', () => ({ createModuleLogger: () => logger }));
const { idempotencyMiddleware, resetIdempotencyState } = await import(
  '../api/middleware/idempotency.js'
);

function request() {
  return {
    method: 'POST',
    path: '/escrows',
    headers: { 'idempotency-key': 'private-client-key' },
    tenant: { id: 'private-tenant' },
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

describe('idempotency lifecycle hardening', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetIdempotencyState();
    cache.get.mockResolvedValue(null);
    cache.set.mockResolvedValue(undefined);
  });

  it('rejects an overlapping local request before duplicate execution', async () => {
    const middleware = idempotencyMiddleware();
    const firstResponse = response();
    await middleware(request(), firstResponse, jest.fn());

    const secondResponse = response();
    const next = jest.fn();
    await middleware(request(), secondResponse, next);

    expect(next).not.toHaveBeenCalled();
    expect(secondResponse.status).toHaveBeenCalledWith(409);
  });

  it('degrades to normal request handling when cache reads fail', async () => {
    cache.get.mockRejectedValueOnce(new Error('cache unavailable'));
    const res = response();
    const next = jest.fn();

    await idempotencyMiddleware()(request(), res, next);

    expect(next).toHaveBeenCalledWith();
    expect(res.setHeader).toHaveBeenCalledWith('X-Idempotency-Status', 'degraded');
  });

  it('does not include client keys or tenant values in telemetry', async () => {
    cache.get.mockResolvedValueOnce({ status: 200, body: { ok: true } });
    await idempotencyMiddleware()(request(), response(), jest.fn());

    const telemetry = JSON.stringify(logger.debug.mock.calls);
    expect(telemetry).not.toContain('private-client-key');
    expect(telemetry).not.toContain('private-tenant');
  });

  it('releases local state after a response completes', async () => {
    const middleware = idempotencyMiddleware();
    const firstResponse = response();
    await middleware(request(), firstResponse, jest.fn());
    await firstResponse.json({ ok: true });

    const next = jest.fn();
    await middleware(request(), response(), next);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
