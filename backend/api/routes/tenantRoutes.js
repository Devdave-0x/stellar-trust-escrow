/**
 * Tenant Routes
 *
 * @module routes/tenantRoutes
 */

import express from 'express';
import tenantController from '../controllers/tenantController.js';

const router = express.Router();

/**
 * @route  GET /api/tenants/me/usage
 * @desc   Current tenant's plan usage: API calls, escrows, storage, users
 * @header x-tenant-id
 */
router.get('/me/usage', tenantController.getUsage);

export default router;
