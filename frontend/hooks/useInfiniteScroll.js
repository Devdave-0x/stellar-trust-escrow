'use client';

import { useEffect, useRef } from 'react';

/**
 * useInfiniteScroll — observes a sentinel element and invokes `onLoadMore`
 * when it scrolls into view, as long as there is more data to load and no
 * fetch is already in flight.
 *
 * Falls back gracefully when IntersectionObserver is unavailable (older
 * browsers, some test environments) — in that case callers should offer a
 * manual "Load more" button alongside the sentinel.
 *
 * @param {{
 *   hasMore: boolean,
 *   isLoading: boolean,
 *   onLoadMore: () => void,
 *   rootMargin?: string,
 * }} options
 * @returns {{ sentinelRef: React.MutableRefObject }}
 */
export function useInfiniteScroll({ hasMore, isLoading, onLoadMore, rootMargin = '200px' }) {
  const sentinelRef = useRef(null);
  const callbackRef = useRef(onLoadMore);

  useEffect(() => {
    callbackRef.current = onLoadMore;
  }, [onLoadMore]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore || isLoading) return undefined;
    if (typeof IntersectionObserver === 'undefined') return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          callbackRef.current();
        }
      },
      { rootMargin },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, isLoading, rootMargin]);

  return { sentinelRef };
}

export default useInfiniteScroll;
