'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { Search, SlidersHorizontal, X, ChevronLeft, ChevronRight } from 'lucide-react';
import Spinner from '../../components/ui/Spinner';
// import EscrowCard from '../../components/escrow/EscrowCard';
import EscrowListItem from '../../components/escrow/EscrowListItem';
import DisputeModal from '../../components/escrow/DisputeModal';
import SearchFilters from '../../components/explorer/SearchFilters';
import EmptyState from '../../components/ui/EmptyState';
import ErrorBoundary from '../../components/error/ErrorBoundary';
import { useEscrowFilterParams } from '../../hooks/useEscrowFilterParams';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const PAGE_SIZE = 12;
const SCROLL_KEY = 'explorer-scroll-y';
const PAGINATION_ENABLED = process.env.NEXT_PUBLIC_EXPLORER_PAGINATION_ENABLED !== 'false';

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

function ExplorerContent() {
  const router = useRouter();
  const { filters, setFilter, resetFilters, copyFilterUrl, activeFilterCount, apiQueryString } =
    useEscrowFilterParams();

  const [search, setSearch] = useState(filters.q);
  const [showFilters, setShowFilters] = useState(false);
  const [escrows, setEscrows] = useState([]);
  const [cursor, setCursor] = useState(initialCursor);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [disputeEscrowId, setDisputeEscrowId] = useState(null);

  // Reset and reload from scratch when filters/search change
  useEffect(() => {
    setSearch(filters.q);
  }, [filters.q]);

    setLoading(true);
    setError(null);
    fetch(`${API_BASE}/api/escrows?${apiQueryString}`)
      .then((r) => {
        if (!r.ok) throw new Error(`API error ${r.status}`);
        return r.json();
      })
      .then(({ data, next_cursor, has_more, hasNextPage }) => {
        if (requestVersion !== requestVersionRef.current) return;
        const more = has_more ?? hasNextPage ?? false;
        setEscrows((data || []).map(normaliseEscrow));
        setCursor(next_cursor ?? null);
        setHasMore(more);
      })
      .catch((err) => {
        if (err.name !== 'AbortError' && requestVersion === requestVersionRef.current) {
          setError(err.message);
        }
      })
      .finally(() => {
        if (requestVersion === requestVersionRef.current) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [apiQueryString]);

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
            onChange={(e) => {
              setSearch(e.target.value);
              setFilter('q', e.target.value || null, { history: 'replace', debounce: 300 });
            }}
          />
          {search && (
            <button
              onClick={() => {
                setSearch('');
                setFilter('q', null, { history: 'replace' });
              }}
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
          <div className="w-56 flex-shrink-0 card">
            <SearchFilters
              filters={filters}
              onFilterChange={setFilter}
              onReset={resetFilters}
              onCopyLink={copyFilterUrl}
              activeFilterCount={activeFilterCount}
            />
          </div>
        )}

        <div className="flex-1 min-w-0">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-24 gap-4 text-gray-400">
              <Spinner />
              <p className="text-sm">Loading escrows...</p>
            </div>
          ) : error && escrows.length === 0 ? (
            <div className="text-center py-16" role="alert">
              <p className="text-red-400 mb-3">Failed to load escrows</p>
              <p className="text-gray-500 text-sm">{error}</p>
            </div>
          ) : escrows.length === 0 ? (
            <EmptyState
              title="No escrows found"
              description="No escrows match your current criteria."
              actionLabel={activeFilterCount > 0 ? 'Clear all filters' : 'Create Escrow'}
              onAction={activeFilterCount > 0 ? resetFilters : undefined}
              actionHref={activeFilterCount > 0 ? undefined : '/escrow/create'}
            />
          ) : (
            <div
              className={`grid gap-4 ${showFilters ? 'md:grid-cols-2' : 'md:grid-cols-2 lg:grid-cols-3'}`}
            >
              {escrows.map((escrow) => (
                <EscrowListItem
                  key={escrow.id}
                  escrow={escrow}
                  canReleaseAll={escrow.status === 'Active'}
                  onDispute={(e) => setDisputeEscrowId(Number(e.id))}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {!loading && meta.totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={!meta.hasPreviousPage}
            onClick={() => setFilter('page', Math.max(1, filters.page - 1), { history: 'push' })}
          >
            <ChevronLeft size={14} />
            Prev
          </Button>
          <span className="text-sm text-gray-400">
            Page {filters.page} of {meta.totalPages || 1}
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={!meta.hasNextPage}
            onClick={() => setFilter('page', filters.page + 1, { history: 'push' })}
          >
            Next
            <ChevronRight size={14} />
          </Button>
        </div>
      )}

      {disputeEscrowId !== null && (
        <DisputeModal isOpen onClose={() => setDisputeEscrowId(null)} escrowId={disputeEscrowId} />
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
