const express = require('express');
const router = express.Router();
const disputeController = require('../controllers/disputeController');

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

module.exports = router;
