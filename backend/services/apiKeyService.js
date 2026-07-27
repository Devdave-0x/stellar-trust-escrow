/**
 * API Key Service
 *
 * Issues and looks up programmatic API keys. Follows the same "store only
 * the hash" pattern as refreshTokenService — the raw key is returned once
 * at creation and never persisted.
 */

import crypto from 'crypto';
import prisma from '../lib/prisma.js';

const KEY_BYTES = 32;
const KEY_PREFIX_LABEL = 'stk';
const DISPLAY_PREFIX_LENGTH = 12;

function generateRawKey() {
  return `${KEY_PREFIX_LABEL}_${crypto.randomBytes(KEY_BYTES).toString('hex')}`;
}

function hashKey(rawKey) {
  return crypto.createHash('sha256').update(rawKey).digest('hex');
}

async function createApiKey({ tenantId, userId, name, allowedIps = [] }) {
  const rawKey = generateRawKey();
  const keyHash = hashKey(rawKey);
  const keyPrefix = rawKey.slice(0, DISPLAY_PREFIX_LENGTH);

  const apiKey = await prisma.apiKey.create({
    data: { tenantId, userId, name, keyHash, keyPrefix, allowedIps },
  });

  return { rawKey, apiKey };
}

async function findByRawKey(rawKey) {
  const keyHash = hashKey(rawKey);
  return prisma.apiKey.findUnique({ where: { keyHash } });
}

/** Best-effort — a failed lastUsedAt write should never break the request. */
async function touchLastUsed(id) {
  await prisma.apiKey.update({ where: { id }, data: { lastUsedAt: new Date() } }).catch(() => {});
}

export default { generateRawKey, hashKey, createApiKey, findByRawKey, touchLastUsed };
