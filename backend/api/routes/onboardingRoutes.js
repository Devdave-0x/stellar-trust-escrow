/**
 * Onboarding Routes (#216)
 *
 * Mounted at /api/v1/users/me/onboarding (via userRoutes.js).
 * All routes require the shared authMiddleware applied in userRoutes.
 */

import express from 'express';
import onboardingController from '../controllers/onboardingController.js';

const router = express.Router();

/**
 * @route  GET /api/v1/users/me/onboarding
 * @desc   Returns every onboarding step with completed flag, completedAt, and action_url.
 */
router.get('/', onboardingController.getChecklist);

/**
 * @route  GET /api/v1/users/me/onboarding/progress
 * @desc   Returns { total, completed, percentage } for the authenticated user.
 */
router.get('/progress', onboardingController.getProgress);

export default router;
