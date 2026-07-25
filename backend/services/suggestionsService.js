/**
 * Search Suggestions Service
 *
 * Ranks autocomplete candidates (prefix matches before substring matches)
 * and caches the final response per user+query in Redis.
 *
 * @module services/suggestionsService
 */

import Redis from 'ioredis';

const CACHE_TTL_SECONDS = 30;
const CATEGORY_LIMIT = 5;
const CANDIDATE_POOL = 25;

// ── Redis client (shared, lazy-connected, falls back to no-cache) ─────────────

let redis = null;

function getRedis() {
  if (redis) return redis;
  const url = process.env.REDIS_URL;
  if (!url) return null;
  redis = new Redis(url, { lazyConnect: true, enableOfflineQueue: false });
  redis.on('error', (err) => {
    console.warn('[Suggestions] Redis error, bypassing cache:', err.message);
    redis = null;
  });
  return redis;
}

function cacheKey(userId, query) {
  return `suggestions:${userId}:${query}`;
}

async function getCached(userId, query) {
  const client = getRedis();
  if (!client) return null;
  try {
    const raw = await client.get(cacheKey(userId, query));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function setCached(userId, query, value) {
  const client = getRedis();
  if (!client) return;
  try {
    await client.set(cacheKey(userId, query), JSON.stringify(value), 'EX', CACHE_TTL_SECONDS);
  } catch {
    // best-effort cache — ignore failures
  }
}

/**
 * Ranks candidates so prefix matches (against `textOf(item)`) sort before
 * substring-only matches, then truncates to the category limit.
 */
function rankAndLimit(items, query, textOf, limit = CATEGORY_LIMIT) {
  const q = query.toLowerCase();
  return items
    .map((item, index) => ({
      item,
      index,
      rank: textOf(item).toLowerCase().startsWith(q) ? 0 : 1,
    }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .slice(0, limit)
    .map((entry) => entry.item);
}

/**
 * Builds ranked, category-limited suggestions for a query, using the cache
 * when available.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {number|string} userId
 * @param {string} rawQuery
 * @returns {Promise<{ escrows: object[], users: object[], tags: object[] }>}
 */
async function getSuggestions(prisma, userId, rawQuery) {
  const query = (rawQuery || '').trim();
  if (query.length < 2) {
    return { escrows: [], users: [], tags: [] };
  }

  const normalizedQuery = query.toLowerCase();
  const cached = await getCached(userId, normalizedQuery);
  if (cached) return cached;

  const [escrowCandidates, userCandidates, tagCandidates] = await Promise.all([
    prisma.escrow.findMany({
      where: { title: { contains: query, mode: 'insensitive' } },
      select: { id: true, title: true },
      take: CANDIDATE_POOL,
    }),
    prisma.userProfile.findMany({
      where: { displayName: { contains: query, mode: 'insensitive' } },
      select: { address: true, displayName: true },
      take: CANDIDATE_POOL,
    }),
    prisma.tag.findMany({
      where: { name: { contains: query, mode: 'insensitive' } },
      select: { id: true, name: true },
      take: CANDIDATE_POOL,
    }),
  ]);

  const result = {
    escrows: rankAndLimit(escrowCandidates, query, (e) => e.title ?? '').map((e) => ({
      id: e.id.toString(),
      title: e.title,
    })),
    users: rankAndLimit(userCandidates, query, (u) => u.displayName ?? '').map((u) => ({
      address: u.address,
      name: u.displayName,
    })),
    tags: rankAndLimit(tagCandidates, query, (t) => t.name ?? '').map((t) => ({
      id: t.id,
      name: t.name,
    })),
  };

  await setCached(userId, normalizedQuery, result);
  return result;
}

export default { getSuggestions, rankAndLimit };
