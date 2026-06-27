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
 * @route  GET /api/escrows/search
 * @desc   Full-text + filter search over escrows with cursor-based pagination.
 * @query  q           {string}  free-text — matches client/freelancer address and brief hash
 * @query  status      {string}  single or comma-separated: Active,Completed,Disputed,Cancelled
 * @query  from        {string}  ISO date — createdAt >= from
 * @query  to          {string}  ISO date — createdAt <= to
 * @query  min_amount  {number}  minimum totalAmount
 * @query  max_amount  {number}  maximum totalAmount
 * @query  party       {string}  Stellar address matching either client or freelancer
 * @query  cursor      {string}  cursor id from previous page (for cursor pagination)
 * @query  limit       {number}  page size, default 20, max 100
 * @returns { data, nextCursor, hasNextPage }
 */
router.get('/search', escrowController.searchEscrows);

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
 *         Invalidates escrow list and dashboard stats caches.
 */
router.post(
  '/broadcast',
  validateBroadcast,
  invalidateOn({ tags: ['escrows', 'stats:volume', 'stats:active', 'stats:success'] }),
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

/**
 * @route  GET /api/escrows/stats/volume
 * @desc   Total escrow volume. Cached 30s.
 */
router.get(
  '/stats/volume',
  cacheResponse({
    ttl: TTL.STATS,
    tags: ['stats:volume'],
  }),
  escrowController.getTotalVolume,
);

/**
 * @route  GET /api/escrows/stats/active
 * @desc   Count of active escrows. Cached 30s.
 */
router.get(
  '/stats/active',
  cacheResponse({
    ttl: TTL.STATS,
    tags: ['stats:active'],
  }),
  escrowController.getActiveEscrows,
);

/**
 * @route  GET /api/escrows/stats/success-rate
 * @desc   Escrow success rate. Cached 30s.
 */
router.get(
  '/stats/success-rate',
  cacheResponse({
    ttl: TTL.STATS,
    tags: ['stats:success'],
  }),
  escrowController.getSuccessRate,
);

export default router;
