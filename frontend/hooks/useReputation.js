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

import { useCallback, useEffect, useRef, useState } from 'react';

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

function buildReputationError(reason) {
  return new Error(`Unable to load reputation: ${reason}`);
}

/**
 * Resolves the configured reputation API base URL.
 * Falls back to an empty string when no configuration is present.
 *
 * @returns {string}
 */
function getApiBaseUrl() {
  const base =
    typeof process !== 'undefined' && process.env
      ? process.env.NEXT_PUBLIC_API_URL
      : undefined;
  return typeof base === 'string' ? base.replace(/\/+$/, '') : '';
}

/**
 * @param {string|null} address — Stellar public key
 * @returns {{
 *   reputation: object|null,
 *   badge: string,
 *   isLoading: boolean,
 *   error: Error|null,
 *   isUnavailable: boolean,
 * }}
 */
export function useReputation(address) {
  const trimmedAddress = typeof address === 'string' ? address.trim() : '';

  const [reputation, setReputation] = useState(null);
  const [isLoading, setIsLoading] = useState(Boolean(trimmedAddress));
  const [error, setError] = useState(null);
  const [isUnavailable, setIsUnavailable] = useState(false);

  const requestIdRef = useRef(0);

  const load = useCallback(async (targetAddress) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    setReputation(null);
    setError(null);
    setIsUnavailable(false);
    setIsLoading(true);

    const baseUrl = getApiBaseUrl();
    if (!baseUrl) {
      if (requestIdRef.current !== requestId) return;
      setIsLoading(false);
      setIsUnavailable(true);
      setError(buildReputationError('reputation source is not configured'));
      return;
    }

    try {
      const response = await fetch(
        `${baseUrl}/reputation/${encodeURIComponent(targetAddress)}`,
        { headers: { Accept: 'application/json' } }
      );

      if (requestIdRef.current !== requestId) return;

      if (response.status === 404) {
        setIsLoading(false);
        setIsUnavailable(true);
        setError(buildReputationError('no reputation record found'));
        return;
      }

      if (!response.ok) {
        setIsLoading(false);
        setIsUnavailable(true);
        setError(
          buildReputationError(`reputation source responded with ${response.status}`)
        );
        return;
      }

      const data = await response.json();

      if (requestIdRef.current !== requestId) return;

      if (!data || typeof data !== 'object' || typeof data.score !== 'number') {
        setIsLoading(false);
        setIsUnavailable(true);
        setError(buildReputationError('reputation record is missing or malformed'));
        return;
      }

      setIsLoading(false);
      setIsUnavailable(false);
      setError(null);
      setReputation(data);
    } catch (err) {
      if (requestIdRef.current !== requestId) return;
      setIsLoading(false);
      setIsUnavailable(true);
      setError(
        buildReputationError(
          err && err.message ? err.message : 'reputation source is offline'
        )
      );
    }
  }, []);

  useEffect(() => {
    if (!trimmedAddress) {
      requestIdRef.current += 1;
      setReputation(null);
      setIsLoading(false);
      setError(null);
      setIsUnavailable(false);
      return;
    }

    load(trimmedAddress);

    return () => {
      // Invalidate any in-flight request for this address.
      requestIdRef.current += 1;
    };
  }, [trimmedAddress, load]);

  const badge =
    reputation && typeof reputation.score === 'number'
      ? getBadgeFromScore(reputation.score)
      : 'NEW';

  return {
    reputation,
    badge,
    isLoading,
    error,
    isUnavailable,
  };
}
