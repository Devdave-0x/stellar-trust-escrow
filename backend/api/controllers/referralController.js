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
      ...(totalReferrals === 0 && {
        isEmpty: true,
        emptyState: {
          title: 'No referrals yet',
          message: 'Share your referral code to start earning rewards for every friend who joins.',
        },
      }),
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

    const response = buildPaginatedResponse(data, { total, page, limit });

    // Give the caller something actionable to render instead of an
    // empty list with no explanation.
    if (data.length === 0) {
      response.isEmpty = true;
      response.emptyState = {
        title: 'No referrals yet',
        message:
          "You haven't referred anyone yet. Share your referral code with friends to start earning rewards.",
      };
    }

    res.json(response);
  } catch (err) {
    res.status(500).json({
      error: `Unable to load referral activity: ${sanitizeErrorMessage(
        err,
        'unexpected referral activity lookup failure',
      )}`,
    });
  }
};

export default { getMyReferral, getMyReferrals };
