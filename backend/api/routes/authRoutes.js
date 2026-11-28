import express from 'express';
import authController from '../controllers/authController.js';
import sessionController from '../controllers/sessionController.js';
import authMiddleware from '../middleware/auth.js';
import {
  verifyEmailToken,
  sendVerificationEmail,
} from '../../services/emailVerificationService.js';
import { requestPasswordReset, resetPassword } from '../../services/passwordResetService.js';
import { validatePasswordStrength } from '../middleware/passwordStrength.js';
import {
  requestAccountDeletion,
  cancelAccountDeletion,
} from '../../services/accountDeletionService.js';

const router = express.Router();

/** POST /api/auth/nonce — request a challenge nonce */
router.post('/nonce', validate(nonceSchema), authController.getNonce);

/** POST /api/auth/verify — submit signed nonce, receive JWT */
router.post('/verify', validate(verifySchema), authController.verifySignatureAndLogin);

/** POST /api/auth/refresh — refresh a valid JWT */
router.post('/refresh', validate(refreshSchema), authController.refreshToken);

/** POST /api/auth/logout */
router.post('/logout', authController.logout);

/** Session management */
router.get('/sessions', authMiddleware, sessionController.listSessions);
router.delete('/sessions/:id', authMiddleware, sessionController.revokeSession);
router.delete('/sessions', authMiddleware, sessionController.revokeAllSessions);

// ── 2FA convenience aliases (issue #76) ───────────────────────────────────────
// POST /api/auth/2fa/setup  → initialise TOTP and return QR code
router.post('/2fa/setup', authMiddleware, mfaController.setupTOTP);
// POST /api/auth/2fa/verify → verify TOTP code and receive mfa-token
router.post('/2fa/verify', authMiddleware, mfaController.verifyTOTP);
// POST /api/auth/2fa/disable → remove the primary TOTP method (requires active MFA session)
router.post('/2fa/disable', authMiddleware, requireMfa, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const tenantId = req.tenant?.id || req.user.tenantId;
    const { methodId } = req.body;
    if (!methodId) return res.status(400).json({ error: 'methodId required' });
    const mfaService = (await import('../../services/mfaService.js')).default;
    await mfaService.removeMfaMethod(userId, tenantId, methodId);
    res.json({ success: true, message: '2FA method disabled.' });
  } catch (err) {
    if (err.message?.includes('not found')) return res.status(404).json({ error: err.message });
    res.status(500).json({ error: 'Failed to disable 2FA' });
  }
});

/**
 * @route  POST /api/auth/verify-email
 * @desc   Verify email address using a token from the verification email
 * @body   { token: string }
 */
router.post('/verify-email', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'token is required' });
    const result = await verifyEmailToken(token);
    res.json({ message: 'Email verified successfully', ...result });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

/**
 * @route  POST /api/auth/resend-verification
 * @desc   Resend verification email for the authenticated user
 */
router.post('/resend-verification', authMiddleware, async (req, res) => {
  try {
    const { address } = req.user;
    const { prisma } = await import('../../lib/prisma.js');
    const user = await prisma.user.findFirst({
      where: { walletAddress: address },
      select: { id: true, email: true, emailVerified: true },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.emailVerified) return res.status(409).json({ error: 'Email is already verified' });
    await sendVerificationEmail(user.id, user.email);
    res.json({ message: 'Verification email resent' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @route  POST /api/auth/forgot-password
 * @desc   Request a password reset email
 * @body   { email: string }
 */
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'email is required' });
    await requestPasswordReset(email);
    res.json({ message: 'If that email is registered, a reset link has been sent.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @route  POST /api/auth/reset-password
 * @desc   Consume a reset token and set a new password
 * @body   { token: string, password: string }
 */
router.post(
  '/reset-password',
  validatePasswordStrength({ field: 'password' }),
  async (req, res) => {
    try {
      const { token, password } = req.body;
      if (!token) return res.status(400).json({ error: 'token is required' });
      const result = await resetPassword(token, password);
      res.json({ message: 'Password reset successfully', ...result });
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  },
);

/**
 * @route  DELETE /api/auth/account
 * @desc   Request self-service account deletion (30-day grace period)
 */
router.delete('/account', authMiddleware, async (req, res) => {
  try {
    const { prisma } = await import('../../lib/prisma.js');
    const user = await prisma.user.findFirst({
      where: { walletAddress: req.user.address },
      select: { id: true, deletedAt: true },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.deletedAt) return res.status(410).json({ error: 'Account has already been deleted' });

    const { scheduledFor } = await requestAccountDeletion(user.id);
    res.json({
      message: `Account deletion scheduled. Your data will be anonymised on ${scheduledFor.toISOString()} unless you cancel.`,
      scheduledFor,
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

/**
 * @route  POST /api/auth/account/cancel-deletion
 * @desc   Cancel a pending account deletion request
 */
router.post('/account/cancel-deletion', authMiddleware, async (req, res) => {
  try {
    const { prisma } = await import('../../lib/prisma.js');
    const user = await prisma.user.findFirst({
      where: { walletAddress: req.user.address },
      select: { id: true },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });

    await cancelAccountDeletion(user.id);
    res.json({ message: 'Account deletion cancelled successfully' });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

export default router;
