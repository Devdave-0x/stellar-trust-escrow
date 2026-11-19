'use client';

import { useState, useCallback, useRef } from 'react';
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
 * Build a stable key identifying a single wallet action so that repeated
 * invocations (double-clicks, re-renders, refreshes) can be deduplicated.
 *
 * @param {{ escrowId?: number|string, action?: string, milestoneId?: number|string }} parts
 * @returns {string}
 */
export function walletActionKey({ escrowId, action, milestoneId } = {}) {
  return [escrowId ?? '', action ?? '', milestoneId ?? ''].join(':');
}

/**
 * Fetch a single escrow by ID.
 * Polls every 30 seconds; pauses automatically when the page is hidden.
 *
 * Also exposes `submitWalletAction`, a wrapper that locks the given action
 * while its transaction is pending so double-clicks and refreshes cannot
 * submit the same wallet action twice. The lock is cleared and the escrow is
 * refreshed (via `mutate`) once the transaction confirms or fails.
 *
 * @param {number|string} id — escrow_id
 * @returns {{
 *   escrow: object|null,
 *   isLoading: boolean,
 *   error: Error|null,
 *   mutate: Function,
 *   pendingActions: Set<string>,
 *   isActionPending: (parts: object) => boolean,
 *   submitWalletAction: (parts: object, submit: Function) => Promise<any>,
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

  // In-flight wallet actions keyed by walletActionKey(). A ref backs the
  // synchronous guard (state updates are async and would let a fast
  // double-click slip through), while state drives re-renders for the UI.
  const inFlightRef = useRef(new Set());
  const [pendingActions, setPendingActions] = useState(() => new Set());

  const isActionPending = useCallback(
    (parts) => inFlightRef.current.has(walletActionKey(parts)),
    [],
  );

  const submitWalletAction = useCallback(
    async (parts, submit) => {
      const key = walletActionKey(parts);
      // Already pending (e.g. double-click or a refresh that re-triggers the
      // action): ignore the duplicate and do not submit another transaction.
      if (inFlightRef.current.has(key)) return undefined;

      inFlightRef.current.add(key);
      setPendingActions(new Set(inFlightRef.current));

      try {
        const result = await submit();
        return result;
      } finally {
        // Reconcile after confirmation or failure: release the lock and
        // refresh the escrow so the UI settles on a clear final state.
        inFlightRef.current.delete(key);
        setPendingActions(new Set(inFlightRef.current));
        try {
          await mutate();
        } catch {
          // Refresh failures must not mask the original submit outcome.
        }
      }
    },
    [mutate],
  );

  return {
    escrow: data,
    isLoading,
    error,
    mutate,
    pendingActions,
    isActionPending,
    submitWalletAction,
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
