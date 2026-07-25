/**
 * Admin Escrow Routes
 *
 * Admin-only endpoints for inspecting, freezing, force-transitioning,
 * and annotating escrows across all tenants. Stricter rate limits than
 * the standard per-user tier because these are sensitive operations.
 *
 * @module routes/adminEscrowRoutes
 */

import express from 'express';
const router = express.Router();
import requireAdmin from '../middleware/requireAdmin.js';
import adminEscrowController from '../controllers/adminEscrowController.js';
import { createSlidingWindowRateLimiter } from '../middleware/rateLimiter.js';
import { RATE_LIMIT_WINDOW_MS } from '../../config/rateLimits.js';

const adminSlidingLimiter = createSlidingWindowRateLimiter({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: 30,
  burstMax: 5,
  prefix: 'admin-escrow',
  message: 'Admin rate limit exceeded. Please retry later.',
});

// Apply admin auth and stricter rate limiting to all routes in this file
router.use(requireAdmin);
router.use(adminSlidingLimiter);

// ── Read ───────────────────────────────────────────────────────────────────────

/**
 * @route  GET /api/admin/escrows
 * @desc   List all escrows across tenants with full filter support
 * @query  status, client, freelancer, search, minAmount, maxAmount,
 *         dateFrom, dateTo, include_deleted, page, limit, sortBy, sortOrder
 */
router.get('/', adminEscrowController.listAdminEscrows);

// ── Mutations ─────────────────────────────────────────────────────────────────

/**
 * @route  POST /api/admin/escrows/:id/freeze
 * @desc   Prevent any state changes on the escrow
 * @body   { reason: string }
 */
router.post('/:id/freeze', adminEscrowController.freezeEscrow);

/**
 * @route  POST /api/admin/escrows/:id/restore
 * @desc   Clear deletedAt on a soft-deleted escrow
 */
router.post('/:id/restore', adminEscrowController.restoreEscrow);

/**
 * @route  POST /api/admin/escrows/:id/force-transition
 * @desc   Manually move escrow to a specified state with reason
 * @body   { status: EscrowStatus, reason: string }
 */
router.post('/:id/force-transition', adminEscrowController.forceTransition);

/**
 * @route  POST /api/admin/escrows/:id/notes
 * @desc   Add an internal note visible only to admins
 * @body   { note: string }
 */
router.post('/:id/notes', adminEscrowController.addNote);

export default router;
