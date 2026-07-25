'use client';

/**
 * useFilterState
 *
 * Bidirectionally syncs a filter + pagination object with Next.js URL query
 * params. All filter changes use router.replace() so the browser history is
 * not polluted. Explicit page navigations (setPage) use router.push() so that
 * back/forward restores the correct page.
 *
 * Usage:
 *   const { filters, page, setFilter, setFilters, setPage, resetFilters } =
 *     useFilterState({ defaults, paramKey? });
 *
 * @param {object} opts
 * @param {object} opts.defaults        — default filter values (must be stable)
 * @param {string} [opts.pageParam='page'] — query param name for the page number
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function readFromParams(searchParams, defaults, pageParam) {
  const filters = { ...defaults };

  for (const key of Object.keys(defaults)) {
    const raw = searchParams.get(key);
    if (raw === null) continue;

    const def = defaults[key];
    if (Array.isArray(def)) {
      filters[key] = raw ? raw.split(',') : [];
    } else {
      filters[key] = raw;
    }
  }

  const rawPage = searchParams.get(pageParam);
  const page = rawPage ? Math.max(1, Number(rawPage)) : 1;

  return { filters, page };
}

function buildParams(filters, page, defaults, pageParam) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(filters)) {
    const def = defaults[key];
    if (Array.isArray(value)) {
      if (value.length) params.set(key, value.join(','));
    } else if (value !== '' && value !== def) {
      params.set(key, String(value));
    }
  }

  if (page > 1) params.set(pageParam, String(page));

  return params;
}

export function useFilterState({ defaults, pageParam = 'page' } = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const initial = readFromParams(searchParams, defaults, pageParam);
  const [filters, setFiltersState] = useState(initial.filters);
  const [page, setPageState] = useState(initial.page);

  // Keep a ref so the URL-sync effect always sees the latest values without
  // triggering extra re-renders from stale closures.
  const stateRef = useRef({ filters, page });
  stateRef.current = { filters, page };

  // Sync state → URL whenever filters or page change.
  useEffect(() => {
    const params = buildParams(filters, page, defaults, pageParam);
    const qs = params.toString();
    const current = new URL(window.location.href);
    if (current.search === (qs ? `?${qs}` : '')) return;
    router.replace(`${current.pathname}${qs ? `?${qs}` : ''}`, { scroll: false });
  }, [filters, page, defaults, pageParam, router]);

  // Sync URL → state on back/forward navigation.
  useEffect(() => {
    const { filters: urlFilters, page: urlPage } = readFromParams(
      searchParams,
      defaults,
      pageParam,
    );

    if (
      JSON.stringify(urlFilters) !== JSON.stringify(stateRef.current.filters) ||
      urlPage !== stateRef.current.page
    ) {
      setFiltersState(urlFilters);
      setPageState(urlPage);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const setFilter = useCallback((key, value) => {
    setFiltersState((prev) => ({ ...prev, [key]: value }));
    setPageState(1);
  }, []);

  const setFilters = useCallback((next) => {
    setFiltersState(next);
    setPageState(1);
  }, []);

  const setPage = useCallback(
    (nextPage) => {
      setPageState(nextPage);
      // Use push so back/forward navigates between pages.
      const params = buildParams(stateRef.current.filters, nextPage, defaults, pageParam);
      const qs = params.toString();
      const current = new URL(window.location.href);
      router.push(`${current.pathname}${qs ? `?${qs}` : ''}`, { scroll: false });
    },
    [defaults, pageParam, router],
  );

  const resetFilters = useCallback(() => {
    setFiltersState({ ...defaults });
    setPageState(1);
  }, [defaults]);

  return { filters, page, setFilter, setFilters, setPage, resetFilters };
}
