/**
 * API Key Routes
 *
 * Self-service management of a user's own programmatic API keys.
 */

import express from 'express';
import authMiddleware from '../middleware/auth.js';
import apiKeyController from '../controllers/apiKeyController.js';

const router = express.Router();
router.use(authMiddleware);

/**
 * @route  POST /api/v1/api-keys
 * @desc   Create a new API key. Returns the raw key once.
 * @body   { name: string, allowedIps?: string[] }
 */
router.post('/', apiKeyController.createKey);

/**
 * @route  GET /api/v1/api-keys
 * @desc   List the requesting user's own API keys (raw key never returned).
 */
router.get('/', apiKeyController.listKeys);

/**
 * @route  PATCH /api/v1/api-keys/:id
 * @desc   Update name and/or allowedIps (CIDR/IP list) on an owned key.
 * @body   { name?: string, allowedIps?: string[] }
 */
router.patch('/:id', apiKeyController.updateKey);

export default router;
