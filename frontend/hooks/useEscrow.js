'use client';

import { useState, useCallback } from 'react';
import useSWR from 'swr';
import useSWRInfinite from 'swr/infinite';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const fetcher = (url) => fetch(url, { credentials: 'include' }).then((r) => r.json());

/**
 * Fetch a single escrow by ID.
 * Polls every 30 seconds; pauses automatically when the page is hidden.
 *
 * @param {number|string} id — escrow_id
 * @returns {{ escrow: object|null, isLoading: boolean, error: Error|null, mutate: Function }}
 */
export function useEscrow(id) {
  const { data, error, isLoading, mutate } = useSWR(
    id ? `${API_URL}/api/escrows/${id}` : null,
    fetcher,
    {
      refreshInterval: 30_000, // poll every 30 seconds
      refreshWhenHidden: false, // pause polling when page is not visible
    },
  );
  return { escrow: data, isLoading, error, mutate };
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
    address ? `${API_URL}/api/escrows?${query}&limit=50` : null,
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
 */
export function useEscrowList({ limit = 20, status = '', sortBy = 'createdAt', sortOrder = 'desc' } = {}) {
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
    isLoading,
    isLoadingMore,
    hasMore,
    error,
    loadMore,
  };
}

/**
 * Simple single-page cursor hook — fetch one page at a time with manual navigation.
 *
 * @param {string|null} cursor — pass null for the first page, then pass next_cursor from response
 * @param {{ limit?: number, status?: string }} options
 */
export function useEscrowPage(cursor = null, { limit = 20, status = '' } = {}) {
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
