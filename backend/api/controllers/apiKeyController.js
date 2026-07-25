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
  lastUsedAt: true,
  createdAt: true,
  updatedAt: true,
};

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

    const { name, allowedIps = [] } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'name is required' });
    }

    const validation = validateAllowedIps(allowedIps);
    if (!validation.valid) return res.status(400).json({ error: validation.error });

    const { rawKey, apiKey } = await apiKeyService.createApiKey({
      tenantId: req.tenant?.id,
      userId: address,
      name: name.trim(),
      allowedIps,
    });

    res.status(201).json({
      id: apiKey.id,
      name: apiKey.name,
      key: rawKey,
      keyPrefix: apiKey.keyPrefix,
      allowedIps: apiKey.allowedIps,
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
    const { name, allowedIps } = req.body;

    const existing = await prisma.apiKey.findFirst({ where: { id, userId: address } });
    if (!existing) return res.status(404).json({ error: 'API key not found' });

    const validation = validateAllowedIps(allowedIps);
    if (!validation.valid) return res.status(400).json({ error: validation.error });

    const data = {};
    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ error: 'name must be a non-empty string' });
      }
      data.name = name.trim();
    }
    if (allowedIps !== undefined) data.allowedIps = allowedIps;

    const updated = await prisma.apiKey.update({ where: { id }, data, select: KEY_LIST_SELECT });
    res.json(updated);
  } catch (err) {
    logControllerError('apiKey.updateKey', err, req);
    res.status(500).json({ error: err.message });
  }
};

export default { createKey, listKeys, updateKey };
