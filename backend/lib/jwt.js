/**
 * JWT utility — single source-of-truth for token signing and verification.
 *
 * All code that needs to issue or verify a JWT should import from this module
 * rather than calling `jsonwebtoken` directly, so the algorithm pin and secret
 * selection are enforced in one place.
 *
 * Token types
 * ───────────
 *  • access  — short-lived wallet session token (default).  Signed with JWT_SECRET.
 *  • refresh — long-lived rotation token.  Signed with JWT_REFRESH_SECRET.
 *  • access_secret — signed with JWT_ACCESS_SECRET (WebSocket upgrades, etc.)
 *
 * @module lib/jwt
 */

import jwt from 'jsonwebtoken';
import {
  JWT_SECRET,
  JWT_ACCESS_SECRET,
  JWT_REFRESH_SECRET,
  JWT_ALGORITHM,
} from '../config/secrets.js';

const DEFAULT_ACCESS_EXPIRY = process.env.JWT_EXPIRES_IN || '24h';
const DEFAULT_REFRESH_EXPIRY = '7d';

/** Map token type → signing secret. */
function secretForType(type) {
  switch (type) {
    case 'refresh':
      return JWT_REFRESH_SECRET;
    case 'access_secret':
      return JWT_ACCESS_SECRET;
    case 'access':
    default:
      return JWT_SECRET;
  }
}

/**
 * Sign a JWT payload.
 *
 * @param {object} payload       — Claims to embed (must be a plain object).
 * @param {object} [options]
 * @param {'access'|'refresh'|'access_secret'} [options.type='access']
 *   Determines which secret is used.
 * @param {string|number} [options.expiresIn]
 *   Token lifetime.  Defaults to JWT_EXPIRES_IN (access) or 7d (refresh).
 * @param {string} [options.secret]
 *   Explicit secret override — use this in tests to sign with a known value.
 * @returns {string} Signed JWT string.
 */
export function signToken(payload, { type = 'access', expiresIn, secret } = {}) {
  const key = secret ?? secretForType(type);
  const defaultExpiry = type === 'refresh' ? DEFAULT_REFRESH_EXPIRY : DEFAULT_ACCESS_EXPIRY;
  return jwt.sign(payload, key, {
    algorithm: JWT_ALGORITHM,
    expiresIn: expiresIn ?? defaultExpiry,
  });
}

/**
 * Verify a JWT and return its decoded payload.
 *
 * Throws a `JsonWebTokenError` or `TokenExpiredError` on failure — callers
 * should catch these and map them to 401 responses.
 *
 * @param {string} token         — The raw JWT string.
 * @param {object} [options]
 * @param {'access'|'refresh'|'access_secret'} [options.type='access']
 * @param {string} [options.secret]   Explicit secret override.
 * @returns {object} Decoded JWT payload (plain object, not a JwtPayload instance).
 */
export function verifyToken(token, { type = 'access', secret } = {}) {
  const key = secret ?? secretForType(type);
  return jwt.verify(token, key, { algorithms: [JWT_ALGORITHM] });
}

/**
 * Decode a JWT without verifying its signature.
 * Use only for inspection (e.g. reading `exp` before deciding to refresh).
 *
 * @param {string} token
 * @returns {object|null} Decoded payload, or null if the token is not valid JWT format.
 */
export function decodeToken(token) {
  return jwt.decode(token);
}

export default { signToken, verifyToken, decodeToken };
