import express from 'express';
import escrowController, {
  validateBroadcast,
  validateEscrowId,
  validatePagination,
} from '../controllers/escrowController.js';
import { cacheResponse, invalidateOn, TTL } from '../middleware/cache.js';
import authMiddleware from '../middleware/auth.js';
import { auditTransitionMiddleware } from '../../services/escrowAuditService.js';

const router = express.Router();
router.use(authMiddleware);

/**
 * @route  GET /api/escrows
 * @desc   Cursor-paginated list of escrows.
 *         Query params: cursor, limit, status, client, freelancer, sortBy, sortOrder
 */
router.get(
  '/',
  validatePagination,
  cacheResponse({
    ttl: TTL.LIST,
    tags: (req) => ['escrows', `escrow:list:${req.query.cursor || 'first'}`],
  }),
  escrowController.listEscrows,
);

/**
 * @route  POST /api/escrows/broadcast
 * @desc   Broadcast a signed XDR transaction to create/fund an escrow.
 *         Logs the CREATE transition to the audit trail.
 */
router.post(
  '/broadcast',
  validateBroadcast,
  invalidateOn({ tags: ['escrows'] }),
  auditTransitionMiddleware(),
  escrowController.broadcastCreateEscrow,
);

/**
 * @route  GET /api/escrows/:id/audit
 * @desc   Immutable audit trail of state transitions for a specific escrow.
 *         Accessible by the escrow parties (client/freelancer) and admins.
 */
router.get(
  '/:id/audit',
  validateEscrowId,
  escrowController.getEscrowAudit,
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
