import express from 'express';
import authController from '../controllers/authController.js';
import authMiddleware from '../middleware/auth.js';
import { validate } from '../../middleware/zodValidate.js';
import { nonceSchema, verifySchema, refreshSchema } from '../../../shared/schemas/auth.js';
import mfaController from '../controllers/mfaController.js';
import { requireMfa } from '../middleware/mfaAuth.js';

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
router.get('/sessions', authMiddleware, authController.listSessions);
router.delete('/sessions/:id', authMiddleware, authController.revokeSession);
router.delete('/sessions', authMiddleware, authController.revokeAllSessions);

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

export default router;
