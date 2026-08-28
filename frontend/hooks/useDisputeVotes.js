'use client';

// Poll interval for refreshing vote state from the dispute API.
export const DISPUTE_VOTES_REFRESH_INTERVAL_MS = 15_000;
// Maximum number of vote records returned per request.
export const DISPUTE_VOTES_PAGE_LIMIT = 25;

export function useDisputeVotes() {
  return {
    votes: [],
    isLoading: false,
    error: null,
    refreshInterval: DISPUTE_VOTES_REFRESH_INTERVAL_MS,
    limit: DISPUTE_VOTES_PAGE_LIMIT,
  };
}
