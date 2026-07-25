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
 *
 * @param {Date} [now] — override for testing
 * @returns {Promise<{ checked: number, cancelled: number }>}
 */
export async function cancelExpiredDraftEscrows(now = new Date()) {
  const expired = await prisma.escrow.findMany({
    where: { status: 'Draft', fundingDeadline: { lt: now } },
  });

  let cancelled = 0;
  for (const escrow of expired) {
    await prisma.escrow.update({
      where: { id: escrow.id },
      data: { status: 'Cancelled' },
    });

    try {
      await notifyParticipants(escrow);
    } catch (err) {
      console.error(`[FundingDeadlineJob] Failed to notify escrow ${escrow.id}:`, err.message);
    }

    cancelled += 1;
  }

  return { checked: expired.length, cancelled };
}

export default { cancelExpiredDraftEscrows };
