import express from 'express';
const router = express.Router();
import reputationController from '../controllers/reputationController';

/**
 * @route  GET /api/reputation/:address
 * @desc   Get the full reputation record for an address.
 */
router.get('/:address', reputationController.getReputation);

/**
 * @route  GET /api/reputation/leaderboard
 * @desc   Top users by reputation score.
 * @query  limit (default 20), page
 * TODO (contributor — medium, Issue #22): Implement leaderboard query
 */
router.get('/leaderboard', reputationController.getLeaderboard);

export default router;
