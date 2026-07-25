/* eslint-disable no-unused-vars */
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';
import prisma from '../../lib/prisma.js';
import refreshTokenService from '../../services/refreshTokenService.js';
import tokenBlacklistService from '../../services/tokenBlacklistService.js';
import tokenMetricsService from '../../services/tokenMetricsService.js';
import cookieUtils from '../../lib/cookieUtils.js';
import emailService from '../../services/emailService.js';

const STELLAR_ADDRESS_RE = /^G[A-Z2-7]{55}$/;

const FAILED_LOGIN_LOCKOUT_THRESHOLD = 5;
const LOCKOUT_MINUTES = 15;

// ── Login history / lockout helpers ───────────────────────────────────────────

async function recordLoginAttempt({ tenantId, userId, req, success, failureReason }) {
  try {
    await prisma.loginHistory.create({
      data: {
        tenantId,
        userId: userId ?? null,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent') || null,
        success,
        failureReason: failureReason || null,
      },
    });
  } catch (err) {
    console.error('[LoginHistory] Failed to record attempt:', err.message);
  }
}

async function sendLockoutAlertEmail(user, lockedUntil) {
  try {
    if (!user.email) return;
    await emailService.notifyLoginLockout({
      unlockMinutes: LOCKOUT_MINUTES,
      lockedUntil: lockedUntil.toISOString(),
      recipients: [{ email: user.email }],
    });
  } catch (err) {
    console.error('[LoginHistory] Failed to send lockout alert email:', err.message);
  }
}

/** Locks the account for LOCKOUT_MINUTES after 5 consecutive failed attempts. */
async function handleFailedLoginAttempt(user) {
  const recent = await prisma.loginHistory.findMany({
    where: { userId: user.id },
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
  await prisma.user.update({ where: { id: user.id }, data: { lockedUntil } });
  await sendLockoutAlertEmail(user, lockedUntil);
}

function normalizeWalletAddress(body = {}) {
  return body.walletAddress || body.stellarAddress || null;
}

// Helper to generate access token
const generateAccessToken = (user) => {
  return jwt.sign(
    {
      userId: user.id,
      tenantId: user.tenantId,
      type: 'access',
      jti: randomUUID(),
    },
    process.env.JWT_ACCESS_SECRET || 'fallback_access_secret',
    { expiresIn: process.env.JWT_ACCESS_EXPIRATION || '15m' },
  );
};

export const register = async (req, res) => {
  try {
    const { email, password, walletAddress } = req.body;
    const tenantId = req.tenant?.id;

    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant context is required' });
    }

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    if (walletAddress && !STELLAR_ADDRESS_RE.test(walletAddress)) {
      return res.status(400).json({ error: 'Invalid Stellar wallet address' });
    }

    // Check if user exists
    const existingUser = await prisma.user.findFirst({
      where: { email, tenantId },
    });

    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    if (walletAddress) {
      const existingWalletUser = await prisma.user.findFirst({
        where: { tenantId, walletAddress },
        select: { id: true },
      });

      if (existingWalletUser) {
        return res.status(400).json({ error: 'Wallet address is already linked to another user' });
      }
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create user
    const user = await prisma.user.create({
      data: {
        tenantId,
        email,
        walletAddress,
        password: hashedPassword,
      },
    });

    res.status(201).json({
      message: 'User registered successfully',
      userId: user.id,
      tenant: { id: req.tenant.id, slug: req.tenant.slug },
    });
  } catch (error) {
    console.error('[Register] Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const tenantId = req.tenant?.id;

    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant context is required' });
    }

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find user
    const user = await prisma.user.findFirst({
      where: { email, tenantId },
    });

    if (!user) {
      await recordLoginAttempt({ tenantId, userId: null, req, success: false, failureReason: 'user_not_found' });
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      await recordLoginAttempt({ tenantId, userId: user.id, req, success: false, failureReason: 'account_locked' });
      return res.status(423).json({ error: 'Account locked due to too many failed attempts. Try again later.' });
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      await recordLoginAttempt({ tenantId, userId: user.id, req, success: false, failureReason: 'invalid_password' });
      await handleFailedLoginAttempt(user);
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (user.lockedUntil) {
      await prisma.user.update({ where: { id: user.id }, data: { lockedUntil: null } });
    }
    await recordLoginAttempt({ tenantId, userId: user.id, req, success: true });

    // Generate access token
    const accessToken = generateAccessToken(user);

    // Create refresh token with rotation support
    const deviceInfo = {
      type: 'web',
      trustLevel: 'trusted',
    };

    const refreshTokenData = await refreshTokenService.createRefreshToken(
      user,
      deviceInfo,
      req.ip,
      req.get('User-Agent'),
    );

    // Record metrics
    await tokenMetricsService.recordTokenGeneration(user.id, user.tenantId, 'access', deviceInfo);
    await tokenMetricsService.recordTokenGeneration(user.id, user.tenantId, 'refresh', deviceInfo);

    res.json({
      accessToken,
      refreshToken: refreshTokenData.refreshToken,
      userId: user.id,
      tenant: { id: req.tenant.id, slug: req.tenant.slug },
    });
  } catch (error) {
    console.error('[Login] Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const refresh = async (req, res) => {
  const tenantId = req.tenant?.id;

  try {
    const { refreshToken } = req.body;

    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant context is required' });
    }

    if (!refreshToken) {
      return res.status(401).json({ error: 'Refresh token is required' });
    }

    // Extract device info from request for rotation tracking
    const deviceInfo = {
      type: 'web',
      trustLevel: 'trusted',
    };

    // Rotate refresh token and get new access token
    const tokens = await refreshTokenService.rotateRefreshToken(
      refreshToken,
      deviceInfo,
      req.ip,
      req.get('User-Agent'),
    );
    const decoded = jwt.decode(tokens.accessToken);

    // Record successful refresh metrics
    await tokenMetricsService.recordTokenRefresh(
      decoded.userId,
      decoded.tenantId,
      true,
      'rotation',
    );
    await tokenMetricsService.recordTokenGeneration(
      decoded.userId,
      decoded.tenantId,
      'access',
      deviceInfo,
    );
    await tokenMetricsService.recordTokenGeneration(
      decoded.userId,
      decoded.tenantId,
      'refresh',
      deviceInfo,
    );

    res.json(tokens);
  } catch (error) {
    console.error('[Refresh] Error:', error.message);

    // Record failed refresh attempt
    if (error.message.includes('blacklisted')) {
      await tokenMetricsService.recordTokenRefresh('unknown', tenantId, false, error.message);
      await tokenMetricsService.recordSuspiciousActivity(
        'unknown',
        tenantId,
        'blacklisted_refresh_token',
        { error: error.message },
      );
      return res.status(403).json({ error: 'Token has been revoked for security reasons' });
    }
    if (error.message.includes('Invalid') || error.message.includes('expired')) {
      await tokenMetricsService.recordTokenRefresh('unknown', tenantId, false, error.message);
      return res.status(403).json({ error: 'Invalid or expired refresh token' });
    }
    if (error.message.includes('revoked')) {
      await tokenMetricsService.recordTokenRefresh('unknown', tenantId, false, error.message);
      await tokenMetricsService.recordSuspiciousActivity(
        'unknown',
        tenantId,
        'revoked_token_attempt',
        { error: error.message },
      );
      return res.status(403).json({ error: 'All tokens have been revoked' });
    }

    res.status(500).json({ error: 'Internal server error' });
  }
};

export const logout = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    const tenantId = req.tenant?.id;

    if (refreshToken) {
      // Revoke the specific refresh token
      await refreshTokenService.revokeRefreshToken(refreshToken, 'logout');

      // Record revocation metrics
      await tokenMetricsService.recordTokenRevocation('unknown', tenantId, 'logout');
    }

    // If user is authenticated, we could also revoke all their tokens
    // for a complete logout across all devices
    if (req.user && req.body.logoutAll) {
      await refreshTokenService.revokeAllUserTokens(req.user.userId, tenantId, 'logout_all');

      await tokenMetricsService.recordTokenRevocation(req.user.userId, tenantId, 'logout_all');
    }

    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('[Logout] Error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// New endpoint to revoke all user tokens (emergency logout)
export const revokeAll = async (req, res) => {
  try {
    const tenantId = req.tenant?.id;

    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    await refreshTokenService.revokeAllUserTokens(req.user.userId, tenantId, 'user_request');

    await tokenMetricsService.recordTokenRevocation(req.user.userId, tenantId, 'user_request');

    res.json({ message: 'All tokens revoked successfully' });
  } catch (error) {
    console.error('[RevokeAll] Error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// New endpoint to list active sessions
export const sessions = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const activeTokens = await refreshTokenService.getUserActiveTokens(
      req.user.userId,
      req.tenant?.id,
    );

    res.json({
      sessions: activeTokens.map((token) => ({
        id: token.id,
        deviceInfo: token.deviceInfo,
        ipAddress: token.ipAddress,
        userAgent: token.userAgent,
        createdAt: token.createdAt,
        lastUsedAt: token.lastUsedAt,
        expiresAt: token.expiresAt,
      })),
    });
  } catch (error) {
    console.error('[Sessions] Error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export default { register, login, refresh, logout, revokeAll, sessions };
