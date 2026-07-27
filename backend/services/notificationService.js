import { randomUUID } from 'crypto';
import prisma from '../lib/prisma.js';
import { notificationQueue } from '../queues/notificationQueue.js';

export const NotificationEvent = {
  ESCROW_FUNDED: 'escrow_funded',
  RELEASE_REQUESTED: 'release_requested',
  DISPUTE_RAISED: 'dispute_raised',
  DISPUTE_RESOLVED: 'dispute_resolved',
  ESCROW_EXPIRING: 'escrow_expiring',
  MILESTONE_COMPLETED: 'milestone_completed',
  ESCROW_STATUS_CHANGED: 'escrow_status_changed',
};

/**
 * Store an in-app notification for the user.
 * @param {number} userId
 * @param {string} tenantId
 * @param {string} event - one of NotificationEvent values
 * @param {object} data
 */
async function storeInApp(userId, tenantId, event, data) {
  return prisma.notification.create({
    data: {
      id: randomUUID(),
      userId,
      tenantId,
      event,
      data,
    },
  });
}

/**
 * Check whether a user has opted in for a given channel/event.
 * Defaults to enabled for all events when no preference row exists.
 * @param {number} userId
 * @param {string} event
 * @param {'email'|'inApp'} channel
 */
async function isEnabled(userId, event, channel) {
  const pref = await prisma.notificationPreference.findUnique({ where: { userId } });
  if (!pref || !pref.preferences[event]) return true; // default on
  return pref.preferences[event][channel] !== false;
}

/**
 * Primary interface: persist in-app notification and enqueue email job.
 * @param {number} userId
 * @param {string} event - one of NotificationEvent values
 * @param {object} data  - event-specific payload
 */
async function send(userId, event, data) {
  // Resolve tenantId and email from DB
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { tenantId: true, email: true } });
  if (!user) throw new Error(`User ${userId} not found`);

  const { tenantId, email } = user;
  const results = { inApp: null, email: null };

  if (await isEnabled(userId, event, 'inApp')) {
    results.inApp = await storeInApp(userId, tenantId, event, data);
  }

  if (email && (await isEnabled(userId, event, 'email'))) {
    results.email = await notificationQueue.add(`notify.${event}`, {
      userId,
      tenantId,
      event,
      email,
      data,
    });
  }

  return results;
}

export default { send, storeInApp, isEnabled, NotificationEvent };
