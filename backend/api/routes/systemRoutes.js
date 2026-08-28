/**
 * System Routes
 *
 * Admin-only operational endpoints, mounted at /api/v1/system.
 * Authentication is applied by the API gateway (app.use('/api', ...createGateway()));
 * requireAdmin further restricts these routes to Admin-role JWTs (or the
 * legacy x-admin-api-key header).
 *
 * @module routes/systemRoutes
 */

import express from 'express';
const router = express.Router();
import requireAdmin from '../middleware/requireAdmin.js';
import systemController from '../controllers/systemController.js';

router.use(requireAdmin);

/**
 * @route  GET /api/v1/system/shutdown-status
 * @desc   Current graceful-shutdown drain state (running/draining/closed),
 *         in-flight request count, and process uptime. Useful for
 *         deploy tooling verifying a pod has finished draining.
 */
router.get('/shutdown-status', systemController.getShutdownStatus);

export default router;
