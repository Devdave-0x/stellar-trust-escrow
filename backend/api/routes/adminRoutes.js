/**
 * Admin Routes
 *
 * All routes here require the adminAuth middleware (x-admin-api-key header).
 *
 * @module routes/adminRoutes
 */

import express from 'express';
const router = express.Router();
import adminAuth from '../middleware/adminAuth.js';
import adminController from '../controllers/adminController.js';
import disputeCategoryController from '../controllers/disputeCategoryController.js';
import configController from '../controllers/configController.js';

// Apply admin authentication to all routes in this file
router.use(adminAuth);

// ── Stats ──────────────────────────────────────────────────────────────────────
/**
 * @route  GET /api/admin/stats
 * @desc   Platform-wide statistics (total escrows, users, disputes)
 */
router.get('/stats', adminController.getStats);

// ── Users ──────────────────────────────────────────────────────────────────────
/**
 * @route  GET /api/admin/users
 * @desc   List all users with pagination & search
 * @query  page, limit, search
 */
router.get('/users', adminController.listUsers);

/**
 * @route  GET /api/admin/users/:address
 * @desc   Get detailed profile for a single user
 */
router.get('/users/:address', adminController.getUserDetail);

/**
 * @route  POST /api/admin/users/:address/suspend
 * @desc   Suspend a user; logs action to admin audit log
 * @body   { reason: string }
 */
router.post('/users/:address/suspend', adminController.suspendUser);

/**
 * @route  POST /api/admin/users/:address/ban
 * @desc   Permanently ban a user; logs action to admin audit log
 * @body   { reason: string }
 */
router.post('/users/:address/ban', adminController.banUser);

// ── Disputes ───────────────────────────────────────────────────────────────────
/**
 * @route  GET /api/admin/disputes
 * @desc   List all disputes with pagination
 * @query  page, limit, resolved (true|false)
 */
router.get('/disputes', adminController.listDisputes);

/**
 * @route  POST /api/admin/disputes/:id/resolve
 * @desc   Resolve an open dispute
 * @body   { clientAmount: string, freelancerAmount: string, notes: string }
 */
router.post('/disputes/:id/resolve', adminController.resolveDispute);

// ── Settings & Fees ────────────────────────────────────────────────────────────
/**
 * @route  GET /api/admin/settings
 * @desc   Read current platform settings
 */
router.get('/settings', adminController.getSettings);

/**
 * @route  PATCH /api/admin/settings
 * @desc   Update platform settings (fee percentage, etc.)
 * @body   { platformFeePercent: number }
 */
router.patch('/settings', adminController.updateSettings);

// ── System Config ──────────────────────────────────────────────────────────────
/**
 * @route  GET /api/admin/config
 * @desc   Returns all system_config entries
 */
router.get('/config', configController.getAllConfig);

/**
 * @route  PATCH /api/admin/config/:key
 * @desc   Update a config value; validated against its declared type
 * @body   { value: string }
 */
router.patch('/config/:key', configController.updateConfig);

// ── Dispute Categories ─────────────────────────────────────────────────────────
/**
 * @route  GET /api/admin/dispute-categories
 * @desc   List all dispute categories
 */
router.get('/dispute-categories', disputeCategoryController.adminListCategories);

/**
 * @route  POST /api/admin/dispute-categories
 * @desc   Create a dispute category
 * @body   { name: string, description?: string, defaultArbiterPoolId?: string }
 */
router.post('/dispute-categories', disputeCategoryController.adminCreateCategory);

/**
 * @route  PATCH /api/admin/dispute-categories/:id
 * @desc   Update a dispute category
 * @body   { name?: string, description?: string, defaultArbiterPoolId?: string }
 */
router.patch('/dispute-categories/:id', disputeCategoryController.adminUpdateCategory);

/**
 * @route  DELETE /api/admin/dispute-categories/:id
 * @desc   Delete a dispute category
 */
router.delete('/dispute-categories/:id', disputeCategoryController.adminDeleteCategory);

// ── Audit Logs ─────────────────────────────────────────────────────────────────
/**
 * @route  GET /api/admin/audit-logs
 * @desc   Paginated audit log of all admin actions
 * @query  page, limit
 */
router.get('/audit-logs', adminController.getAuditLogs);

// ── Rate Limits ────────────────────────────────────────────────────────────────
/**
 * @route  GET /api/admin/rate-limits
 * @desc   List all tier rate limit configurations
 */
router.get('/rate-limits', adminController.getRateLimits);

/**
 * @route  PATCH /api/admin/rate-limits/:tier
 * @desc   Update rate limit max for a specific tier
 * @body   { max: number }
 */
router.patch('/rate-limits/:tier', adminController.updateRateLimit);

/**
 * @route  GET /api/admin/rate-limits/usage/:userId
 * @desc   Get current usage analytics for a specific user
 */
router.get('/rate-limits/usage/:userId', adminController.getUserRateLimitUsage);

export default router;
