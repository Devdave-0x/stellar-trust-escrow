'use client';

import { useState, useRef, useEffect, useCallback, Suspense } from 'react';
import { Search, SlidersHorizontal, X, ChevronLeft, ChevronRight } from 'lucide-react';
import Spinner from '../../components/ui/Spinner';
import EscrowCard from '../../components/escrow/EscrowCard';
import SearchFilters from '../../components/explorer/SearchFilters';
import Button from '../../components/ui/Button';
import EmptyState from '../../components/ui/EmptyState';
import ErrorBoundary from '../../components/error/ErrorBoundary';
import { useFilterState } from '../../hooks/useFilterState';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

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
  };
}

function buildApiQuery({ search, filters, page, limit }) {
  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('limit', String(limit));
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
  return params.toString();
}

const PAGE_SIZE = 12;

function ExplorerContent() {
  const { filters, page, setFilter, setFilters, setPage, resetFilters } = useFilterState({
    defaults: DEFAULT_FILTERS,
    pageParam: 'page',
  });

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [escrows, setEscrows] = useState([]);
  const [meta, setMeta] = useState({
    total: 0,
    totalPages: 0,
    hasNextPage: false,
    hasPreviousPage: false,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const debounceTimer = useRef(null);
  useEffect(() => {
    clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setDebouncedSearch(search);
      // Reset to page 1 when search changes; use setFilter to trigger URL replace.
      setFilter('_search_reset', '');
      setPage(1);
    }, 300);
    return () => clearTimeout(debounceTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const qs = buildApiQuery({ search: debouncedSearch, filters, page, limit: PAGE_SIZE });
    fetch(`${API_BASE}/api/escrows?${qs}`)
      .then((r) => {
        if (!r.ok) throw new Error(`API error ${r.status}`);
        return r.json();
      })
      .then(({ data, total, totalPages, hasNextPage, hasPreviousPage }) => {
        if (cancelled) return;
        setEscrows((data || []).map(normaliseEscrow));
        setMeta({ total: total || 0, totalPages: totalPages || 0, hasNextPage, hasPreviousPage });
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedSearch, filters, page]);

  // Adapt the SearchFilters component's (key, value) API to our filter state.
  const handleFilterChange = useCallback(
    (key, value) => {
      if (key === 'statuses') {
        // SearchFilters passes statuses as an array; flatten to comma-separated string for URL.
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

  // Convert the URL string back to array for SearchFilters.
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
          <label htmlFor="explorer-search" className="sr-only">
            Search escrows
          </label>
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
            <div
              className={`grid gap-4 ${showFilters ? 'md:grid-cols-2' : 'md:grid-cols-2 lg:grid-cols-3'}`}
            >
              {escrows.map((escrow) => (
                <EscrowCard key={escrow.id} escrow={escrow} />
              ))}
            </div>
          )}
        </div>
      </div>

      {!loading && meta.totalPages > 1 && (
        <nav aria-label="Escrow list pagination" className="flex items-center justify-center gap-3 pt-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={!meta.hasPreviousPage}
            onClick={() => setPage(Math.max(1, page - 1))}
            aria-label="Previous page"
          >
            <ChevronLeft size={14} aria-hidden="true" />
            Prev
          </Button>
          <span className="text-sm text-gray-400" aria-live="polite" aria-atomic="true">
            Page {page} of {meta.totalPages || 1}
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={!meta.hasNextPage}
            onClick={() => setPage(page + 1)}
            aria-label="Next page"
          >
            Next
            <ChevronRight size={14} aria-hidden="true" />
          </Button>
        </nav>
      )}
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
