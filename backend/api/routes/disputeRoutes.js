import express from 'express';
const router = express.Router();
<<<<<<< HEAD
import disputeController from '../controllers/disputeController';
=======
import disputeController from '../controllers/disputeController.js';
>>>>>>> 233e2dd (fix: fixing husky dev)

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
