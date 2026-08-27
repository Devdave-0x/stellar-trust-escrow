'use client';

import useSWR from 'swr';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const fetcher = (url) => fetch(url, { credentials: 'include' }).then((r) => r.json());

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

export function useReputation(address) {
  const { data, error, isLoading } = useSWR(
    address ? `${API_URL}/api/reputation/${address}` : null,
    fetcher,
    {
      revalidateOnFocus: false,
      refreshInterval: 60_000,
    },
  );

  return {
    reputation: data ?? null,
    badge: data ? getBadgeFromScore(data.totalScore ?? 0) : 'NEW',
    isLoading,
    error: error ?? null,
  };
}
