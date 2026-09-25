/**
 * API Key Controller
 *
 * Lets an authenticated user create, list, and update their own API keys,
 * including the CIDR-based allowedIps restriction.
 */

import prisma from '../../lib/prisma.js';
import apiKeyService from '../../services/apiKeyService.js';
import { isValidCidr } from '../../lib/cidr.js';
import { logControllerError } from '../../config/logger.js';

const KEY_LIST_SELECT = {
  id: true,
  name: true,
  keyPrefix: true,
  allowedIps: true,
  scopes: true,
  lastUsedAt: true,
  createdAt: true,
  updatedAt: true,
};

const ALLOWED_SCOPES = new Set(['read', 'read:escrows', 'read:webhooks', 'write:webhooks']);

function validateScopes(scopes) {
  if (scopes === undefined) return { valid: true, value: ['read'] };
  if (!Array.isArray(scopes) || scopes.length === 0) {
    return { valid: false, error: 'scopes must be a non-empty array' };
  }
  const invalid = scopes.filter((scope) => !ALLOWED_SCOPES.has(scope));
  if (invalid.length > 0) return { valid: false, error: `Invalid scopes: ${invalid.join(', ')}` };
  return { valid: true, value: [...new Set(scopes)] };
}

function validateAllowedIps(allowedIps) {
  if (allowedIps === undefined) return { valid: true };
  if (!Array.isArray(allowedIps)) {
    return { valid: false, error: 'allowedIps must be an array of CIDR or IP strings' };
  }
  const invalid = allowedIps.filter((entry) => !isValidCidr(entry));
  if (invalid.length > 0) {
    return { valid: false, error: `Invalid CIDR/IP entries: ${invalid.join(', ')}` };
  }
  return { valid: true };
}

/**
 * POST /api/v1/api-keys
 * Creates a new API key for the requesting user. The raw key is returned
 * once and never retrievable again.
 */
const createKey = async (req, res) => {
  try {
    const address = req.user?.address;
    if (!address) return res.status(401).json({ error: 'Authentication required' });

    const { name, allowedIps = [], scopes } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'name is required' });
    }

    const validation = validateAllowedIps(allowedIps);
    if (!validation.valid) return res.status(400).json({ error: validation.error });
    const scopeValidation = validateScopes(scopes);
    if (!scopeValidation.valid) return res.status(400).json({ error: scopeValidation.error });

    const { rawKey, apiKey } = await apiKeyService.createApiKey({
      tenantId: req.tenant?.id,
      userId: address,
      name: name.trim(),
      allowedIps,
      scopes: scopeValidation.value,
    });

    res.status(201).json({
      id: apiKey.id,
      name: apiKey.name,
      key: rawKey,
      keyPrefix: apiKey.keyPrefix,
      allowedIps: apiKey.allowedIps,
      scopes: apiKey.scopes,
      createdAt: apiKey.createdAt,
    });
  } catch (err) {
    logControllerError('apiKey.createKey', err, req);
    res.status(500).json({ error: err.message });
  }
};

/**
 * GET /api/v1/api-keys
 * Lists the requesting user's own (non-revoked) API keys. Never returns the raw key.
 */
const listKeys = async (req, res) => {
  try {
    const address = req.user?.address;
    if (!address) return res.status(401).json({ error: 'Authentication required' });

    const keys = await prisma.apiKey.findMany({
      where: { userId: address, revokedAt: null },
      select: KEY_LIST_SELECT,
      orderBy: { createdAt: 'desc' },
    });

    res.json({ data: keys });
  } catch (err) {
    logControllerError('apiKey.listKeys', err, req);
    res.status(500).json({ error: err.message });
  }
};

/**
 * PATCH /api/v1/api-keys/:id
 * Updates name and/or allowedIps on a key owned by the requesting user.
 */
const updateKey = async (req, res) => {
  try {
    const address = req.user?.address;
    if (!address) return res.status(401).json({ error: 'Authentication required' });

    const { id } = req.params;
    const { name, allowedIps, scopes } = req.body;

    const existing = await prisma.apiKey.findFirst({ where: { id, userId: address } });
    if (!existing) return res.status(404).json({ error: 'API key not found' });

    const validation = validateAllowedIps(allowedIps);
    if (!validation.valid) return res.status(400).json({ error: validation.error });
    const scopeValidation = validateScopes(scopes);
    if (!scopeValidation.valid) return res.status(400).json({ error: scopeValidation.error });

    const data = {};
    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ error: 'name must be a non-empty string' });
      }
      data.name = name.trim();
    }
    if (allowedIps !== undefined) data.allowedIps = allowedIps;
    if (scopes !== undefined) data.scopes = scopeValidation.value;

    const updated = await prisma.apiKey.update({ where: { id }, data, select: KEY_LIST_SELECT });
    res.json(updated);
  } catch (err) {
    logControllerError('apiKey.updateKey', err, req);
    res.status(500).json({ error: err.message });
  }
};

/**
 * DELETE /api/v1/api-keys/:id
 * Revokes an API key owned by the requesting user. The key remains in the
 * database for audit purposes but can no longer authenticate requests.
 */
const revokeKey = async (req, res) => {
  try {
    const address = req.user?.address;
    if (!address) return res.status(401).json({ error: 'Authentication required' });

    const result = await prisma.apiKey.updateMany({
      where: { id: req.params.id, userId: address, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    if (result.count === 0) return res.status(404).json({ error: 'API key not found' });
    return res.status(204).send();
  } catch (err) {
    logControllerError('apiKey.revokeKey', err, req);
    return res.status(500).json({ error: err.message });
  }
};

export default { createKey, listKeys, updateKey, revokeKey };
