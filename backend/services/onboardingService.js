/**
 * Onboarding Service (#216)
 *
 * Manages per-user onboarding checklist state. Steps are created lazily on
 * first access and marked complete via the markStep() helper, which is
 * called from other service-layer hooks when the relevant action occurs.
 */

import prisma from '../lib/prisma.js';

/** All steps in display order. */
export const ONBOARDING_STEPS = [
  'verify_email',
  'connect_wallet',
  'create_first_escrow',
  'complete_profile',
  'invite_counterparty',
];

/** Action URLs shown alongside each step so the client can deep-link. */
const STEP_ACTION_URLS = {
  verify_email:          '/settings/email/verify',
  connect_wallet:        '/settings/wallet',
  create_first_escrow:   '/escrows/new',
  complete_profile:      '/settings/profile',
  invite_counterparty:   '/escrows/new?step=invite',
};

/**
 * Ensure every step row exists for a given user+tenant, then return them all.
 * This is idempotent — creating an already-existing row is a no-op.
 *
 * @param {string} userAddress
 * @param {string} tenantId
 * @returns {Promise<Array>}
 */
async function ensureSteps(userAddress, tenantId) {
  // Upsert all steps so we always return a complete list even on first call.
  await Promise.all(
    ONBOARDING_STEPS.map((step) =>
      prisma.onboardingChecklist.upsert({
        where: { userAddress_tenantId_step: { userAddress, tenantId, step } },
        update: {},
        create: { userAddress, tenantId, step },
      }),
    ),
  );

  return prisma.onboardingChecklist.findMany({
    where: { userAddress, tenantId },
    orderBy: { id: 'asc' },
  });
}

/**
 * Return the full checklist with metadata for the API response.
 *
 * @param {string} userAddress
 * @param {string} tenantId
 * @returns {Promise<Array<{step, completed, completedAt, actionUrl}>>}
 */
export async function getChecklist(userAddress, tenantId) {
  const rows = await ensureSteps(userAddress, tenantId);

  return rows.map((row) => ({
    step:        row.step,
    completed:   row.completedAt !== null,
    completedAt: row.completedAt ?? null,
    actionUrl:   STEP_ACTION_URLS[row.step] ?? null,
  }));
}

/**
 * Return aggregate progress for the API response.
 *
 * @param {string} userAddress
 * @param {string} tenantId
 * @returns {Promise<{total, completed, percentage}>}
 */
export async function getProgress(userAddress, tenantId) {
  const rows = await ensureSteps(userAddress, tenantId);
  const total     = rows.length;
  const completed = rows.filter((r) => r.completedAt !== null).length;

  return {
    total,
    completed,
    percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
  };
}

/**
 * Mark a single step as completed (idempotent — safe to call multiple times).
 *
 * @param {string} userAddress
 * @param {string} tenantId
 * @param {string} step  - one of ONBOARDING_STEPS
 * @returns {Promise<void>}
 */
export async function markStep(userAddress, tenantId, step) {
  if (!ONBOARDING_STEPS.includes(step)) return;

  await prisma.onboardingChecklist.upsert({
    where: { userAddress_tenantId_step: { userAddress, tenantId, step } },
    update: { completedAt: new Date() },
    create: { userAddress, tenantId, step, completedAt: new Date() },
  });
}

export default { getChecklist, getProgress, markStep, ONBOARDING_STEPS };
