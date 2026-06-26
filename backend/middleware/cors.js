/**
 * Hardened CORS middleware with environment-specific origin allowlist.
 *
 * Env:
 *   ALLOWED_ORIGINS   — comma-separated list of allowed origins.
 *                       Overrides the per-environment defaults when set.
 *   NODE_ENV          — determines which default allowlist is used when
 *                       ALLOWED_ORIGINS is not set.
 *
 * Behaviour:
 *   - Only origins on the allowlist receive CORS headers.
 *   - Requests from unlisted origins are logged at warn level and receive no
 *     CORS headers (browser blocks them).
 *   - OPTIONS preflight is handled automatically by the cors package and
 *     returns 204 with the correct Access-Control-Allow-Headers.
 *   - Vary: Origin is always set so CDNs cache responses per-origin.
 */

import cors from 'cors';
import logger from '../config/logger.js';

/** Origins allowed in each environment when ALLOWED_ORIGINS is not set. */
const DEFAULTS = {
  production: [],          // must be supplied via ALLOWED_ORIGINS in production
  staging: [
    'https://staging.stellar-trust-escrow.app',
  ],
  development: [
    'http://localhost:3000',
    'http://localhost:3001',
  ],
};

const CUSTOM_HEADERS = [
  'Authorization',
  'Content-Type',
  'Idempotency-Key',
  'X-Tenant-ID',
  'X-Request-Id',
  'X-CSRF-Token',
];

/**
 * Build the allowlist from the env or environment defaults.
 * Returns a Set<string> for O(1) lookup.
 */
export function buildAllowlist() {
  if (process.env.ALLOWED_ORIGINS) {
    return new Set(
      process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean),
    );
  }

  const env = process.env.NODE_ENV || 'development';
  const defaults = DEFAULTS[env] ?? DEFAULTS.development;

  if (env === 'production' && defaults.length === 0) {
    logger.warn(
      'CORS: NODE_ENV=production but ALLOWED_ORIGINS is not set — all cross-origin requests will be blocked.',
    );
  }

  return new Set(defaults);
}

/**
 * Create a cors() middleware instance bound to a specific allowlist Set.
 * Exposed for testing; normal usage should call buildAllowlist() internally.
 */
export function createCorsMiddleware(allowlist) {
  return cors({
    origin(origin, callback) {
      // Same-origin / server-to-server requests have no Origin header — allow through.
      if (!origin) return callback(null, false);

      if (allowlist.has(origin)) {
        return callback(null, true);
      }

      logger.warn({ origin }, 'CORS: request from non-allowlisted origin blocked');
      return callback(null, false);
    },
    credentials: true,
    allowedHeaders: CUSTOM_HEADERS,
    exposedHeaders: ['X-Request-Id', 'Retry-After'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    maxAge: 86400, // browsers cache preflight for 24 h
  });
}

/** Default export — singleton middleware built from current env. */
export const corsMiddleware = createCorsMiddleware(buildAllowlist());
