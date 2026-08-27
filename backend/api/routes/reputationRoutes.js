import express from 'express';
import reputationController from '../controllers/reputationController.js';
import { cacheResponse, TTL } from '../middleware/cache.js';
import { reputationSearchRateLimit } from '../../middleware/rateLimit.js';
import { createRedisSlidingWindowRateLimiter } from '../middleware/slidingRateLimiter.js';

const router = express.Router();
const leaderboardRateLimit = createRedisSlidingWindowRateLimiter({
  prefix: 'reputation-leaderboard',
  max: Number(process.env.REPUTATION_LEADERBOARD_RATE_LIMIT_PER_MINUTE || 30),
  windowMs: 60_000,
  message: 'Too many leaderboard requests, please try again later.',
});

/**
 * @route  GET /api/reputation/search?q=<prefix>
 * ES-backed address autocomplete + full-text search. Prisma fallback on outage.
 */
router.get('/search', reputationSearchRateLimit, reputationController.search);

/**
 * @route  GET /api/reputation/leaderboard
 */
router.get(
  '/leaderboard',
  leaderboardRateLimit,
  cacheResponse({ ttl: TTL.LEADERBOARD, tags: ['reputation:leaderboard'] }),
  reputationController.getLeaderboard,
);

/**
 * @route  POST /api/reputation/admin/recalculate
 * Admin-only: recompute all scores from event history
 */
router.post('/admin/recalculate', reputationController.recalculate);

/**
 * @route  GET /api/reputation/:address
 */
router.get(
  '/:address',
  cacheResponse({
    ttl: TTL.REPUTATION,
    tags: (req) => ['reputation', `reputation:${req.params.address}`],
  }),
  reputationController.getReputation,
);

export default router;
