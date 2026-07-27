import { randomUUID } from 'crypto';
import prisma from '../lib/prisma.js';
import { NotificationEvent } from './notificationService.js';

const ALL_EVENTS = Object.values(NotificationEvent);
const DEFAULT_CHANNEL = { email: true, inApp: true };

/**
 * Get or create a user's notification preferences.
 * Returns a map of event -> { email: bool, inApp: bool }
 */
async function getPreferences(userId) {
  const row = await prisma.notificationPreference.findUnique({ where: { userId } });
  const stored = row?.preferences || {};

  // Merge stored with defaults so new events are always present
  return ALL_EVENTS.reduce((acc, event) => {
    acc[event] = stored[event] ? { ...DEFAULT_CHANNEL, ...stored[event] } : { ...DEFAULT_CHANNEL };
    return acc;
  }, {});
}

/**
 * Update preferences for a user.
 * @param {number} userId
 * @param {string} tenantId
 * @param {object} updates - partial map of event -> { email?, inApp? }
 */
async function updatePreferences(userId, tenantId, updates) {
  const current = await getPreferences(userId);

  for (const [event, channels] of Object.entries(updates)) {
    if (!ALL_EVENTS.includes(event)) continue;
    current[event] = { ...current[event], ...channels };
  }

  await prisma.notificationPreference.upsert({
    where: { userId },
    update: { preferences: current },
    create: { id: randomUUID(), userId, tenantId, preferences: current },
  });

  return current;
}

/**
 * Opt-out of a specific event channel (or all channels for an event).
 */
async function optOut(userId, tenantId, event, channel = null) {
  const update = channel ? { [channel]: false } : { email: false, inApp: false };
  return updatePreferences(userId, tenantId, { [event]: update });
}

/**
 * Opt back in to a specific event channel (or all channels for an event).
 */
async function optIn(userId, tenantId, event, channel = null) {
  const update = channel ? { [channel]: true } : { email: true, inApp: true };
  return updatePreferences(userId, tenantId, { [event]: update });
}

export default { getPreferences, updatePreferences, optOut, optIn };
