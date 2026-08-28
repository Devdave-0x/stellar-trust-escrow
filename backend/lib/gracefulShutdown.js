/**
 * Graceful Shutdown Coordinator
 *
 * On SIGTERM/SIGINT:
 *   1. Flip state to 'draining' — /health/ready starts returning 503 so the
 *      load balancer stops routing new traffic, and trackInFlightRequests
 *      starts rejecting new requests with 503.
 *   2. Stop the HTTP server from accepting new connections.
 *   3. Wait for in-flight requests to finish (bounded by timeoutMs).
 *   4. Run registered cleanup tasks (BullMQ workers, Prisma, Redis, ...) in
 *      registration order.
 *   5. Exit. If any step overruns timeoutMs, force-exit(1) instead of
 *      hanging the process indefinitely.
 */

import { createModuleLogger } from '../config/logger.js';

const log = createModuleLogger('gracefulShutdown');

const cleanupTasks = [];

let inFlightRequests = 0;
let shuttingDown = false;

const shutdownState = {
  status: 'running', // 'running' | 'draining' | 'closed'
  drainStartedAt: null,
};

/**
 * Register an async cleanup task to run during shutdown, after in-flight
 * requests have drained. Tasks run sequentially in registration order;
 * a failing task is logged and does not block the remaining tasks.
 *
 * @param {string} name
 * @param {() => Promise<void>} fn
 */
export function registerCleanup(name, fn) {
  cleanupTasks.push({ name, fn });
}

/**
 * @returns {{ status: string, drainStartedAt: string|null, inFlightRequests: number, uptimeSeconds: number }}
 */
export function getShutdownState() {
  return {
    ...shutdownState,
    inFlightRequests,
    uptimeSeconds: Math.floor(process.uptime()),
  };
}

/**
 * Express middleware. Tracks in-flight requests while the server is
 * running, and rejects new requests with 503 once shutdown has begun.
 */
export function trackInFlightRequests(req, res, next) {
  if (shutdownState.status !== 'running') {
    res.set('Connection', 'close');
    res.set('Retry-After', '5');
    return res.status(503).json({
      error: {
        code: 'SERVER_SHUTTING_DOWN',
        message: 'Server is shutting down and not accepting new requests.',
      },
    });
  }

  inFlightRequests += 1;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    inFlightRequests -= 1;
  };
  res.once('finish', release);
  res.once('close', release);
  next();
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Runs the drain-and-cleanup sequence. Exposed directly (rather than only
 * via signal handlers) so it can be invoked deterministically in tests.
 *
 * @param {object} [opts]
 * @param {import('http').Server} [opts.server]
 * @param {string} [opts.signal]
 * @param {number} [opts.timeoutMs=30000]
 * @param {number} [opts.pollIntervalMs=100]
 * @param {(code: number) => void} [opts.exit] - defaults to process.exit
 */
export async function runGracefulShutdown({
  server,
  signal = 'SIGTERM',
  timeoutMs = 30000,
  pollIntervalMs = 100,
  exit = (code) => process.exit(code),
} = {}) {
  if (shuttingDown) return;
  shuttingDown = true;

  shutdownState.status = 'draining';
  shutdownState.drainStartedAt = new Date().toISOString();
  log.info({ signal, inFlightRequests }, 'Shutdown initiated, draining in-flight requests');

  let forced = false;
  const forceExitTimer = setTimeout(() => {
    forced = true;
    log.error({ signal, inFlightRequests }, 'Drain timeout exceeded, forcing exit');
    exit(1);
  }, timeoutMs);
  forceExitTimer.unref?.();

  if (server?.close) {
    await new Promise((resolve) => server.close(() => resolve()));
  }

  const deadline = Date.now() + timeoutMs;
  while (inFlightRequests > 0 && Date.now() < deadline) {
    await wait(pollIntervalMs);
  }
  if (inFlightRequests > 0) {
    log.warn({ inFlightRequests }, 'Drain deadline reached with requests still in flight');
  }

  for (const { name, fn } of cleanupTasks) {
    try {
      await fn();
      log.info({ task: name }, 'Cleanup task completed');
    } catch (err) {
      log.error({ err, task: name }, 'Cleanup task failed');
    }
  }

  clearTimeout(forceExitTimer);
  shutdownState.status = 'closed';

  if (!forced) {
    log.info({ signal }, 'Graceful shutdown complete');
    exit(0);
  }
}

/**
 * Wires SIGTERM/SIGINT to runGracefulShutdown. Call once at startup.
 *
 * @param {object} [opts] - forwarded to runGracefulShutdown (server, timeoutMs, pollIntervalMs, exit)
 */
export function initGracefulShutdown(opts = {}) {
  const exit = opts.exit ?? ((code) => process.exit(code));

  const wire = (signal) => {
    process.once(signal, () => {
      runGracefulShutdown({ ...opts, signal, exit }).catch((err) => {
        log.error({ err, signal }, 'Unexpected error during graceful shutdown');
        exit(1);
      });
    });
  };

  wire('SIGTERM');
  wire('SIGINT');
}

/** Test-only: reset module-level state between test cases. */
export function __resetForTests() {
  cleanupTasks.length = 0;
  inFlightRequests = 0;
  shuttingDown = false;
  shutdownState.status = 'running';
  shutdownState.drainStartedAt = null;
}

export default {
  registerCleanup,
  getShutdownState,
  trackInFlightRequests,
  runGracefulShutdown,
  initGracefulShutdown,
  __resetForTests,
};
