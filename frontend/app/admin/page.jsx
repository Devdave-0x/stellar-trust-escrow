'use client';

/**
 * Admin Dashboard — Main Overview Page
 *
 * Leads with the platform's headline metrics (a KPI row, hero figure first),
 * then two charts derived from the same `/api/admin/stats` payload, then the
 * links into the sub-sections.
 *
 * Access uses the shared frontend store, which persists the admin API key
 * for subsequent sessions and injects it into the `x-admin-api-key` header.
 */

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ClipboardList,
  Flag,
  RefreshCw,
  Scale,
  Settings,
  ShieldCheck,
  TerminalSquare,
  Users,
} from 'lucide-react';
import { useAdminStore } from '../../store/app-store';
import { buildAdminHeaders } from '../../store/admin';
import MetricCard from '../../components/admin/MetricCard';
import EscrowStatusChart from '../../components/admin/EscrowStatusChart';
import DisputeResolutionChart from '../../components/admin/DisputeResolutionChart';
import {
  deriveMetrics,
  formatCount,
  formatPercent,
  useChartTheme,
} from '../../components/admin/chartTheme';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

const NAV_ITEMS = [
  {
    href: '/admin/users',
    label: 'User Management',
    Icon: Users,
    desc: 'View, suspend, or ban users',
  },
  {
    href: '/admin/disputes',
    label: 'Dispute Resolution',
    Icon: Scale,
    desc: 'Review and resolve open disputes',
  },
  {
    href: '/admin/audit-logs',
    label: 'Audit Logs',
    Icon: ClipboardList,
    desc: 'Full log of all admin actions',
  },
  {
    href: '/admin/settings',
    label: 'Platform Settings',
    Icon: Settings,
    desc: 'Manage fees and configuration',
  },
  {
    href: '/admin/flags',
    label: 'Feature Flags',
    Icon: Flag,
    desc: 'Roll features out gradually',
  },
  {
    href: '/admin/console',
    label: 'Operations Console',
    Icon: TerminalSquare,
    desc: 'Cache, secrets, and archival tools',
  },
];

function MetricSkeleton() {
  return (
    <div className="card flex flex-col gap-2" aria-hidden="true">
      <div className="h-3 w-24 animate-pulse rounded bg-gray-300 dark:bg-gray-700" />
      <div className="h-8 w-16 animate-pulse rounded bg-gray-300 dark:bg-gray-700" />
    </div>
  );
}

export default function AdminDashboard() {
  const { apiKey, setApiKey, clearApiKey } = useAdminStore();
  const theme = useChartTheme();
  const [inputKey, setInputKey] = useState('');
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => {
    setInputKey(apiKey);
  }, [apiKey]);

  const fetchStats = useCallback(async (key) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/api/admin/stats`, {
        headers: buildAdminHeaders(key, {}),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to fetch stats');
      }
      setStats(await res.json());
      setLastUpdated(new Date());
    } catch (err) {
      setError(err.message);
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleLogin = (e) => {
    e.preventDefault();
    setApiKey(inputKey);
    fetchStats(inputKey);
  };

  useEffect(() => {
    if (apiKey) fetchStats(apiKey);
  }, [apiKey, fetchStats]);

  const metrics = deriveMetrics(stats);
  // A refetch that already has data holds the previous render at reduced
  // opacity — no skeleton flash, no layout jump.
  const refreshing = loading && stats !== null;
  const firstLoad = loading && stats === null;

  const loadedSummary = [
    `${formatCount(metrics.total)} escrows`,
    `${formatCount(metrics.users)} users`,
    `${formatCount(metrics.open)} open disputes`,
  ].join(', ');
  const statusMessage = loading
    ? 'Loading platform statistics'
    : stats
      ? `Platform statistics updated. ${loadedSummary}.`
      : '';

  return (
    <div className="min-h-screen">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-3">
            <ShieldCheck
              aria-hidden="true"
              className="h-7 w-7 text-indigo-600 dark:text-indigo-400"
            />
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-50">Admin Dashboard</h1>
          </div>
          <p className="text-gray-600 dark:text-gray-400">
            Platform management for StellarTrustEscrow administrators.
          </p>
        </div>

        {/* `aria-disabled` rather than `disabled` on Refresh: a disabled button
            drops keyboard focus to the body mid-refresh. This keeps focus put. */}
        {apiKey && (
          <button
            type="button"
            onClick={() => {
              if (!loading) fetchStats(apiKey);
            }}
            aria-disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 aria-disabled:cursor-not-allowed aria-disabled:opacity-60 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            <RefreshCw
              aria-hidden="true"
              className={`h-4 w-4 ${loading ? 'animate-spin motion-reduce:animate-none' : ''}`}
            />
            Refresh
          </button>
        )}
      </div>

      {/* API Key Login */}
      {!apiKey && (
        <div className="card mx-auto max-w-md">
          <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-50">
            Admin Authentication
          </h2>
          <form onSubmit={handleLogin} className="flex flex-col gap-3">
            <label
              htmlFor="admin-api-key"
              className="text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Admin API key
            </label>
            <input
              type="password"
              id="admin-api-key"
              name="admin-api-key"
              autoComplete="off"
              value={inputKey}
              onChange={(e) => setInputKey(e.target.value)}
              placeholder="Enter admin API key"
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-900 placeholder-gray-500 focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
              required
            />
            <button
              type="submit"
              className="rounded-lg bg-indigo-600 py-2 font-semibold text-white transition-colors hover:bg-indigo-500"
            >
              Authenticate
            </button>
          </form>
          {error && (
            <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-400">
              {error}
            </p>
          )}
        </div>
      )}

      {/* Authenticated view */}
      {apiKey && (
        <>
          <div className="mb-6 flex items-center justify-between rounded-lg border border-gray-200 bg-gray-100 px-4 py-2 dark:border-gray-800 dark:bg-gray-900">
            <span className="text-sm text-gray-600 dark:text-gray-400">
              Authenticated as{' '}
              <span className="font-medium text-emerald-700 dark:text-emerald-400">
                Administrator
              </span>
            </span>
            <button
              type="button"
              onClick={() => {
                clearApiKey();
                setInputKey('');
                setStats(null);
                setLastUpdated(null);
              }}
              className="text-xs text-red-700 transition-colors hover:text-red-600 dark:text-red-400 dark:hover:text-red-300"
            >
              Sign out
            </button>
          </div>

          {error && (
            <div
              role="alert"
              className="mb-6 flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-900/20 dark:text-red-300"
            >
              <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Politely announce load state without stealing focus. */}
          <p className="sr-only" role="status" aria-live="polite">
            {statusMessage}
          </p>

          <section aria-labelledby="platform-metrics-heading" className="mb-8">
            <h2
              id="platform-metrics-heading"
              className="mb-3 text-lg font-semibold text-gray-900 dark:text-gray-50"
            >
              Platform metrics
            </h2>

            {firstLoad ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  // eslint-disable-next-line react/no-array-index-key
                  <MetricSkeleton key={i} />
                ))}
              </div>
            ) : (
              stats && (
                <div
                  className={`grid grid-cols-1 gap-4 transition-opacity duration-200 motion-reduce:transition-none sm:grid-cols-2 lg:grid-cols-4 ${
                    refreshing ? 'opacity-50' : ''
                  }`}
                >
                  <MetricCard
                    hero
                    label="Total escrows"
                    value={formatCount(metrics.total)}
                    sub={
                      `${formatCount(metrics.active)} active · ` +
                      `${formatCount(metrics.completed)} completed`
                    }
                    accent={theme.series.active}
                  />
                  <MetricCard
                    label="Registered users"
                    value={formatCount(metrics.users)}
                    sub="Addresses with a reputation record"
                  />
                  <MetricCard
                    label="Open disputes"
                    value={formatCount(metrics.open)}
                    sub={`${formatCount(metrics.resolved)} resolved to date`}
                    accent={theme.series.disputed}
                  />
                  <MetricCard
                    label="Completion rate"
                    value={formatPercent(metrics.completionRate)}
                    sub={
                      metrics.total > 0
                        ? `${formatCount(metrics.completed)} of ` +
                          `${formatCount(metrics.total)} escrows`
                        : 'No escrows yet'
                    }
                    accent={theme.series.completed}
                  />
                </div>
              )
            )}

            {lastUpdated && (
              <p className="mt-3 text-xs text-gray-500 dark:text-gray-500">
                Last updated{' '}
                <time dateTime={lastUpdated.toISOString()}>
                  {lastUpdated.toLocaleTimeString('en-US')}
                </time>
              </p>
            )}
          </section>

          {stats && (
            <section aria-labelledby="platform-charts-heading" className="mb-8">
              <h2 id="platform-charts-heading" className="sr-only">
                Escrow and dispute charts
              </h2>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <EscrowStatusChart metrics={metrics} busy={refreshing} />
                <DisputeResolutionChart metrics={metrics} busy={refreshing} />
              </div>
            </section>
          )}

          <nav aria-labelledby="admin-sections-heading">
            <h2
              id="admin-sections-heading"
              className="mb-3 text-lg font-semibold text-gray-900 dark:text-gray-50"
            >
              Admin sections
            </h2>
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {NAV_ITEMS.map(({ href, label, Icon, desc }) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="card group flex h-full items-center gap-4 no-underline transition-all duration-200 hover:border-indigo-500/50"
                  >
                    <Icon
                      aria-hidden="true"
                      className="h-6 w-6 shrink-0 text-indigo-600 dark:text-indigo-400"
                    />
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 transition-colors group-hover:text-indigo-700 dark:text-gray-50 dark:group-hover:text-indigo-300">
                        {label}
                      </p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">{desc}</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </>
      )}
    </div>
  );
}
