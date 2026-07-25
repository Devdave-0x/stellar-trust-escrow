'use client';

import { useState, useRef, useEffect, useCallback, Suspense } from 'react';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import Spinner from '../../components/ui/Spinner';
import EscrowCard from '../../components/escrow/EscrowCard';
import SearchFilters from '../../components/explorer/SearchFilters';
import EmptyState from '../../components/ui/EmptyState';
import ErrorBoundary from '../../components/error/ErrorBoundary';
import { useFilterState } from '../../hooks/useFilterState';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const PAGE_SIZE = 12;
const SCROLL_KEY = 'explorer-scroll-y';

const DEFAULT_FILTERS = {
  status: '',
  minAmount: '',
  maxAmount: '',
  dateFrom: '',
  dateTo: '',
  sort: '',
};

function normaliseEscrow(e) {
  return {
    id: String(e.id),
    title: `Escrow #${e.id}`,
    status: e.status,
    totalAmount: `${Number(e.totalAmount).toLocaleString()} USDC`,
    milestoneProgress: '0 / 0',
    counterparty: e.clientAddress
      ? `${e.clientAddress.slice(0, 4)}…${e.clientAddress.slice(-4)}`
      : '—',
    role: 'client',
    deadline: e.deadline || null,
    assetSymbol: e.assetSymbol || 'USDC',
  };
}

function useInfiniteEscrows({ search, filters }) {
  const [escrows, setEscrows] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const abortRef = useRef(null);

  const buildUrl = useCallback(
    (cur) => {
      const params = new URLSearchParams();
      params.set('limit', String(PAGE_SIZE));
      if (search) params.set('search', search);
      if (filters.status) params.set('status', filters.status);
      if (filters.minAmount) params.set('minAmount', filters.minAmount);
      if (filters.maxAmount) params.set('maxAmount', filters.maxAmount);
      if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
      if (filters.dateTo) params.set('dateTo', filters.dateTo);
      if (filters.sort) {
        const [sortBy, sortOrder] = filters.sort.split(':');
        params.set('sortBy', sortBy);
        params.set('sortOrder', sortOrder || 'desc');
      } else {
        params.set('sortBy', 'createdAt');
        params.set('sortOrder', 'desc');
      }
      if (cur) params.set('cursor', cur);
      return `${API_BASE}/api/escrows?${params.toString()}`;
    },
    [search, filters],
  );

  // Reset and reload from scratch when filters/search change
  useEffect(() => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setLoading(true);
    setError(null);
    setEscrows([]);
    setCursor(null);
    setHasMore(true);

    fetch(buildUrl(null), { signal: ctrl.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`API error ${r.status}`);
        return r.json();
      })
      .then(({ data, next_cursor, has_more, hasNextPage }) => {
        const more = has_more ?? hasNextPage ?? false;
        setEscrows((data || []).map(normaliseEscrow));
        setCursor(next_cursor ?? null);
        setHasMore(more);
      })
      .catch((err) => {
        if (err.name !== 'AbortError') setError(err.message);
      })
      .finally(() => setLoading(false));

    return () => ctrl.abort();
  }, [buildUrl]);

  const loadMore = useCallback(() => {
    if (!hasMore || loadingMore || loading) return;

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setLoadingMore(true);
    fetch(buildUrl(cursor), { signal: ctrl.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`API error ${r.status}`);
        return r.json();
      })
      .then(({ data, next_cursor, has_more, hasNextPage }) => {
        const more = has_more ?? hasNextPage ?? false;
        setEscrows((prev) => [...prev, ...(data || []).map(normaliseEscrow)]);
        setCursor(next_cursor ?? null);
        setHasMore(more);
      })
      .catch((err) => {
        if (err.name !== 'AbortError') setError(err.message);
      })
      .finally(() => setLoadingMore(false));
  }, [buildUrl, cursor, hasMore, loadingMore, loading]);

  return { escrows, hasMore, loading, loadingMore, error, loadMore };
}

function ExplorerContent() {
  const { filters, setFilter, setFilters, resetFilters } = useFilterState({
    defaults: DEFAULT_FILTERS,
    pageParam: 'page',
  });

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const debounceTimer = useRef(null);
  useEffect(() => {
    clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(debounceTimer.current);
  }, [search]);

  const { escrows, hasMore, loading, loadingMore, error, loadMore } = useInfiniteEscrows({
    search: debouncedSearch,
    filters,
  });

  // IntersectionObserver sentinel for auto-loading next page
  const sentinelRef = useRef(null);
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore && !loading) {
          loadMore();
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, loading, loadMore]);

  // Restore scroll position when returning from detail page
  useEffect(() => {
    const savedY = sessionStorage.getItem(SCROLL_KEY);
    if (savedY) {
      window.scrollTo(0, Number(savedY));
      sessionStorage.removeItem(SCROLL_KEY);
    }
  }, []);

  const handleEscrowClick = useCallback(() => {
    sessionStorage.setItem(SCROLL_KEY, String(window.scrollY));
  }, []);

  const handleFilterChange = useCallback(
    (key, value) => {
      if (key === 'statuses') {
        setFilter('status', Array.isArray(value) ? value.join(',') : value);
      } else {
        setFilter(key, value);
      }
    },
    [setFilter],
  );

  const handleReset = useCallback(() => {
    resetFilters();
    setSearch('');
    setDebouncedSearch('');
  }, [resetFilters]);

  const filtersForPanel = {
    statuses: filters.status ? filters.status.split(',') : [],
    minAmount: filters.minAmount,
    maxAmount: filters.maxAmount,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    sort: filters.sort || 'createdAt:desc',
  };

  const activeFilterCount =
    filtersForPanel.statuses.length +
    (filters.minAmount ? 1 : 0) +
    (filters.maxAmount ? 1 : 0) +
    (filters.dateFrom ? 1 : 0) +
    (filters.dateTo ? 1 : 0) +
    (filters.sort && filters.sort !== 'createdAt:desc' ? 1 : 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Escrow Explorer</h1>
        <p className="text-gray-400 mt-1">Browse all public escrow agreements.</p>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" aria-hidden="true" />
          <label htmlFor="explorer-search" className="sr-only">Search escrows</label>
          <input
            id="explorer-search"
            type="search"
            placeholder="Search by escrow ID or address..."
            className="w-full bg-gray-900 border border-gray-800 rounded-lg pl-9 pr-4 py-2.5 text-white"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search escrows by ID or address"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
              aria-label="Clear search"
            >
              <X size={14} aria-hidden="true" />
            </button>
          )}
        </div>

        <button
          onClick={() => setShowFilters((v) => !v)}
          aria-expanded={showFilters}
          aria-controls="explorer-filters"
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg border bg-gray-900 border-gray-800 text-gray-300"
        >
          <SlidersHorizontal size={15} aria-hidden="true" />
          Filters
          {activeFilterCount > 0 && (
            <span className="text-xs" aria-label={`${activeFilterCount} active filters`}>
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      <div className={`flex gap-6 ${showFilters ? 'items-start' : ''}`}>
        {showFilters && (
          <div id="explorer-filters" className="w-56 flex-shrink-0 card">
            <SearchFilters
              filters={filtersForPanel}
              onChange={handleFilterChange}
              onReset={handleReset}
            />
          </div>
        )}

        <div className="flex-1 min-w-0">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-24 gap-4 text-gray-400">
              <Spinner />
              <p className="text-sm">Loading escrows...</p>
            </div>
          ) : error ? (
            <div className="text-center py-16" role="alert">
              <p className="text-red-400 mb-3">Failed to load escrows</p>
              <p className="text-gray-500 text-sm">{error}</p>
            </div>
          ) : escrows.length === 0 ? (
            <EmptyState
              title="No escrows found"
              description="No escrows match your current criteria."
              actionLabel={activeFilterCount > 0 ? 'Clear all filters' : 'Create Escrow'}
              onAction={activeFilterCount > 0 ? handleReset : undefined}
              actionHref={activeFilterCount > 0 ? undefined : '/escrow/create'}
            />
          ) : (
            <>
              <div
                className={`grid gap-4 ${showFilters ? 'md:grid-cols-2' : 'md:grid-cols-2 lg:grid-cols-3'}`}
                onClick={handleEscrowClick}
              >
                {escrows.map((escrow) => (
                  <EscrowCard key={escrow.id} escrow={escrow} />
                ))}
              </div>

              {/* Sentinel element — triggers next page load when scrolled into view */}
              <div ref={sentinelRef} className="h-1" aria-hidden="true" />

              {/* Loading more indicator */}
              {loadingMore && (
                <div className="flex items-center justify-center gap-3 py-8 text-gray-400">
                  <Spinner size="sm" />
                  <span className="text-sm">Loading more...</span>
                </div>
              )}

              {/* End of list */}
              {!hasMore && !loadingMore && escrows.length > 0 && (
                <p className="text-center text-sm text-gray-500 py-8">
                  All escrows loaded
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ExplorerPage() {
  return (
    <ErrorBoundary>
      <Suspense
        fallback={
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-gray-400">
            <Spinner />
            <p className="text-sm">Loading escrows...</p>
          </div>
        }
      >
        <ExplorerContent />
      </Suspense>
    </ErrorBoundary>
  );
}
