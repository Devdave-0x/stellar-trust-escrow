/**
 * Config Service
 *
 * Platform-wide configuration (fee rates, limits, feature toggles) backed by
 * the system_config table. Reads are cached in Redis (30s TTL, via cacheService)
 * so ConfigService.get(key) can be called freely across the app.
 *
 * @module services/configService
 */

import prisma from '../lib/prisma.js';
import cache from '../lib/cache.js';

const CACHE_PREFIX = 'system-config:';
const CACHE_TTL_SECONDS = 30;

/** Per-key type schema used to validate admin updates and cast read values. */
export const CONFIG_SCHEMA = {
  platform_fee_percent: 'number',
  min_escrow_amount: 'number',
  max_escrow_amount: 'number',
  maintenance_mode: 'boolean',
  kyc_required: 'boolean',
};

function castValue(key, rawValue) {
  const type = CONFIG_SCHEMA[key];
  if (type === 'number') return Number(rawValue);
  if (type === 'boolean') return rawValue === 'true';
  return rawValue;
}

/**
 * Validates a value against a key's declared type. Throws if invalid.
 * @param {string} key
 * @param {string} value - always stored/passed as a string
 */
function validateType(key, value) {
  const type = CONFIG_SCHEMA[key];
  if (!type) throw new Error(`Unknown config key: ${key}`);

  if (type === 'number' && (value === '' || Number.isNaN(Number(value)))) {
    throw new Error(`Value for "${key}" must be a number.`);
  }
  if (type === 'boolean' && value !== 'true' && value !== 'false') {
    throw new Error(`Value for "${key}" must be a boolean ("true" or "false").`);
  }
}

/**
 * Reads a single config value, cached for 30s.
 * @param {string} key
 * @returns {Promise<any>} the value cast to its declared type
 */
async function get(key) {
  const cacheKey = `${CACHE_PREFIX}${key}`;
  const cached = await cache.get(cacheKey);
  if (cached !== null && cached !== undefined) return cached.value;

  const row = await prisma.systemConfig.findUnique({ where: { key } });
  if (!row) return undefined;

  const value = castValue(key, row.value);
  await cache.set(cacheKey, { value }, CACHE_TTL_SECONDS);
  return value;
}

/**
 * Returns all config rows as stored (raw string values, plus metadata).
 */
async function getAll() {
  return prisma.systemConfig.findMany({ orderBy: { key: 'asc' } });
}

/**
 * Updates a config value. Validates against CONFIG_SCHEMA and invalidates the cache.
 * @param {string} key
 * @param {string} value
 * @param {string} updatedBy
 * @returns {Promise<object>} the updated row
 */
async function set(key, value, updatedBy) {
  validateType(key, String(value));

  const existing = await prisma.systemConfig.findUnique({ where: { key } });
  if (!existing) throw new Error(`Unknown config key: ${key}`);

  const updated = await prisma.systemConfig.update({
    where: { key },
    data: { value: String(value), updatedBy },
  });

  await cache.invalidate(`${CACHE_PREFIX}${key}`);
  return updated;
}

export default { get, getAll, set, CONFIG_SCHEMA };
