import express from 'express';
const router = express.Router();
import userController from '../controllers/userController';

/**
 * @route  GET /api/users/:address
 * @desc   Get a user's profile: reputation, escrow history, stats.
 * @param  address — Stellar public key (G...)
 */
router.get('/:address', userController.getUserProfile);

/**
 * @route  GET /api/users/:address/escrows
 * @desc   Get all escrows where this address is client or freelancer.
 * @query  role (client|freelancer|all), status, page, limit
 */
router.get('/:address/escrows', userController.getUserEscrows);

/**
 * @route  GET /api/users/:address/stats
 * @desc   Aggregated stats: total volume, completion rate, avg milestone time.
 * TODO (contributor — medium, Issue #21): Implement stats aggregation query
 */
router.get('/:address/stats', userController.getUserStats);

export default router;
