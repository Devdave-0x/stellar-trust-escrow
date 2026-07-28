/**
 * Expiry Routes
 *
 * Endpoints for managing the escrow auto-expiry background job.
 * All routes require authentication.
 *
 * GET  /api/expiry/status       — get background job status
 * POST /api/expiry/run          — manually trigger a run (admin)
 * GET  /api/expiry/pending      — list escrows pending expiry
 */

import express from 'express';
import expiryController from '../controllers/expiryController.js';
import authMiddleware from '../middleware/auth.js';

const router = express.Router();
router.use(authMiddleware);

/**
 * @route  GET /api/expiry/status
 * @desc   Get the current status of the expiry background job
 */
router.get('/status', expiryController.getStatus);

/**
 * @route  POST /api/expiry/run
 * @desc   Manually trigger a single run of the expiry job
 */
router.post('/run', expiryController.triggerRun);

/**
 * @route  GET /api/expiry/pending
 * @desc   List escrows currently past their deadline but not yet expired
 */
router.get('/pending', expiryController.listPendingExpirations);

export default router;
