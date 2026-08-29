'use client';

// Base URL for fetching dispute votes from the API.
export const DISPUTE_API_URL = process.env.NEXT_PUBLIC_DISPUTE_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

// Poll interval for refreshing vote state from the dispute API.
export const DISPUTE_VOTES_REFRESH_INTERVAL_MS = process.env.NEXT_PUBLIC_DISPUTE_VOTES_REFRESH_INTERVAL_MS
  ? Number(process.env.NEXT_PUBLIC_DISPUTE_VOTES_REFRESH_INTERVAL_MS)
  : 15_000;

// Maximum number of vote records returned per request.
export const DISPUTE_VOTES_PAGE_LIMIT = process.env.NEXT_PUBLIC_DISPUTE_VOTES_PAGE_LIMIT
  ? Number(process.env.NEXT_PUBLIC_DISPUTE_VOTES_PAGE_LIMIT)
  : 25;

export function useDisputeVotes() {
  return {
    votes: [],
    isLoading: false,
    error: null,
    apiUrl: DISPUTE_API_URL,
    refreshInterval: DISPUTE_VOTES_REFRESH_INTERVAL_MS,
    limit: DISPUTE_VOTES_PAGE_LIMIT,
  };
}
