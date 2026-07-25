import express from 'express';
import userController from '../controllers/userController.js';
import referralController from '../controllers/referralController.js';
import {
  stellarAddressParam,
  paginationQuery,
  handleValidationErrors,
} from '../../middleware/validation.js';
import exportController from '../controllers/exportController.js';
import escrowMessageController from '../controllers/escrowMessageController.js';
import authMiddleware from '../middleware/auth.js';
import { authorizeParamAddress } from '../middleware/authorization.js';
import adminAuth, { optionalAdminAuth } from '../middleware/adminAuth.js';
import { createSlidingWindowRateLimiter } from '../middleware/rateLimiter.js';
import { conditionalGet } from '../middleware/conditionalGet.js';
import { validatePasswordStrength } from '../middleware/passwordStrength.js';
import { listBookmarks } from '../controllers/bookmarkController.js';
import sessionController from '../controllers/sessionController.js';

const router = express.Router();
router.use(optionalAdminAuth, authMiddleware);

const validateAddress = [stellarAddressParam('address'), handleValidationErrors];
const validatePagination = [...paginationQuery, handleValidationErrors];
const exportRateLimit = createSlidingWindowRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 3,
  prefix: 'data-export',
  message: 'Too many export requests for this address. Please try again later.',
  keyGenerator: (req) => `data-export:address:${req.params?.address || 'unknown'}`,
});

/**
 * @route  GET /api/users/me/sessions
 * @desc   List the authenticated user's active login sessions (device, IP, last active).
 *         The session used for this request is flagged with current: true.
 */
router.get('/me/sessions', sessionController.listSessions);

/**
 * @route  DELETE /api/users/me/sessions/:id
 * @desc   Revoke a single session belonging to the authenticated user.
 */
router.delete('/me/sessions/:id', sessionController.revokeSession);

/**
 * @route  DELETE /api/users/me/sessions
 * @desc   Revoke every session except the current one ("sign out everywhere else").
 */
router.delete('/me/sessions', sessionController.revokeAllSessions);

/**
 * @route  GET /api/users/me/unread-messages
 * @desc   Count of unread escrow messages across all of the current user's escrows
 */
router.get('/me/unread-messages', escrowMessageController.getUnreadCount);

/**
 * @route  GET /api/users/me/login-history
 * @desc   Last 50 login attempts for the current user, newest first
 */
router.get('/me/login-history', userController.getMyLoginHistory);

router.get('/:address', validateAddress, conditionalGet(), userController.getUserProfile);
router.get(
  '/:address/activity',
  validateAddress,
  validatePagination,
  userController.getUserActivityLog,
);
router.get('/:address/escrows', validateAddress, validatePagination, userController.getUserEscrows);
router.get('/:address/stats', validateAddress, userController.getUserStats);
router.get('/:address/bookmarks', validateAddress, validatePagination, listBookmarks);

/**
 * @route  PUT /api/users/:address/password
 * @desc   Change user password with strength validation
 * @body   { currentPassword?: string, password: string }
 */
router.put(
  '/:address/password',
  validateAddress,
  authorizeParamAddress('address'),
  validatePasswordStrength(),
  userController.changePassword,
);

/**
 * @route  GET /api/users/:address/export
 * @desc   Export all user data in JSON format
 * @returns { version, exportedAt, userAddress, data: { escrows, payments, kyc, reputation } }
 */
router.get('/:address/export', exportRateLimit, exportController.exportUserData);

/**
 * @route  POST /api/users/:address/import
 * @desc   Import user data from JSON
 * @body   { data: {...}, mode: 'merge' | 'replace' }
 * @returns { success, results }
 */
router.post('/:address/import', authorizeParamAddress('address'), exportController.importUserData);

/**
 * @route  GET /api/users/:address/export/file
 * @desc   Download user data as a file
 * @returns { file: 'data.json', content: {...} }
 */
router.get('/:address/export/file', exportRateLimit, exportController.downloadExportFile);

/**
 * @route  DELETE /api/users/:address/data
 * @desc   Pseudonymize user data for GDPR deletion/admin retention
 */
router.delete('/:address/data', adminAuth, exportController.deleteUserData);

export default router;
