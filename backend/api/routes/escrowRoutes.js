import express from 'express';
import escrowController, {
  validateBroadcast,
  validateEscrowId,
  validatePagination,
} from '../controllers/escrowController.js';
import escrowMessageController, {
  validateSendMessage,
} from '../controllers/escrowMessageController.js';
import { cacheResponse, invalidateOn, TTL } from '../middleware/cache.js';
import authMiddleware from '../middleware/auth.js';

const router = express.Router();
router.use(authMiddleware);

/**
 * @route  GET /api/escrows
 */
router.get(
  '/',
  validatePagination,
  cacheResponse({
    ttl: TTL.LIST,
    tags: (req) => ['escrows', `escrow:list:${req.query.page || '1'}`],
  }),
  escrowController.listEscrows,
);

/**
 * @route  POST /api/escrows/broadcast
 */
router.post(
  '/broadcast',
  validateBroadcast,
  invalidateOn({ tags: ['escrows'] }),
  escrowController.broadcastCreateEscrow,
);

/**
 * @route  GET /api/escrows/:id/milestones
 */
router.get(
  '/:id/milestones',
  validateEscrowId,
  validatePagination,
  cacheResponse({
    ttl: TTL.DETAIL,
    tags: (req) => [`escrow:${req.params.id}`, 'milestones'],
  }),
  escrowController.getMilestones,
);

/**
 * @route  GET /api/escrows/:id/milestones/:milestoneId
 */
router.get(
  '/:id/milestones/:milestoneId',
  validateEscrowId,
  cacheResponse({
    ttl: TTL.DETAIL,
    tags: (req) => [
      `escrow:${req.params.id}`,
      `milestone:${req.params.id}:${req.params.milestoneId}`,
    ],
  }),
  escrowController.getMilestone,
);

/**
 * @route  POST /api/escrows/:id/messages
 */
router.post(
  '/:id/messages',
  validateEscrowId,
  validateSendMessage,
  escrowMessageController.sendMessage,
);

/**
 * @route  GET /api/escrows/:id/messages
 */
router.get(
  '/:id/messages',
  validateEscrowId,
  validatePagination,
  escrowMessageController.listMessages,
);

/**
 * @route  POST /api/escrows/:id/messages/read
 */
router.post('/:id/messages/read', validateEscrowId, escrowMessageController.markRead);

/**
 * @route  GET /api/escrows/:id
 */
router.get(
  '/:id',
  validateEscrowId,
  cacheResponse({
    ttl: TTL.DETAIL,
    tags: (req) => ['escrows', `escrow:${req.params.id}`],
  }),
  escrowController.getEscrow,
);

export default router;
