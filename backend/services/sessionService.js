/**
 * Session Service
 *
 * Tracks active login sessions per device in the `user_sessions` table so users
 * can see everywhere they're logged in and revoke individual devices or "sign
 * out everywhere else". `userId` is the Stellar wallet address — the
 * authenticated principal for wallet-signature logins (see UserSession in
 * schema.prisma for why this isn't a hard FK into `users`).
 *
 * Only a SHA-256 hash of the JWT `jti` is stored, never the raw token.
 */

import crypto from 'crypto';
import prisma from '../lib/prisma.js';

/** How often last_active_at is allowed to be bumped, to avoid write amplification. */
const TOUCH_INTERVAL_MS = 60 * 1000;

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

/** Record a new session at login/refresh time. */
export async function recordSession({ userId, jti, deviceName, ipAddress }) {
  return prisma.userSession.create({
    data: {
      userId,
      tokenHash: hashToken(jti),
      deviceName: deviceName ?? null,
      ipAddress: ipAddress ?? null,
    },
  });
}

/** Whether a session for this jti still exists (i.e. hasn't been revoked). */
export async function isSessionValid(jti) {
  if (!jti) return false;
  const session = await prisma.userSession.findUnique({ where: { tokenHash: hashToken(jti) } });
  return !!session;
}

/** Bumps last_active_at for the session, but at most once per minute. */
export async function touchSession(jti) {
  if (!jti) return;
  const cutoff = new Date(Date.now() - TOUCH_INTERVAL_MS);
  await prisma.userSession.updateMany({
    where: { tokenHash: hashToken(jti), lastActiveAt: { lt: cutoff } },
    data: { lastActiveAt: new Date() },
  });
}

/** List a user's active sessions, most recently active first, with the current one flagged. */
export async function listSessions(userId, currentJti) {
  const sessions = await prisma.userSession.findMany({
    where: { userId },
    orderBy: { lastActiveAt: 'desc' },
  });
  const currentHash = currentJti ? hashToken(currentJti) : null;
  return sessions.map(({ tokenHash, ...session }) => ({
    ...session,
    current: tokenHash === currentHash,
  }));
}

/** Revoke a single session by its row id, scoped to its owner. Returns whether a row was deleted. */
export async function revokeSession(userId, sessionId) {
  const result = await prisma.userSession.deleteMany({ where: { id: sessionId, userId } });
  return result.count > 0;
}

/** Revoke the session tied to a specific jti (used on logout/refresh). */
export async function revokeSessionByJti(jti) {
  if (!jti) return;
  await prisma.userSession.deleteMany({ where: { tokenHash: hashToken(jti) } });
}

/** Revoke every session for a user except the current one ("sign out everywhere else"). */
export async function revokeAllExcept(userId, currentJti) {
  const currentHash = currentJti ? hashToken(currentJti) : null;
  return prisma.userSession.deleteMany({
    where: {
      userId,
      ...(currentHash ? { tokenHash: { not: currentHash } } : {}),
    },
  });
}

export default {
  recordSession,
  isSessionValid,
  touchSession,
  listSessions,
  revokeSession,
  revokeSessionByJti,
  revokeAllExcept,
};
