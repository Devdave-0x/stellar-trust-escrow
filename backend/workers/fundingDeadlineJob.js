/**
 * Funding Deadline Auto-Cancel Job
 *
 * Runs hourly (see scheduler.js). Finds Draft escrows past their
 * funding_deadline, cancels them, and notifies both parties.
 */

import prisma from '../lib/prisma.js';
import emailService from '../services/emailService.js';

async function notifyParticipants(escrow) {
  const addresses = [escrow.clientAddress, escrow.freelancerAddress].filter(Boolean);
  if (addresses.length === 0) return;

  const users = await prisma.user.findMany({
    where: { walletAddress: { in: addresses } },
  });

  const recipients = users
    .filter((user) => Boolean(user.email))
    .map((user) => ({ email: user.email, address: user.walletAddress }));

  if (recipients.length === 0) return;

  const baseUrl = process.env.EMAIL_BASE_URL || `http://localhost:${process.env.PORT || 4000}`;

  await emailService.notifyEscrowStatusChange({
    escrowId: escrow.id.toString(),
    previousStatus: 'Draft',
    status: 'Cancelled',
    dashboardUrl: `${baseUrl}/escrows/${escrow.id}`,
    recipients,
  });
}

/**
 * Cancels Draft escrows whose funding_deadline has passed and notifies both parties.
 * Detects scheduler drift by identifying escrows that were already marked Cancelled.
 *
 * @param {Date} [now] — override for testing
 * @returns {Promise<{ checked: number, cancelled: number, newlyExpired: number, alreadyExpired: number, failed: number }>}
 */
export async function cancelExpiredDraftEscrows(now = new Date()) {
  const allExpiredEscrows = await prisma.escrow.findMany({
    where: {
      fundingDeadline: { lt: now },
      status: { in: ['Draft', 'Cancelled'] },
    },
  });

  const draftEscrows = allExpiredEscrows.filter((e) => e.status === 'Draft');
  const alreadyExpiredEscrows = allExpiredEscrows.filter((e) => e.status === 'Cancelled');

  let cancelled = 0;
  let failed = 0;

  for (const escrow of draftEscrows) {
    await prisma.escrow.update({
      where: { id: escrow.id },
      data: { status: 'Cancelled' },
    });

    try {
      await notifyParticipants(escrow);
    } catch (err) {
      console.error(`[FundingDeadlineJob] Failed to notify escrow ${escrow.id}:`, err.message);
      failed += 1;
    }

    cancelled += 1;
  }

  const summary = {
    checked: allExpiredEscrows.length,
    cancelled,
    newlyExpired: draftEscrows.length,
    alreadyExpired: alreadyExpiredEscrows.length,
    failed,
  };

  console.log('[FundingDeadlineJob] Summary:', summary);
  return summary;
}

export default { cancelExpiredDraftEscrows };
