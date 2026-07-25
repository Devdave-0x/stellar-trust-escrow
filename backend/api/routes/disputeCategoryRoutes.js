import express from 'express';
import disputeCategoryController from '../controllers/disputeCategoryController.js';

const router = express.Router();

/**
 * @route  GET /api/v1/dispute-categories
 * @desc   Public list of dispute categories, used when raising a dispute.
 */
router.get('/', disputeCategoryController.listCategories);

export default router;
