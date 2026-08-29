/**
 * Integration test for api/routes/reputationRoutes.js
 *
 * Exercises the full happy-path flow through the router: search ->
 * leaderboard -> single-address lookup -> admin recalculate. Controller,
 * cache and rate-limit middleware are mocked so the test runs in-process
 * without a real database, Redis or Elasticsearch instance.
 */

import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const ADDRESS = `G${'A'.repeat(55)}`;

const mockGetReputation = jest.fn((req, res) =>
  res.json({ address: ADDRESS, totalScore: 120, completedEscrows: 3 }),
);
const mockGetLeaderboard = jest.fn((req, res) =>
  res.json({ data: [{ rank: 1, fullAddress: ADDRESS, totalScore: 120 }], total: 1 }),
);
const mockSearch = jest.fn((req, res) => res.json({ data: [{ address: ADDRESS }], total: 1 }));
const mockRecalculate = jest.fn((req, res) =>
  res.json({ success: true, message: 'Reputation scores recalculated from event history' }),
);

jest.unstable_mockModule('../api/controllers/reputationController.js', () => ({
  default: {
    getReputation: mockGetReputation,
    getLeaderboard: mockGetLeaderboard,
    search: mockSearch,
    recalculate: mockRecalculate,
  },
}));

jest.unstable_mockModule('../api/middleware/cache.js', () => ({
  cacheResponse: () => (req, res, next) => next(),
  TTL: { LEADERBOARD: 60, REPUTATION: 60 },
}));

jest.unstable_mockModule('../middleware/rateLimit.js', () => ({
  reputationSearchRateLimit: (req, res, next) => next(),
}));

jest.unstable_mockModule('../api/middleware/slidingRateLimiter.js', () => ({
  createRedisSlidingWindowRateLimiter: () => (req, res, next) => next(),
}));

const { default: reputationRoutes } = await import('../api/routes/reputationRoutes.js');

const app = express();
app.use(express.json());
app.use('/api/reputation', reputationRoutes);

beforeEach(() => {
  jest.clearAllMocks();
});

describe('reputationRoutes — happy path end to end', () => {
  it('walks search -> leaderboard -> address lookup -> admin recalculate', async () => {
    const searchRes = await request(app).get('/api/reputation/search?q=GA');
    expect(searchRes.status).toBe(200);
    expect(searchRes.body.data[0].address).toBe(ADDRESS);
    expect(mockSearch).toHaveBeenCalledTimes(1);

    const leaderboardRes = await request(app).get('/api/reputation/leaderboard');
    expect(leaderboardRes.status).toBe(200);
    expect(leaderboardRes.body.data[0].fullAddress).toBe(ADDRESS);
    expect(mockGetLeaderboard).toHaveBeenCalledTimes(1);

    const addressRes = await request(app).get(`/api/reputation/${ADDRESS}`);
    expect(addressRes.status).toBe(200);
    expect(addressRes.body.address).toBe(ADDRESS);
    expect(mockGetReputation).toHaveBeenCalledTimes(1);

    const recalcRes = await request(app).post('/api/reputation/admin/recalculate');
    expect(recalcRes.status).toBe(200);
    expect(recalcRes.body.success).toBe(true);
    expect(mockRecalculate).toHaveBeenCalledTimes(1);
  });
});
