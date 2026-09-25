/**
 * Profile security activity (passkey/MFA, password and session changes).
 *
 * Merges three sources into one timeline:
 *   - audit log entries by the user in the AUTH category and any action
 *     mentioning MFA, passkeys, passwords or sessions
 *   - MFA methods added (passkey = WEBAUTHN, authenticator app = TOTP)
 *   - sessions started (refresh-token families)
 *
 * Only whitelisted fields are returned. Secrets are never selected: no TOTP
 * secrets, backup codes, credential ids, public keys or token hashes, and IP
 * addresses are masked.
 */

import prisma from '../../lib/prisma.js';
import { logControllerError } from '../../config/logger.js';

const MAX_PER_SOURCE = 500;
const SECURITY_ACTION = /MFA|PASSKEY|WEBAUTHN|TOTP|PASSWORD|SESSION|LOGIN|LOGOUT|AUTH/i;

/** 203.0.113.42 → 203.0.113.x ; IPv6 keeps the first 3 groups. */
export function maskIp(ip) {
  if (!ip || typeof ip !== 'string') return null;
  if (ip.includes('.')) return ip.split('.').slice(0, 3).concat('x').join('.');
  if (ip.includes(':')) return `${ip.split(':').slice(0, 3).join(':')}:…`;
  return null;
}

const LABELS = {
  LOGIN: 'Signed in',
  LOGOUT: 'Signed out',
  AUTH_FAILED: 'Failed sign-in attempt',
};

/** Build the merged, newest-first timeline (pure, for tests). */
export function buildSecurityTimeline({ auditRows = [], mfaMethods = [], sessions = [] }) {
  const items = [
    ...auditRows.map((r) => ({
      type: r.action,
      label: LABELS[r.action] ?? r.action.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()),
      occurredAt: new Date(r.createdAt).toISOString(),
      ip: maskIp(r.ipAddress),
    })),
    ...mfaMethods.map((m) => ({
      type: m.type === 'WEBAUTHN' ? 'PASSKEY_ADDED' : 'MFA_METHOD_ADDED',
      label: m.type === 'WEBAUTHN' ? `Passkey added (${m.name})` : `Authenticator app added (${m.name})`,
      occurredAt: new Date(m.createdAt).toISOString(),
      ip: null,
    })),
    ...sessions.map((s) => ({
      type: 'SESSION_STARTED',
      label: `New session${s.userAgent ? ` on ${String(s.userAgent).slice(0, 80)}` : ''}${s.isActive ? '' : ' (ended)'}`,
      occurredAt: new Date(s.createdAt).toISOString(),
      ip: maskIp(s.ipAddress),
    })),
  ];
  return items.sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : a.occurredAt > b.occurredAt ? -1 : 0));
}

/** GET /api/users/me/security-activity?page=&limit= */
const getMySecurityActivity = async (req, res) => {
  try {
    const address = req.user?.address;
    if (!address) return res.status(401).json({ error: 'Authentication required' });
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));

    const user = await prisma.user.findFirst({ where: { walletAddress: address }, select: { id: true } });
    const [auditRows, mfaMethods, sessions] = await Promise.all([
      prisma.auditLog
        .findMany({
          where: { actor: address },
          orderBy: { createdAt: 'desc' },
          take: MAX_PER_SOURCE,
          select: { action: true, category: true, createdAt: true, ipAddress: true },
        })
        .then((rows) => rows.filter((r) => r.category === 'AUTH' || SECURITY_ACTION.test(r.action))),
      user
        ? prisma.mfaMethod.findMany({
            where: { userId: user.id },
            orderBy: { createdAt: 'desc' },
            take: MAX_PER_SOURCE,
            select: { type: true, name: true, createdAt: true },
          })
        : [],
      user
        ? prisma.refreshToken.findMany({
            where: { userId: user.id },
            distinct: ['familyId'],
            orderBy: { createdAt: 'desc' },
            take: MAX_PER_SOURCE,
            select: { createdAt: true, ipAddress: true, userAgent: true, isActive: true },
          })
        : [],
    ]);

    const timeline = buildSecurityTimeline({ auditRows, mfaMethods, sessions });
    const start = (page - 1) * limit;
    res.json({
      data: timeline.slice(start, start + limit),
      pagination: { page, limit, total: timeline.length, totalPages: Math.max(1, Math.ceil(timeline.length / limit)) },
    });
  } catch (err) {
    logControllerError('user.getMySecurityActivity', err, req);
    res.status(500).json({ error: 'Unable to load security activity' });
  }
};

export default { getMySecurityActivity };
