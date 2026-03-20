/**
 * useReputation Hook
 *
 * Fetches reputation data for a Stellar address from the backend API.
 *
 * Usage:
 *   const { reputation, badge, isLoading } = useReputation(address);
 *
 * TODO (contributor — medium, Issue #39):
 * Implement with SWR — similar pattern to useEscrow.
 * Cache aggressively (revalidateOnFocus: false) since reputation
 * changes infrequently.
 */

'use client';

const BADGE_THRESHOLDS = {
  ELITE: 1000,
  EXPERT: 500,
  VERIFIED: 250,
  TRUSTED: 100,
};

/**
 * Derives the reputation badge label from a score.
 *
 * @param {number} score
 * @returns {'ELITE'|'EXPERT'|'VERIFIED'|'TRUSTED'|'NEW'}
 *
 * TODO (contributor — easy, Issue #39): implement thresholds
 */
export function getBadgeFromScore(score) {
  if (score >= BADGE_THRESHOLDS.ELITE) return 'ELITE';
  if (score >= BADGE_THRESHOLDS.EXPERT) return 'EXPERT';
  if (score >= BADGE_THRESHOLDS.VERIFIED) return 'VERIFIED';
  if (score >= BADGE_THRESHOLDS.TRUSTED) return 'TRUSTED';
  return 'NEW';
}

/**
 * @param {string|null} address — Stellar public key
 * @returns {{ reputation: object|null, badge: string, isLoading: boolean, error: Error|null }}
 *
 * TODO (contributor — Issue #39): replace stub with SWR fetch
 */
export function useReputation(address) {
  // TODO: implement
  return {
    reputation: null,
    badge: 'NEW',
    isLoading: false,
    error: address ? new Error('useReputation not implemented — see Issue #39') : null,
  };
}
