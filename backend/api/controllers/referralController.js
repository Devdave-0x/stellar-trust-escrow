/**
 * Referral Controller
 *
 * Exposes the authenticated wallet's referral code and referral activity.
 * Identity here is the Stellar address (this app authenticates by wallet
 * signature — see api/middleware/auth.js), not a `users` row.
 *
 * @module controllers/referralController
 */

import prisma from '../../lib/prisma.js';
import { buildPaginatedResponse, parsePagination } from '../../lib/pagination.js';
import referralService from '../../services/referralService.js';

function sanitizeErrorMessage(err, fallback) {
  const raw = typeof err?.message === 'string' ? err.message.trim() : '';
  if (!raw) return fallback;
  return raw
    .replace(/bearer\s+[a-z0-9._-]+/gi, 'Bearer [redacted]')
    .replace(/\b(token|secret|password|apikey|api[-_ ]key)\b\s*[:=]\s*\S+/gi, '$1=[redacted]');
}

/**
 * GET /api/users/me/referral
 * Returns the caller's referral code, total referrals, and pending rewards.
 * A code is generated and persisted on first request if the caller's profile
 * doesn't have one yet.
 */
const getMyReferral = async (req, res) => {
  try {
    const address = req.user?.address;
    if (!address) return res.status(401).json({ error: 'Authentication required' });

    let profile = await prisma.userProfile.findUnique({
      where: { address },
      select: { referralCode: true },
    });

    if (!profile?.referralCode) {
      const referralCode = await referralService.createUniqueReferralCode(prisma);
      profile = await prisma.userProfile.upsert({
        where: { address },
        create: { address, tenantId: req.tenant?.id, referralCode },
        update: { referralCode },
        select: { referralCode: true },
      });
    }

    const [totalReferrals, pendingRewards] = await Promise.all([
      prisma.referral.count({ where: { referrerAddress: address } }),
      prisma.referral.count({ where: { referrerAddress: address, rewardedAt: null } }),
    ]);

    res.json({
      referralCode: profile.referralCode,
      totalReferrals,
      pendingRewards,
    });
  } catch (err) {
    res.status(500).json({
      error: `Unable to load referral summary: ${sanitizeErrorMessage(
        err,
        'unexpected referral lookup failure',
      )}`,
    });
  }
};

/**
 * GET /api/users/me/referrals
 * Returns an anonymised list of referrals credited to the caller — the
 * referral's recorded date only, no PII.
 */
const getMyReferrals = async (req, res) => {
  try {
    const address = req.user?.address;
    if (!address) return res.status(401).json({ error: 'Authentication required' });

    const { page, limit, skip } = parsePagination(req.query);

    const [referrals, total] = await prisma.$transaction([
      prisma.referral.findMany({
        where: { referrerAddress: address },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true, rewardedAt: true },
      }),
      prisma.referral.count({ where: { referrerAddress: address } }),
    ]);

    const data = referrals.map((r) => ({
      joinedAt: r.createdAt,
      rewarded: r.rewardedAt !== null,
    }));

    res.json(buildPaginatedResponse(data, { total, page, limit }));
  } catch (err) {
    res.status(500).json({
      error: `Unable to load referral activity: ${sanitizeErrorMessage(
        err,
        'unexpected referral activity lookup failure',
      )}`,
    });
  }
};

/**
 * Parse an optional ISO date query param; returns null when absent and
 * throws on garbage.
 */
function parseDateParam(value, name) {
  if (value === undefined || value === '') return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) throw Object.assign(new Error(`${name} must be an ISO date`), { status: 400 });
  return date;
}

/**
 * GET /api/users/me/referrals/stats?from=&to=
 * Referral drilldown for the dashboard: conversions, pending rewards,
 * invalid referrals and claim history, optionally limited to referrals
 * created within [from, to].
 *
 * Status per referral:
 *   invalid   — self-referral (can never earn a reward)
 *   rewarded  — reward claimed (rewardedAt set); these form the claim history
 *   converted — referred wallet has taken part in at least one escrow; reward pending
 *   pending   — no escrow activity yet
 */
const getMyReferralStats = async (req, res) => {
  try {
    const address = req.user?.address;
    if (!address) return res.status(401).json({ error: 'Authentication required' });

    const from = parseDateParam(req.query.from, 'from');
    const to = parseDateParam(req.query.to, 'to');
    if (from && to && from > to) return res.status(400).json({ error: 'from must be before to' });

    const referrals = await prisma.referral.findMany({
      where: {
        referrerAddress: address,
        ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 1000,
      select: { referredAddress: true, createdAt: true, rewardedAt: true },
    });

    const referred = referrals.map((r) => r.referredAddress);
    const active = referred.length
      ? await prisma.escrow.findMany({
          where: { OR: [{ clientAddress: { in: referred } }, { freelancerAddress: { in: referred } }] },
          select: { clientAddress: true, freelancerAddress: true },
        })
      : [];
    const converted = new Set(active.flatMap((e) => [e.clientAddress, e.freelancerAddress]));

    const items = referrals.map((r) => {
      const status =
        r.referredAddress === address
          ? 'invalid'
          : r.rewardedAt
            ? 'rewarded'
            : converted.has(r.referredAddress)
              ? 'converted'
              : 'pending';
      return { joinedAt: r.createdAt, rewardedAt: r.rewardedAt, status };
    });

    const count = (status) => items.filter((i) => i.status === status).length;
    res.json({
      range: { from, to },
      totals: {
        referrals: items.length,
        conversions: count('converted') + count('rewarded'),
        pendingRewards: count('converted'),
        invalid: count('invalid'),
        claimed: count('rewarded'),
      },
      referrals: items,
      claimHistory: items.filter((i) => i.status === 'rewarded').map((i) => ({ rewardedAt: i.rewardedAt, joinedAt: i.joinedAt })),
    });
  } catch (err) {
    res.status(err.status ?? 500).json({
      error: err.status ? err.message : `Unable to load referral stats: ${sanitizeErrorMessage(err, 'unexpected referral stats failure')}`,
    });
  }
};

export default { getMyReferral, getMyReferrals, getMyReferralStats };
