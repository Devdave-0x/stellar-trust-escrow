'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import useSWR from 'swr';
import useSWRInfinite from 'swr/infinite';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const fetcher = (url) => fetch(url, { credentials: 'include' }).then((r) => r.json());

// Single-escrow poll cadence — fast enough to feel live, slow enough to stay cheap at scale.
const ESCROW_POLL_INTERVAL_MS = 30_000;
// Default page size for list/cursor endpoints when the caller doesn't specify one.
const DEFAULT_PAGE_LIMIT = 20;
// Cap for the user-escrows list, which has no pagination controls in the UI yet.
const USER_ESCROWS_LIMIT = 50;

/**
 * Extract the ledger/sequence marker from an escrow payload, if present.
 * Different endpoints expose this under slightly different names, so we
 * probe the common ones and fall back to null when nothing is available.
 */
function getLedgerMarker(escrow) {
  if (!escrow || typeof escrow !== 'object') return null;
  const candidates = [
    escrow.ledger,
    escrow.ledger_sequence,
    escrow.ledgerSequence,
    escrow.last_ledger,
    escrow.lastLedger,
  ];
  for (const value of candidates) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return null;
}

/**
 * Fetch a single escrow by ID.
 * Polls every 30 seconds; pauses automatically when the page is hidden.
 *
 * After a transaction reaches a final ledger, call `refreshAfterConfirmation`
 * to invalidate/refetch the escrow query so the UI never shows stale indexed
 * state. Indexer lag (the indexed escrow trailing the latest confirmed ledger)
 * is surfaced separately via `isIndexerLagging` so the UI can render it
 * distinctly. Out-of-order responses are guarded against: an older ledger is
 * never allowed to overwrite a newer one.
 *
 * @param {number|string} id — escrow_id
 * @returns {{
 *   escrow: object|null,
 *   isLoading: boolean,
 *   error: Error|null,
 *   mutate: Function,
 *   refreshAfterConfirmation: Function,
 *   isIndexerLagging: boolean,
 *   confirmedLedger: number|null,
 *   indexedLedger: number|null,
 * }}
 */
export function useEscrow(id) {
  const { data, error, isLoading, mutate } = useSWR(
    id ? `${API_URL}/api/escrows/${id}` : null,
    fetcher,
    {
      refreshInterval: ESCROW_POLL_INTERVAL_MS,
      refreshWhenHidden: false, // pause polling when page is not visible
    },
  );

  // Latest confirmed ledger observed for this escrow (set after a tx confirms).
  const [confirmedLedger, setConfirmedLedger] = useState(null);
  // The most recent escrow snapshot we've accepted, guarded by ledger order.
  const [escrow, setEscrow] = useState(null);
  const lastAcceptedLedgerRef = useRef(null);

  // Apply incoming SWR data, but never let an older ledger overwrite a newer
  // one (out-of-order responses / stale caches).
  useEffect(() => {
    if (!data) return;
    const incomingLedger = getLedgerMarker(data);
    const lastAccepted = lastAcceptedLedgerRef.current;

    if (
      incomingLedger !== null &&
      lastAccepted !== null &&
      incomingLedger < lastAccepted
    ) {
      // Stale update — ignore it so the status doesn't revert.
      return;
    }

    if (incomingLedger !== null) {
      lastAcceptedLedgerRef.current = incomingLedger;
    }
    setEscrow(data);
  }, [data]);

  // Reset guards when the escrow id changes.
  useEffect(() => {
    lastAcceptedLedgerRef.current = null;
    setEscrow(null);
    setConfirmedLedger(null);
  }, [id]);

  const indexedLedger = getLedgerMarker(escrow);

  const isIndexerLagging =
    confirmedLedger !== null &&
    (indexedLedger === null || indexedLedger < confirmedLedger);

  /**
   * Invalidate and refetch the escrow query after a transaction reaches a
   * final ledger. Optionally records the confirmed ledger so indexer lag can
   * be detected until the indexer catches up.
   *
   * @param {{ ledger?: number, ledgerSequence?: number }} [confirmation]
   */
  const refreshAfterConfirmation = useCallback(
    async (confirmation) => {
      const ledger =
        typeof confirmation === 'number'
          ? confirmation
          : confirmation?.ledger ?? confirmation?.ledgerSequence ?? null;

      if (typeof ledger === 'number' && Number.isFinite(ledger)) {
        setConfirmedLedger((prev) => (prev === null || ledger > prev ? ledger : prev));
      }

      // Invalidate the cache entry and force a fresh fetch.
      return mutate(undefined, { revalidate: true });
    },
    [mutate],
  );

  return {
    escrow,
    isLoading,
    error,
    mutate,
    refreshAfterConfirmation,
    isIndexerLagging,
    confirmedLedger,
    indexedLedger,
  };
}

/**
 * Fetch all escrows for the connected user (cursor-based pagination).
 *
 * @param {string} address — Stellar public key
 * @param {'client'|'freelancer'|'all'} role
 * @returns {{ escrows: Array, isLoading: boolean, error: Error|null }}
 */
export function useUserEscrows(address, role = 'all') {
  const param = role === 'client' ? 'client' : role === 'freelancer' ? 'freelancer' : null;
  const query = param ? `${param}=${encodeURIComponent(address)}` : `client=${encodeURIComponent(address)}`;

  const { data, error, isLoading } = useSWR(
    address ? `${API_URL}/api/escrows?${query}&limit=${USER_ESCROWS_LIMIT}` : null,
    fetcher,
  );

  return {
    escrows: data?.data ?? [],
    nextCursor: data?.next_cursor ?? null,
    hasMore: data?.has_more ?? false,
    isLoading,
    error: error ?? null,
  };
}

/**
 * Fetch a cursor-paginated list of escrows (for Explorer).
 *
 * The API now returns { data, next_cursor, has_more } instead of
 * offset-based { data, page, total, totalPages }.
 *
 * Usage:
 *   const { pages, loadMore, isLoading, isLoadingMore, hasMore } = useEscrowList({ limit: 20, status: 'Active' });
 *   const allEscrows = pages.flatMap(p => p.data);
 *
 * @param {{ limit?: number, status?: string, sortBy?: string, sortOrder?: string }} options
 * @returns {{ pages: Array, escrows: Array, total: number, isLoading: boolean, isLoadingMore: boolean, hasMore: boolean, error: Error|null, loadMore: Function }}
 */
export function useEscrowList({ limit = DEFAULT_PAGE_LIMIT, status = '', sortBy = 'createdAt', sortOrder = 'desc' } = {}) {
  const buildUrl = useCallback(
    (cursor) => {
      const params = new URLSearchParams();
      params.set('limit', String(limit));
      if (status) params.set('status', status);
      if (sortBy) params.set('sortBy', sortBy);
      if (sortOrder) params.set('sortOrder', sortOrder);
      if (cursor) params.set('cursor', cursor);
      return `${API_URL}/api/escrows?${params.toString()}`;
    },
    [limit, status, sortBy, sortOrder],
  );

  // SWR infinite uses a key function: receives the previous page's data to
  // compute the next page's key (URL with cursor).
  const getKey = useCallback(
    (pageIndex, previousPageData) => {
      // First page: no cursor
      if (pageIndex === 0) return buildUrl(null);
      // End of list: previous page had no more results
      if (!previousPageData?.has_more) return null;
      return buildUrl(previousPageData.next_cursor);
    },
    [buildUrl],
  );

  const { data: pages, error, isLoading, isValidating, size, setSize } = useSWRInfinite(
    getKey,
    fetcher,
    { revalidateFirstPage: false },
  );

  const isLoadingMore = isValidating && size > (pages?.length ?? 0);
  const lastPage = pages?.[pages.length - 1];
  const hasMore = lastPage?.has_more ?? false;

  const loadMore = useCallback(() => {
    if (hasMore) setSize((s) => s + 1);
  }, [hasMore, setSize]);

  return {
    pages: pages ?? [],
    escrows: (pages ?? []).flatMap((p) => p?.data ?? []),
    total: pages?.[0]?.total ?? 0,
    isLoading,
    isLoadingMore,
    hasMore,
    error: error ?? null,
    loadMore,
  };
}

/**
 * Simple single-page cursor hook — fetch one page at a time with manual navigation.
 *
 * @param {string|null} cursor — pass null for the first page, then pass next_cursor from response
 * @param {{ limit?: number, status?: string }} options
 * @returns {{ escrows: Array, nextCursor: string|null, hasMore: boolean, isLoading: boolean, error: Error|null }}
 */
export function useEscrowPage(cursor = null, { limit = DEFAULT_PAGE_LIMIT, status = '' } = {}) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (status) params.set('status', status);
  if (cursor) params.set('cursor', cursor);

  const { data, error, isLoading } = useSWR(
    `${API_URL}/api/escrows?${params.toString()}`,
    fetcher,
  );

  return {
    escrows: data?.data ?? [],
    nextCursor: data?.next_cursor ?? null,
    hasMore: data?.has_more ?? false,
    isLoading,
    error,
  };
}
