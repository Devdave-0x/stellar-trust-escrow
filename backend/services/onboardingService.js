/**
 * Onboarding Service
 *
 * Tracks a new user's progress through the onboarding checklist and exposes
 * completeStep() as a hook other services call when the underlying action
 * happens (wallet connected, first escrow created, profile completed, ...).
 *
 * @module services/onboardingService
 */

import prisma from '../lib/prisma.js';

export const STEPS = [
  { step: 'verify_email', actionUrl: '/auth/verify-email' },
  { step: 'connect_wallet', actionUrl: '/settings/wallet' },
  { step: 'create_first_escrow', actionUrl: '/escrow/new' },
  { step: 'complete_profile', actionUrl: '/profile/edit' },
  { step: 'invite_counterparty', actionUrl: '/escrow/invite' },
];

const STEP_NAMES = STEPS.map((s) => s.step);

/**
 * Marks a step complete for a user. Idempotent — calling it again for an
 * already-completed step is a no-op and keeps the original completedAt.
 *
 * @param {number} userId
 * @param {string} step - one of STEP_NAMES
 * @returns {Promise<object>} the checklist row
 */
export async function completeStep(userId, step) {
  if (!STEP_NAMES.includes(step)) {
    throw new Error(`Invalid onboarding step: ${step}`);
  }

  const existing = await prisma.onboardingChecklist.findUnique({
    where: { userId_step: { userId, step } },
  });
  if (existing?.completedAt) return existing;

  return prisma.onboardingChecklist.upsert({
    where: { userId_step: { userId, step } },
    update: { completedAt: new Date() },
    create: { userId, step, completedAt: new Date() },
  });
}

/**
 * @param {number} userId
 * @returns {Promise<Array<{step: string, completed: boolean, completedAt: Date|null, actionUrl: string}>>}
 */
export async function getChecklist(userId) {
  const rows = await prisma.onboardingChecklist.findMany({ where: { userId } });
  const completedByStep = new Map(rows.map((r) => [r.step, r.completedAt]));

  return STEPS.map(({ step, actionUrl }) => ({
    step,
    completed: Boolean(completedByStep.get(step)),
    completedAt: completedByStep.get(step) ?? null,
    actionUrl,
  }));
}

/**
 * @param {number} userId
 * @returns {Promise<{total: number, completed: number, percentage: number}>}
 */
export async function getProgress(userId) {
  const checklist = await getChecklist(userId);
  const total = checklist.length;
  const completed = checklist.filter((c) => c.completed).length;
  const percentage = total === 0 ? 0 : Math.round((completed / total) * 100);
  return { total, completed, percentage };
}

export default { STEPS, completeStep, getChecklist, getProgress };
