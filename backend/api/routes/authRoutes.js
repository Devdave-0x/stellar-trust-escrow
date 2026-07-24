import express from 'express';
import authController from '../controllers/authController.js';
import authMiddleware from '../middleware/auth.js';
import {
  verifyEmailToken,
  sendVerificationEmail,
} from '../../services/emailVerificationService.js';
import { requestPasswordReset, resetPassword } from '../../services/passwordResetService.js';
import { validatePasswordStrength } from '../middleware/passwordStrength.js';

const router = express.Router();

/** POST /api/auth/nonce — request a challenge nonce */
router.post('/nonce', authController.getNonce);

/** POST /api/auth/verify — submit signed nonce, receive JWT */
router.post('/verify', authController.verifySignatureAndLogin);

/** POST /api/auth/refresh — refresh a valid JWT */
router.post('/refresh', authController.refreshToken);

/** POST /api/auth/logout */
router.post('/logout', authController.logout);

/** Session management */
router.get('/sessions', authMiddleware, authController.listSessions);
router.delete('/sessions/:id', authMiddleware, authController.revokeSession);
router.delete('/sessions', authMiddleware, authController.revokeAllSessions);

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

export default router;
