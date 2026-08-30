'use client';

/**
 * AnalyticsDashboard Component
 *
 * Renders the escrow analytics dashboard with stat cards, metrics, and activity breakdowns.
 * Displays an accessible, layout-stable loading state (skeletons + spinner) while data is pending,
 * preserving error handling and background refresh functionality.
 */

import { useState, useEffect } from 'react';
import Skeleton from './ui/Skeleton';
import Spinner from './ui/Spinner';
import StatCard from './ui/StatCard';
import ErrorAlert from './ui/ErrorAlert';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

/**
 * Skeleton placeholder for dashboard cards during initial load.
 */

function AnalyticsSkeletonGrid() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading analytics dashboard"
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 w-full"
      role="status"
    >
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="card p-4 flex flex-col gap-3 min-h-[100px] justify-between border border-gray-800 bg-gray-900/50 rounded-xl"
        >
          <div className="flex items-center justify-between">
            <Skeleton className="w-24 h-3 bg-gray-700/60" variant="text" />
            <Skeleton className="w-5 h-5 rounded-full bg-gray-700/60" />
          </div>
          <Skeleton className="w-20 h-7 bg-gray-700/60 mt-1" variant="heading" />
          <Skeleton className="w-16 h-3 bg-gray-800" variant="text" />
        </div>
      ))}
    </div>
  );
}

export default function AnalyticsDashboard({
  address,
  data: initialData = null,
  loading: externalLoading,
  error: externalError = null,
  onRetry,
}) {
  const [data, setData] = useState(initialData);
  const [internalLoading, setInternalLoading] = useState(!initialData && Boolean(address));
  const [internalError, setInternalError] = useState(null);

  useEffect(() => {
    if (initialData) {
      setData(initialData);
      setInternalLoading(false);
    }
  }, [initialData]);

  useEffect(() => {
    if (!address || initialData) return;

    let isMounted = true;
    setInternalLoading(true);
    setInternalError(null);

    fetch(`${API_BASE}/api/escrows/stats/${address}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP error ${res.status}`);
        return res.json();
      })
      .then((result) => {
        if (isMounted) {
          if (result.error) throw new Error(result.error);
          setData(result);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setInternalError(err.message || 'Failed to fetch analytics data');
        }
      })
      .finally(() => {
        if (isMounted) {
          setInternalLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [address, initialData]);

  const isLoading = externalLoading ?? (internalLoading && !data);
  const error = externalError || internalError;

  // Initial loading state — render accessible skeleton grid
  if (isLoading && !data) {
    return (
      <div className="space-y-4 w-full">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-white tracking-tight">Analytics Overview</h2>
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <Spinner size="sm" />
            <span>Fetching data…</span>
          </div>
        </div>
        <AnalyticsSkeletonGrid />
      </div>
    );
  }

  // Error state — render error alert with optional retry handler
  if (error && !data) {
    return (
      <div className="w-full space-y-3">
        <ErrorAlert message={`Could not load analytics: ${error}`} />
        {onRetry && (
          <button
            className="px-3 py-1.5 text-xs font-medium text-indigo-400 bg-indigo-950/40 border border-indigo-800/60 rounded-lg hover:bg-indigo-900/50 transition-colors"
            onClick={onRetry}
            type="button"
          >
            🔄 Retry Loading
          </button>
        )}
      </div>
    );
  }

  const metrics = data || {};
  const total = metrics.total ?? metrics.totalEscrows ?? 0;
  const active = metrics.active ?? metrics.activeEscrows ?? 0;
  const completed = metrics.completed ?? metrics.completedEscrows ?? 0;
  const disputed = metrics.disputed ?? metrics.disputedEscrows ?? 0;
  const tvl = metrics.totalValueLocked ?? '0';
  const successRate = metrics.successRate != null ? `${metrics.successRate}%` : 'N/A';

  return (
    <div className="space-y-4 w-full" role="region" aria-label="Analytics Dashboard">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white tracking-tight">Analytics Overview</h2>
        {isLoading && data && (
          <div className="flex items-center gap-2 text-xs text-indigo-400" role="status">
            <Spinner size="sm" />
            <span>Updating…</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 w-full">
        <StatCard icon="📦" label="Total Escrows" value={total} />
        <StatCard icon="🔒" label="Active" value={active} />
        <StatCard icon="✅" label="Completed" value={completed} />
        <StatCard icon="⚠️" label="Disputed" value={disputed} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
        <StatCard icon="💰" label="Total Value Locked" value={tvl} />
        <StatCard icon="📈" label="Success Rate" value={successRate} />
      </div>
    </div>
  );
}
