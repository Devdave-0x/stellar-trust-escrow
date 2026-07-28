/**
 * Tests for backend/lib/gracefulShutdown.js
 */
import { jest, describe, expect, it, beforeEach, afterEach } from '@jest/globals';
import { EventEmitter } from 'events';

jest.unstable_mockModule('../config/logger.js', () => ({
  createModuleLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

const {
  trackInFlightRequests,
  registerCleanup,
  getShutdownState,
  runGracefulShutdown,
  __resetForTests,
} = await import('../lib/gracefulShutdown.js');

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeReqRes() {
  const req = {};
  const res = new EventEmitter();
  res.set = jest.fn().mockReturnThis();
  res.status = jest.fn().mockReturnThis();
  res.json = jest.fn().mockReturnThis();
  return { req, res };
}

beforeEach(() => {
  __resetForTests();
});

afterEach(() => {
  __resetForTests();
});

// ── trackInFlightRequests ────────────────────────────────────────────────────

describe('trackInFlightRequests', () => {
  it('calls next() and increments the in-flight count while running', () => {
    const { req, res } = makeReqRes();
    const next = jest.fn();

    trackInFlightRequests(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(getShutdownState().inFlightRequests).toBe(1);
  });

  it('decrements the in-flight count when the response finishes', () => {
    const { req, res } = makeReqRes();
    trackInFlightRequests(req, res, jest.fn());

    res.emit('finish');

    expect(getShutdownState().inFlightRequests).toBe(0);
  });

  it('does not double-decrement when both finish and close fire', () => {
    const { req, res } = makeReqRes();
    trackInFlightRequests(req, res, jest.fn());

    res.emit('finish');
    res.emit('close');

    expect(getShutdownState().inFlightRequests).toBe(0);
  });

  it('rejects new requests with a 503 envelope once shutdown has begun', async () => {
    const server = { close: (cb) => cb() };
    const exit = jest.fn();

    const shutdownPromise = runGracefulShutdown({ server, timeoutMs: 1000, exit });

    const { req, res } = makeReqRes();
    const next = jest.fn();
    trackInFlightRequests(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: 'SERVER_SHUTTING_DOWN',
        message: expect.any(String),
      },
    });
    expect(res.set).toHaveBeenCalledWith('Retry-After', '5');

    await shutdownPromise;
  });
});

// ── runGracefulShutdown ───────────────────────────────────────────────────────

describe('runGracefulShutdown', () => {
  it('transitions running -> draining -> closed and calls server.close()', async () => {
    const closeServer = jest.fn((cb) => cb());
    const server = { close: closeServer };
    const exit = jest.fn();

    expect(getShutdownState().status).toBe('running');

    await runGracefulShutdown({ server, timeoutMs: 1000, exit });

    expect(closeServer).toHaveBeenCalled();
    expect(getShutdownState().status).toBe('closed');
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('waits for in-flight requests to drain before running cleanup tasks', async () => {
    const { req, res } = makeReqRes();
    trackInFlightRequests(req, res, jest.fn());
    expect(getShutdownState().inFlightRequests).toBe(1);

    const order = [];
    registerCleanup('probe', async () => {
      order.push(`cleanup:inflight=${getShutdownState().inFlightRequests}`);
    });

    const server = { close: (cb) => cb() };
    const exit = jest.fn();

    const shutdownPromise = runGracefulShutdown({
      server,
      timeoutMs: 2000,
      pollIntervalMs: 10,
      exit,
    });

    // Finish the in-flight request shortly after shutdown begins.
    setTimeout(() => res.emit('finish'), 30);

    await shutdownPromise;

    expect(order).toEqual(['cleanup:inflight=0']);
  });

  it('runs registered cleanup tasks in registration order and tolerates failures', async () => {
    const order = [];
    registerCleanup('first', async () => {
      order.push('first');
    });
    registerCleanup('second', async () => {
      throw new Error('boom');
    });
    registerCleanup('third', async () => {
      order.push('third');
    });

    const server = { close: (cb) => cb() };
    const exit = jest.fn();

    await runGracefulShutdown({ server, timeoutMs: 1000, exit });

    expect(order).toEqual(['first', 'third']);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('force-exits with code 1 if drain exceeds the timeout', async () => {
    const { req, res } = makeReqRes();
    trackInFlightRequests(req, res, jest.fn());
    // Never emit finish/close — request hangs forever.

    const server = { close: (cb) => cb() };
    const exit = jest.fn();

    await runGracefulShutdown({ server, timeoutMs: 30, pollIntervalMs: 5, exit });

    expect(exit).toHaveBeenCalledWith(1);
  });

  it('is a no-op if shutdown has already been initiated', async () => {
    const server = { close: jest.fn((cb) => cb()) };
    const exit = jest.fn();

    await runGracefulShutdown({ server, timeoutMs: 1000, exit });
    await runGracefulShutdown({ server, timeoutMs: 1000, exit });

    expect(server.close).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledTimes(1);
  });
});

// ── getShutdownState ──────────────────────────────────────────────────────────

describe('getShutdownState', () => {
  it('reports status=running and null drainStartedAt before shutdown', () => {
    const state = getShutdownState();
    expect(state.status).toBe('running');
    expect(state.drainStartedAt).toBeNull();
    expect(typeof state.uptimeSeconds).toBe('number');
  });

  it('sets drainStartedAt once shutdown begins', async () => {
    const server = { close: (cb) => cb() };
    await runGracefulShutdown({ server, timeoutMs: 1000, exit: jest.fn() });

    expect(getShutdownState().drainStartedAt).toEqual(expect.any(String));
  });
});
