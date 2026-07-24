import express from 'express';
import thresholdRoutes from './thresholdRoutes.js';
import escrowController, {
  validateBroadcast,
  validateEscrowId,
  validatePagination,
} from '../controllers/escrowController.js';
import ownershipRoutes from './ownershipRoutes.js';
import { cacheResponse, invalidateOn, TTL } from '../middleware/cache.js';
import authMiddleware from '../middleware/auth.js';
import {
  createNote,
  listNotes,
  updateNote,
  deleteNote,
} from '../controllers/escrowNoteController.js';
import { exportBundle } from '../controllers/auditController.js';

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
 * @route  GET /api/escrows/:id/audit/export
 */
router.get('/:id/audit/export', validateEscrowId, exportBundle);
router.use('/:id/approvals', thresholdRoutes);
router.use('/:id/ownership', ownershipRoutes);

/**
 * @route  GET  /api/escrows/:id/notes
 * @route  POST /api/escrows/:id/notes
 */
router.get('/:id/notes', validateEscrowId, listNotes);
router.post('/:id/notes', validateEscrowId, createNote);

/**
 * @route  PATCH  /api/escrows/:id/notes/:noteId
 * @route  DELETE /api/escrows/:id/notes/:noteId
 */
router.patch('/:id/notes/:noteId', validateEscrowId, updateNote);
router.delete('/:id/notes/:noteId', validateEscrowId, deleteNote);

export default router;
