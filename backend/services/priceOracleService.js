'use strict';

const crypto = require('crypto');

// Bounded metric names for oracle price ingestion telemetry.
const METRIC_PREFIX = 'oracle.price_ingestion';
const METRIC_OUTCOMES = Object.freeze({
  SUCCESS: `${METRIC_PREFIX}.success`,
  FETCH_ERROR: `${METRIC_PREFIX}.fetch_error`,
  INVALID_DATA: `${METRIC_PREFIX}.invalid_data`,
  STALE_DATA: `${METRIC_PREFIX}.stale_data`,
});

// Maximum age (ms) before a price snapshot is considered stale.
const DEFAULT_MAX_PRICE_AGE_MS = 5 * 60 * 1000;

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

class PriceOracleService {
  constructor({ fetchPrice, metrics, logger, maxPriceAgeMs } = {}) {
    this.fetchPrice = fetchPrice;
    this.metrics = metrics || { increment: () => {} };
    this.logger = logger || { info: () => {}, warn: () => {}, error: () => {} };
    this.maxPriceAgeMs = Number.isFinite(maxPriceAgeMs)
      ? maxPriceAgeMs
      : DEFAULT_MAX_PRICE_AGE_MS;
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

  async ingestPrice({ source, symbol } = {}) {
    const correlationId = createCorrelationId();
    const safeSource = sanitizeSource(source);
    const baseFields = {
      correlationId,
      source: safeSource,
      symbol: typeof symbol === 'string' ? symbol.slice(0, 32) : 'unknown',
    };

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
};
