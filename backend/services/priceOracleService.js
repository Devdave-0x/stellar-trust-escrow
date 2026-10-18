'use strict';

const crypto = require('crypto');

// Bounded metric names for oracle price ingestion telemetry.
const METRIC_PREFIX = 'oracle.price_ingestion';
const METRIC_OUTCOMES = Object.freeze({
  SUCCESS: `${METRIC_PREFIX}.success`,
  FETCH_ERROR: `${METRIC_PREFIX}.fetch_error`,
  INVALID_DATA: `${METRIC_PREFIX}.invalid_data`,
  STALE_DATA: `${METRIC_PREFIX}.stale_data`,
  DUPLICATE: `${METRIC_PREFIX}.duplicate`,
});

// Maximum age (ms) before a price snapshot is considered stale.
const DEFAULT_MAX_PRICE_AGE_MS = 5 * 60 * 1000;

// How long a completed ingestion result is remembered for dedupe (ms).
const DEFAULT_IDEMPOTENCY_TTL_MS = 10 * 60 * 1000;

function createCorrelationId() {
  return crypto.randomBytes(8).toString('hex');
}

function sanitizeSource(source) {
  if (typeof source !== 'string' || source.length === 0) {
    return 'unknown';
  }
  // Strip any credentials/query strings from URLs before logging.
  try {
    const url = new URL(source);
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch (_err) {
    return source.slice(0, 64);
  }
}

function buildIdempotencyKey({ idempotencyKey, source, symbol }) {
  if (typeof idempotencyKey === 'string' && idempotencyKey.length > 0) {
    return `key:${idempotencyKey.slice(0, 128)}`;
  }
  const safeSource = sanitizeSource(source);
  const safeSymbol = typeof symbol === 'string' ? symbol.slice(0, 32) : 'unknown';
  return `src:${safeSource}|sym:${safeSymbol}`;
}

class PriceOracleService {
  constructor({ fetchPrice, metrics, logger, maxPriceAgeMs, idempotencyTtlMs } = {}) {
    this.fetchPrice = fetchPrice;
    this.metrics = metrics || { increment: () => {} };
    this.logger = logger || { info: () => {}, warn: () => {}, error: () => {} };
    this.maxPriceAgeMs = Number.isFinite(maxPriceAgeMs)
      ? maxPriceAgeMs
      : DEFAULT_MAX_PRICE_AGE_MS;
    this.idempotencyTtlMs = Number.isFinite(idempotencyTtlMs)
      ? idempotencyTtlMs
      : DEFAULT_IDEMPOTENCY_TTL_MS;
    // key -> { promise } for in-flight requests; key -> { result, expiresAt } for completed.
    this._inFlight = new Map();
    this._completed = new Map();
  }

  _emitMetric(name, tags) {
    try {
      this.metrics.increment(name, tags);
    } catch (_err) {
      // Telemetry must never break ingestion.
    }
  }

  _log(level, message, fields) {
    try {
      this.logger[level](message, fields);
    } catch (_err) {
      // Telemetry must never break ingestion.
    }
  }

  _pruneCompleted(now) {
    for (const [key, entry] of this._completed) {
      if (entry.expiresAt <= now) {
        this._completed.delete(key);
      }
    }
  }

  async ingestPrice({ source, symbol, idempotencyKey } = {}) {
    const correlationId = createCorrelationId();
    const safeSource = sanitizeSource(source);
    const baseFields = {
      correlationId,
      source: safeSource,
      symbol: typeof symbol === 'string' ? symbol.slice(0, 32) : 'unknown',
    };

    const key = buildIdempotencyKey({ idempotencyKey, source, symbol });
    const now = Date.now();
    this._pruneCompleted(now);

    const completed = this._completed.get(key);
    if (completed) {
      this._emitMetric(METRIC_OUTCOMES.DUPLICATE, { source: safeSource });
      this._log('info', 'oracle price ingestion deduplicated', {
        ...baseFields,
        reason: 'completed_duplicate',
      });
      return { ...completed.result, correlationId };
    }

    const inFlight = this._inFlight.get(key);
    if (inFlight) {
      this._emitMetric(METRIC_OUTCOMES.DUPLICATE, { source: safeSource });
      this._log('info', 'oracle price ingestion deduplicated', {
        ...baseFields,
        reason: 'in_flight_duplicate',
      });
      const result = await inFlight;
      return { ...result, correlationId };
    }

    const task = this._ingestOnce({ source, symbol, correlationId, safeSource, baseFields });
    this._inFlight.set(key, task);

    try {
      const result = await task;
      this._completed.set(key, {
        result,
        expiresAt: Date.now() + this.idempotencyTtlMs,
      });
      return result;
    } finally {
      this._inFlight.delete(key);
    }
  }

  async _ingestOnce({ source, symbol, correlationId, safeSource, baseFields }) {
    let raw;
    try {
      raw = await this.fetchPrice({ source, symbol });
    } catch (err) {
      this._emitMetric(METRIC_OUTCOMES.FETCH_ERROR, { source: safeSource });
      this._log('error', 'oracle price fetch failed', {
        ...baseFields,
        error: err && err.name ? err.name : 'Error',
      });
      throw err;
    }

    const price = raw && typeof raw === 'object' ? raw.price : undefined;
    const timestamp = raw && typeof raw === 'object' ? raw.timestamp : undefined;

    if (!Number.isFinite(price) || price <= 0) {
      this._emitMetric(METRIC_OUTCOMES.INVALID_DATA, { source: safeSource });
      this._log('warn', 'oracle price invalid', {
        ...baseFields,
        reason: 'invalid_price',
      });
      throw new Error('Invalid oracle price data');
    }

    const ageMs = Number.isFinite(timestamp) ? Date.now() - timestamp : null;
    if (ageMs !== null && ageMs > this.maxPriceAgeMs) {
      this._emitMetric(METRIC_OUTCOMES.STALE_DATA, { source: safeSource });
      this._log('warn', 'oracle price stale', {
        ...baseFields,
        reason: 'stale_price',
        ageMs,
      });
      throw new Error('Stale oracle price data');
    }

    this._emitMetric(METRIC_OUTCOMES.SUCCESS, { source: safeSource });
    this._log('info', 'oracle price ingested', {
      ...baseFields,
      ageMs,
    });

    return { price, timestamp, correlationId };
  }
}

module.exports = {
  PriceOracleService,
  METRIC_OUTCOMES,
  DEFAULT_MAX_PRICE_AGE_MS,
  DEFAULT_IDEMPOTENCY_TTL_MS,
};
