import express from 'express';
import disputeCategoryController from '../controllers/disputeCategoryController.js';
import { cacheResponse, TTL } from '../middleware/cache.js';

const router = express.Router();

/**
 * @route  GET /api/v1/dispute-categories
 * @desc   Public list of active dispute categories
 */
router.get(
  '/',
  cacheResponse({ ttl: TTL.LIST, tags: ['dispute-categories'] }),
  disputeCategoryController.listCategories,
);

export default router;
