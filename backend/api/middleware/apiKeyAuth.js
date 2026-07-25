/**
 * API Key Auth Middleware
 *
 * Validates the `x-api-key` header against stored key hashes and enforces
 * the key's IP allowlist (allowedIps empty = allow all). Attaches
 * req.user = { address, apiKeyId } on success, mirroring the JWT auth shape.
 */

import apiKeyService from '../../services/apiKeyService.js';
import { isIpAllowed, normalizeIp } from '../../lib/cidr.js';
import { logControllerError } from '../../config/logger.js';

function getRequestIp(req) {
  return normalizeIp(req.ip || req.connection?.remoteAddress || '');
}

export default async function apiKeyAuth(req, res, next) {
  const rawKey = req.headers['x-api-key'];
  if (!rawKey || typeof rawKey !== 'string') {
    return res.status(401).json({ error: 'API key required' });
  }

  try {
    const apiKey = await apiKeyService.findByRawKey(rawKey);
    if (!apiKey || apiKey.revokedAt) {
      return res.status(401).json({ error: 'Invalid API key' });
    }

    const requestIp = getRequestIp(req);
    if (!isIpAllowed(requestIp, apiKey.allowedIps)) {
      return res.status(403).json({ error: 'IP not allowed' });
    }

    req.user = { address: apiKey.userId, apiKeyId: apiKey.id };
    apiKeyService.touchLastUsed(apiKey.id);
    next();
  } catch (err) {
    logControllerError('apiKeyAuth', err, req);
    res.status(500).json({ error: 'Authentication error' });
  }
}
