/**
 * Upstream Timeout Utilities
 *
 * Provides Promise.race-based timeouts for downstream service calls.
 * On expiry a TimeoutError is thrown; the global error handler converts
 * these to HTTP 504 with body { error: { code: "UPSTREAM_TIMEOUT", message } }.
 *
 * Configured thresholds (overridable via env vars):
 *   HORIZON_TIMEOUT_MS  — Stellar/Horizon HTTP calls  (default: 5 000 ms)
 *   DB_TIMEOUT_MS       — PostgreSQL queries           (default: 3 000 ms)
 *   REDIS_TIMEOUT_MS    — Redis commands               (default: 1 000 ms)
 */

import logger from '../config/logger.js';

export const HORIZON_TIMEOUT_MS = parseInt(process.env.HORIZON_TIMEOUT_MS || '5000', 10);
export const DB_TIMEOUT_MS = parseInt(process.env.DB_TIMEOUT_MS || '3000', 10);
export const REDIS_TIMEOUT_MS = parseInt(process.env.REDIS_TIMEOUT_MS || '1000', 10);

export class TimeoutError extends Error {
  constructor(operation, elapsedMs) {
    super(`Upstream timeout: ${operation} did not respond within ${elapsedMs}ms`);
    this.name = 'TimeoutError';
    this.code = 'UPSTREAM_TIMEOUT';
    this.operation = operation;
    this.elapsedMs = elapsedMs;
    this.statusCode = 504;
  }
}

/**
 * Races `promise` against a deadline of `ms` milliseconds.
 * On expiry: logs at error level and throws TimeoutError.
 *
 * @param {Promise<any>} promise   — the downstream call
 * @param {number}       ms        — timeout in milliseconds
 * @param {string}       operation — human-readable label for logging
 */
export async function withTimeout(promise, ms, operation) {
  const start = Date.now();
  let timer;

  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const elapsed = Date.now() - start;
      logger.error({
        message: 'upstream_timeout',
        operation,
        elapsedMs: elapsed,
        thresholdMs: ms,
      });
      reject(new TimeoutError(operation, elapsed));
    }, ms);
  });

  try {
    const result = await Promise.race([promise, timeout]);
    clearTimeout(timer);
    return result;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

export const withHorizonTimeout = (promise, operation = 'horizon') =>
  withTimeout(promise, HORIZON_TIMEOUT_MS, operation);

export const withDbTimeout = (promise, operation = 'database') =>
  withTimeout(promise, DB_TIMEOUT_MS, operation);

export const withRedisTimeout = (promise, operation = 'redis') =>
  withTimeout(promise, REDIS_TIMEOUT_MS, operation);
