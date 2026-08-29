'use client';

import { useState, useCallback } from 'react';
import useSWR from 'swr';
import useSWRInfinite from 'swr/infinite';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const fetcher = (url) => fetch(url, { credentials: 'include' }).then((r) => r.json());

const ESCROW_POLL_INTERVAL_MS = 30_000;
const DEFAULT_PAGE_LIMIT = 20;
const USER_ESCROWS_LIMIT = 50;

/**
 * Standardized null/undefined check helper.
 */
export function isNil(value) {
  return value == null;
}

export function useEscrow(id) {
  const isValidId = !isNil(id) && id !== '' && id !== 0;
  const { data, error, isLoading, mutate } = useSWR(
    isValidId ? `${API_URL}/api/escrows/${id}` : null,
    fetcher,
    {
      refreshInterval: ESCROW_POLL_INTERVAL_MS,
      refreshWhenHidden: false,
    },
  );
  return { escrow: data, isLoading, error, mutate };
}

export function useUserEscrows(address, role = 'all') {
  const param = role === 'client' ? 'client' : role === 'freelancer' ? 'freelancer' : null;
  const query = !isNil(param) ? `${param}=${encodeURIComponent(address)}` : `client=${encodeURIComponent(address)}`;

  const { data, error, isLoading } = useSWR(
    !isNil(address) && address !== '' ? `${API_URL}/api/escrows?${query}&limit=${USER_ESCROWS_LIMIT}` : null,
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

export function useEscrowList({ limit = DEFAULT_PAGE_LIMIT, status = '', sortBy = 'createdAt', sortOrder = 'desc' } = {}) {
  const buildUrl = useCallback(
    (cursor) => {
      const params = new URLSearchParams();
      params.set('limit', String(limit));
      if (!isNil(status) && status !== '') params.set('status', status);
      if (!isNil(sortBy) && sortBy !== '') params.set('sortBy', sortBy);
      if (!isNil(sortOrder) && sortOrder !== '') params.set('sortOrder', sortOrder);
      if (!isNil(cursor) && cursor !== '') params.set('cursor', cursor);
      return `${API_URL}/api/escrows?${params.toString()}`;
    },
    [limit, status, sortBy, sortOrder],
  );

  const getKey = useCallback(
    (pageIndex, previousPageData) => {
      if (pageIndex === 0) return buildUrl(null);
      if (isNil(previousPageData) || !previousPageData.has_more) return null;
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
  const lastPage = !isNil(pages) && pages.length > 0 ? pages[pages.length - 1] : null;
  const hasMore = lastPage?.has_more ?? false;

  const loadMore = useCallback(() => {
    if (hasMore) setSize((s) => s + 1);
  }, [hasMore, setSize]);

  return {
    pages: pages ?? [],
    escrows: (pages ?? []).flatMap((p) => p?.data ?? []),
    total: !isNil(pages) && pages.length > 0 ? (pages[0]?.total ?? 0) : 0,
    isLoading,
    isLoadingMore,
    hasMore,
    error: error ?? null,
    loadMore,
  };
}

export function useEscrowPage(cursor = null, { limit = DEFAULT_PAGE_LIMIT, status = '' } = {}) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (!isNil(status) && status !== '') params.set('status', status);
  if (!isNil(cursor) && cursor !== '') params.set('cursor', cursor);

  const { data, error, isLoading } = useSWR(
    `${API_URL}/api/escrows?${params.toString()}`,
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
