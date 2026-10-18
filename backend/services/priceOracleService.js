'use strict';

const DEFAULT_CONFIG = {
  enabled: true,
  pollIntervalMs: 60000,
  minPollIntervalMs: 5000,
  maxPollIntervalMs: 3600000,
  staleThresholdMs: 300000,
  maxPriceDeviationBps: 1000,
  minPrice: 0,
  maxPrice: Number.MAX_SAFE_INTEGER,
  sources: [],
};

class OracleConfigError extends Error {
  constructor(message, field) {
    super(message);
    this.name = 'OracleConfigError';
    this.field = field;
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireFiniteNumber(config, field, { min, max, integer } = {}) {
  const value = config[field];
  if (value === undefined || value === null) {
    throw new OracleConfigError(
      `Oracle config "${field}" is required but was not provided.`,
      field
    );
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new OracleConfigError(
      `Oracle config "${field}" must be a finite number, received ${describeValue(value)}.`,
      field
    );
  }
  if (integer && !Number.isInteger(value)) {
    throw new OracleConfigError(
      `Oracle config "${field}" must be an integer, received ${describeValue(value)}.`,
      field
    );
  }
  if (min !== undefined && value < min) {
    throw new OracleConfigError(
      `Oracle config "${field}" must be >= ${min}, received ${value}.`,
      field
    );
  }
  if (max !== undefined && value > max) {
    throw new OracleConfigError(
      `Oracle config "${field}" must be <= ${max}, received ${value}.`,
      field
    );
  }
  return value;
}

function describeValue(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function validateOracleConfig(rawConfig) {
  if (rawConfig !== undefined && rawConfig !== null && !isPlainObject(rawConfig)) {
    throw new OracleConfigError(
      `Oracle config must be an object, received ${describeValue(rawConfig)}.`,
      'config'
    );
  }

  const config = { ...DEFAULT_CONFIG, ...(rawConfig || {}) };

  if (typeof config.enabled !== 'boolean') {
    throw new OracleConfigError(
      `Oracle config "enabled" must be a boolean, received ${describeValue(config.enabled)}.`,
      'enabled'
    );
  }

  requireFiniteNumber(config, 'minPollIntervalMs', { min: 1, integer: true });
  requireFiniteNumber(config, 'maxPollIntervalMs', { min: 1, integer: true });
  requireFiniteNumber(config, 'pollIntervalMs', { min: 1, integer: true });
  requireFiniteNumber(config, 'staleThresholdMs', { min: 1, integer: true });
  requireFiniteNumber(config, 'maxPriceDeviationBps', { min: 0, max: 10000, integer: true });
  requireFiniteNumber(config, 'minPrice', { min: 0 });
  requireFiniteNumber(config, 'maxPrice', { min: 0 });

  if (config.minPollIntervalMs > config.maxPollIntervalMs) {
    throw new OracleConfigError(
      `Oracle config "minPollIntervalMs" (${config.minPollIntervalMs}) must be <= "maxPollIntervalMs" (${config.maxPollIntervalMs}).`,
      'minPollIntervalMs'
    );
  }

  if (config.pollIntervalMs < config.minPollIntervalMs || config.pollIntervalMs > config.maxPollIntervalMs) {
    throw new OracleConfigError(
      `Oracle config "pollIntervalMs" (${config.pollIntervalMs}) must be between "minPollIntervalMs" (${config.minPollIntervalMs}) and "maxPollIntervalMs" (${config.maxPollIntervalMs}).`,
      'pollIntervalMs'
    );
  }

  if (config.staleThresholdMs < config.pollIntervalMs) {
    throw new OracleConfigError(
      `Oracle config "staleThresholdMs" (${config.staleThresholdMs}) must be >= "pollIntervalMs" (${config.pollIntervalMs}).`,
      'staleThresholdMs'
    );
  }

  if (config.minPrice > config.maxPrice) {
    throw new OracleConfigError(
      `Oracle config "minPrice" (${config.minPrice}) must be <= "maxPrice" (${config.maxPrice}).`,
      'minPrice'
    );
  }

  if (!Array.isArray(config.sources)) {
    throw new OracleConfigError(
      `Oracle config "sources" must be an array, received ${describeValue(config.sources)}.`,
      'sources'
    );
  }

  if (config.enabled && config.sources.length === 0) {
    throw new OracleConfigError(
      'Oracle config "sources" must contain at least one source when ingestion is enabled.',
      'sources'
    );
  }

  const seenSources = new Set();
  config.sources.forEach((source, index) => {
    if (typeof source !== 'string' || source.trim() === '') {
      throw new OracleConfigError(
        `Oracle config "sources[${index}]" must be a non-empty string, received ${describeValue(source)}.`,
        `sources[${index}]`
      );
    }
    const normalized = source.trim();
    if (seenSources.has(normalized)) {
      throw new OracleConfigError(
        `Oracle config "sources[${index}]" duplicates source "${normalized}".`,
        `sources[${index}]`
      );
    }
    seenSources.add(normalized);
  });

  return {
    ...config,
    sources: config.sources.map((source) => source.trim()),
  };
}

module.exports = {
  DEFAULT_CONFIG,
  OracleConfigError,
  validateOracleConfig,
};
