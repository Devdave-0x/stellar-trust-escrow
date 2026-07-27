import express from 'express';
import announcementController from '../controllers/announcementController.js';
import authMiddleware from '../middleware/auth.js';

const router = express.Router();
router.use(authMiddleware);

/**
 * @route  GET /api/announcements/active
 * @desc   Announcements currently active (between startsAt/endsAt) for the
 *         current user's tenant, plus any global (target=all) announcements
 */
router.get('/active', announcementController.listActive);

export default router;
