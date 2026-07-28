/**
 * Auth Controller — Wallet Signature Verification
 *
 * Implements challenge-response authentication for Stellar wallet addresses and
 * issues short-lived JWTs with optional server-side session tracking.
 */

import crypto, { randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';
import { Keypair, StrKey } from '@stellar/stellar-sdk';
import sessionService from '../../services/sessionService.js';
import prisma from '../../lib/prisma.js';
import mfaService from '../../services/mfaService.js';
import { deviceNameFromUserAgent } from '../../lib/deviceName.js';
import { JWT_SECRET, JWT_ALGORITHM } from '../../config/secrets.js';
import emailService from '../../services/emailService.js';

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';
const NONCE_TTL_MS = 5 * 60 * 1000;

const nonceStore = new Map();

function isValidStellarAddress(address) {
  try {
    return StrKey.isValidEd25519PublicKey(address);
  } catch {
    return false;
  }
}

const FAILED_LOGIN_LOCKOUT_THRESHOLD = 5;
const LOCKOUT_MINUTES = 15;

// ── Login history / lockout helpers ───────────────────────────────────────────
// Keyed by wallet address rather than a `users` row — most authenticated
// principals never get one (see LoginHistory / LoginLockout schema comments).

async function recordLoginAttempt({ tenantId, address, req, success, failureReason }) {
  try {
    await prisma.loginHistory.create({
      data: {
        tenantId,
        address: address || null,
        ipAddress:
          req.headers['x-forwarded-for']?.split(',')[0]?.trim() ??
          req.socket?.remoteAddress ??
          null,
        userAgent: req.headers['user-agent'] || null,
        success,
        failureReason: failureReason || null,
      },
    });
  } catch (err) {
    console.error('[LoginHistory] Failed to record attempt:', err.message);
  }
}

async function getActiveLockout(tenantId, address) {
  const lockout = await prisma.loginLockout.findUnique({
    where: { tenantId_address: { tenantId, address } },
  });
  return lockout && lockout.lockedUntil > new Date() ? lockout : null;
}

async function sendLockoutAlertEmail(address, lockedUntil) {
  try {
    const user = await prisma.user.findFirst({
      where: { walletAddress: address },
      select: { email: true },
    });
    if (!user?.email) return;
    await emailService.notifyLoginLockout({
      unlockMinutes: LOCKOUT_MINUTES,
      lockedUntil: lockedUntil.toISOString(),
      recipients: [{ email: user.email, address }],
    });
  } catch (err) {
    console.error('[LoginHistory] Failed to send lockout alert email:', err.message);
  }
}

/** Records a failed attempt and locks the address for LOCKOUT_MINUTES after 5 in a row. */
async function recordFailedLoginAttempt(tenantId, address, req, failureReason) {
  if (!tenantId) return;
  await recordLoginAttempt({ tenantId, address, req, success: false, failureReason });

  const recent = await prisma.loginHistory.findMany({
    where: { tenantId, address },
    orderBy: { createdAt: 'desc' },
    take: FAILED_LOGIN_LOCKOUT_THRESHOLD,
  });

  const consecutiveFailures = [];
  for (const attempt of recent) {
    if (attempt.success) break;
    consecutiveFailures.push(attempt);
  }

  if (consecutiveFailures.length < FAILED_LOGIN_LOCKOUT_THRESHOLD) return;

  const lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
  await prisma.loginLockout.upsert({
    where: { tenantId_address: { tenantId, address } },
    create: { tenantId, address, lockedUntil },
    update: { lockedUntil },
  });
  await sendLockoutAlertEmail(address, lockedUntil);
}

function generateNonce() {
  return crypto.randomBytes(32).toString('hex');
}

function buildChallengeMessage(address, nonce) {
  return `Sign this message to authenticate with StellarTrustEscrow.\n\nAddress: ${address}\nNonce: ${nonce}\nTimestamp: ${Date.now()}`;
}

function verifySignature(address, message, signature) {
  try {
    return Keypair.fromPublicKey(address).verify(
      Buffer.from(message, 'utf8'),
      Buffer.from(signature, 'base64'),
    );
  } catch {
    return false;
  }
}

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ?? req.socket?.remoteAddress ?? '';
}

async function createSessionJti(address, req) {
  const jti = randomUUID();

  if (typeof sessionService?.recordSession === 'function') {
    await sessionService.recordSession({
      userId: address,
      jti,
      deviceName: deviceNameFromUserAgent(req.headers['user-agent']),
      ipAddress: getClientIp(req),
    });
  }

  return jti;
}

export const getNonce = (req, res) => {
  const { address } = req.body;

  if (!address || !isValidStellarAddress(address)) {
    return res.status(400).json({ error: 'Valid Stellar address required' });
  }

  const nonce = generateNonce();
  const message = buildChallengeMessage(address, nonce);
  const expiresAt = Date.now() + NONCE_TTL_MS;

  nonceStore.set(address, { nonce, message, expiresAt });
  setTimeout(() => nonceStore.delete(address), NONCE_TTL_MS);

  return res.json({ address, nonce, message, expiresIn: NONCE_TTL_MS / 1000 });
};

export const verifySignatureAndLogin = async (req, res) => {
  const { address, signature } = req.body;
  const tenantId = req.tenant?.id;

  if (!address || !isValidStellarAddress(address)) {
    return res.status(400).json({ error: 'Valid Stellar address required' });
  }

  if (tenantId) {
    const lockout = await getActiveLockout(tenantId, address);
    if (lockout) {
      await recordLoginAttempt({
        tenantId,
        address,
        req,
        success: false,
        failureReason: 'account_locked',
      });
      return res
        .status(423)
        .json({ error: 'Account locked due to too many failed attempts. Try again later.' });
    }
  }

  if (!signature || typeof signature !== 'string') {
    await recordFailedLoginAttempt(tenantId, address, req, 'missing_signature');
    return res.status(400).json({ error: 'Signature required' });
  }

  const stored = nonceStore.get(address);
  if (!stored) {
    await recordFailedLoginAttempt(tenantId, address, req, 'no_pending_nonce');
    return res.status(401).json({ error: 'No pending nonce for this address. Request a new one.' });
  }
  if (Date.now() > stored.expiresAt) {
    nonceStore.delete(address);
    await recordFailedLoginAttempt(tenantId, address, req, 'nonce_expired');
    return res.status(401).json({ error: 'Nonce expired. Request a new one.' });
  }

  const valid = verifySignature(address, stored.message, signature);
  nonceStore.delete(address);

  if (!valid) {
    await recordFailedLoginAttempt(tenantId, address, req, 'invalid_signature');
    return res.status(401).json({ error: 'Signature verification failed' });
  }

  if (tenantId) {
    await recordLoginAttempt({ tenantId, address, req, success: true });
  }

  const jti = await createSessionJti(address, req);
  const token = jwt.sign({ address, jti, iat: Math.floor(Date.now() / 1000) }, JWT_SECRET, {
    algorithm: JWT_ALGORITHM,
    expiresIn: JWT_EXPIRES_IN,
  });

  // Check if user requires 2FA (admin/arbiter with MFA enabled)
  const user = await prisma.user.findFirst({
    where: { walletAddress: address },
    select: { id: true, role: true, mfaEnabled: true, mfaEnforced: true, tenantId: true },
  });

  if (user) {
    const mfaRequired = await mfaService.requiresMfa(user.id, user.tenantId);
    if (mfaRequired) {
      return res.json({
        token,
        address,
        expiresIn: JWT_EXPIRES_IN,
        mfaRequired: true,
        message:
          'MFA verification required. Use the token to authenticate at /api/mfa/totp/verify.',
      });
    }
  }

  return res.json({ token, address, expiresIn: JWT_EXPIRES_IN });
};

export const refreshToken = async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Bearer token required' });
  }

  try {
    const payload = jwt.verify(authHeader.slice(7), JWT_SECRET, { algorithms: [JWT_ALGORITHM] });

    if (payload.jti) {
      if (typeof sessionService?.isSessionValid === 'function') {
        const valid = await sessionService.isSessionValid(payload.jti);
        if (!valid) {
          return res
            .status(401)
            .json({ error: 'Session revoked or expired. Please log in again.' });
        }
      }
      if (typeof sessionService?.revokeSessionByJti === 'function') {
        await sessionService.revokeSessionByJti(payload.jti);
      }
    }

    const jti = await createSessionJti(payload.address, req);
    const token = jwt.sign({ address: payload.address, jti }, JWT_SECRET, {
      algorithm: JWT_ALGORITHM,
      expiresIn: JWT_EXPIRES_IN,
    });

    return res.json({ token, address: payload.address, expiresIn: JWT_EXPIRES_IN });
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

export const logout = async (req, res) => {
  const authHeader = req.headers.authorization;

  if (authHeader?.startsWith('Bearer ')) {
    try {
      const payload = jwt.verify(authHeader.slice(7), JWT_SECRET, { algorithms: [JWT_ALGORITHM] });
      if (payload.jti && typeof sessionService?.revokeSessionByJti === 'function') {
        await sessionService.revokeSessionByJti(payload.jti);
      }
    } catch {
      // Logout is idempotent; invalid tokens are treated as already logged out.
    }
  }

  return res.json({ ok: true });
};

// Session listing/revocation lives in sessionController.js (also mounted at
// /api/users/me/sessions) — /api/auth/sessions* routes delegate to it.

export default {
  getNonce,
  verifySignatureAndLogin,
  refreshToken,
  logout,
};
