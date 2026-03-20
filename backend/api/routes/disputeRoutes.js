import express from 'express';
const router = express.Router();
import disputeController from '../controllers/disputeController';

/**
 * @route  GET /api/disputes
 * @desc   List all active disputes.
 * @query  page, limit
 */
router.get('/', disputeController.listDisputes);

/**
 * @route  GET /api/disputes/:escrowId
 * @desc   Get dispute details for a specific escrow.
 */
router.get('/:escrowId', disputeController.getDispute);

export default router;
