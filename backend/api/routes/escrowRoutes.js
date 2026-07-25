import express from 'express';
import escrowController, {
  validateBroadcast,
  validateEscrowId,
  validatePagination,
} from '../controllers/escrowController.js';
import certificateController from '../controllers/certificateController.js';
import { cacheResponse, invalidateOn, TTL } from '../middleware/cache.js';
import { conditionalGet } from '../middleware/conditionalGet.js';
import authMiddleware from '../middleware/auth.js';
import { auditTransitionMiddleware } from '../../services/escrowAuditService.js';
import {
  createNote,
  listNotes,
  updateNote,
  deleteNote,
} from '../controllers/escrowNoteController.js';
import { exportBundle } from '../controllers/auditController.js';
import { addBookmark, removeBookmark } from '../controllers/bookmarkController.js';
import { createSlidingWindowRateLimiter } from '../middleware/rateLimiter.js';
import { createShareLink, revokeShareLink } from '../controllers/shareLinkController.js';

const router = express.Router();
router.use(authMiddleware);

// Stricter rate limit for batch endpoints — 10 requests per minute per user
const batchRateLimit = createSlidingWindowRateLimiter({
  windowMs: 60_000,
  max: 10,
  prefix: 'batch-escrow',
  message: 'Too many batch requests. Please wait before retrying.',
});

/**
 * @route  POST /api/escrows/batch-status
 */
router.post('/batch-status', batchRateLimit, escrowController.batchStatus);

/**
 * @route  POST /api/escrows/batch-release
 */
router.post('/batch-release', batchRateLimit, escrowController.batchRelease);

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
 * @route  GET /api/escrows/export.csv
 * @desc   Streams a CSV of the authenticated user's escrows.
 * @query  from  {string}  ISO date — createdAt >= from
 * @query  to    {string}  ISO date — createdAt <= to
 */
router.get('/export.csv', escrowController.exportEscrowsCsv);

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
  conditionalGet(),
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
 * @route  POST /api/escrows/:id/clone
 * @desc   Duplicate an escrow's title/description/milestones/participant addresses
 *         into a new Draft escrow owned by the requesting user.
 * @body   { title?, amount?, deadline? } optional overrides
 */
router.post(
  '/:id/clone',
  validateEscrowId,
  invalidateOn({ tags: ['escrows'] }),
  escrowController.cloneEscrow,
);

/**
 * @route  PATCH /api/escrows/:id/metadata
 * @desc   Merge-update the escrow's custom metadata object (client/freelancer/admin only).
 */
router.patch(
  '/:id/metadata',
  validateEscrowId,
  invalidateOn({ tags: (req) => ['escrows', `escrow:${req.params.id}`] }),
  escrowController.updateEscrowMetadata,
);

/**
 * @route  GET /api/escrows/:id/audit
 * @desc   Immutable audit trail of state transitions for a specific escrow.
 *         Accessible by the escrow parties (client/freelancer) and admins.
 */
router.get('/:id/audit', validateEscrowId, escrowController.getEscrowAudit);

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
 * @route  GET /api/escrows/:id/milestones/:milestoneId/history
 * @desc   Paginated (oldest-first) status-change history for a milestone.
 *         Accessible by escrow participants (client/freelancer/arbiter) and admins.
 */
router.get(
  '/:id/milestones/:milestoneId/history',
  validateEscrowId,
  validatePagination,
  escrowController.getMilestoneHistory,
);

/**
 * @route  GET /api/escrows/:id/certificate
 * @desc   Signed PDF completion certificate — only available once Completed.
 */
router.get('/:id/certificate', validateEscrowId, certificateController.getCertificate);

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
 * @route  DELETE /api/escrows/:id
 * @desc   Soft-delete an escrow (sets deletedAt). Only allowed while the
 *         escrow is in Draft or Cancelled status.
 */
router.delete(
  '/:id',
  validateEscrowId,
  invalidateOn({ tags: (req) => ['escrows', `escrow:${req.params.id}`] }),
  escrowController.deleteEscrow,
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

/**
 * @route  POST   /api/escrows/:id/bookmark
 * @route  DELETE /api/escrows/:id/bookmark
 */
router.post('/:id/bookmark', validateEscrowId, addBookmark);
router.delete('/:id/bookmark', validateEscrowId, removeBookmark);

/**
 * @route  POST   /api/escrows/:id/share
 * @route  DELETE /api/escrows/:id/share/:token
 */
router.post('/:id/share', validateEscrowId, createShareLink);
router.delete('/:id/share/:token', validateEscrowId, revokeShareLink);

export default router;
