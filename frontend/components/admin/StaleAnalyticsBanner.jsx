'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminFetch } from '../../store/admin';

/**
 * Warns admins when analytics snapshots are stale, so decisions are not made
 * from outdated metrics. Lists stale metric names with their last generated
 * time, and how to retry. Renders nothing when everything is fresh.
 *
 * @param {object} props
 * @param {string} props.apiKey
 * @param {Function} [props.fetchFreshness] — injectable for tests
 */
export default function StaleAnalyticsBanner({ apiKey, fetchFreshness }) {
  const [state, setState] = useState(null);

  const load = useCallback(async () => {
    try {
      const data = fetchFreshness
        ? await fetchFreshness()
        : await adminFetch('/api/admin/analytics/freshness', apiKey).then((r) => (r.ok ? r.json() : null));
      setState(data);
    } catch {
      setState(null); // the banner is advisory; never block the dashboard
    }
  }, [apiKey, fetchFreshness]);

  useEffect(() => {
    load();
  }, [load]);

  if (!state) return null;
  if (state.hasSnapshots && state.stale.length === 0) return null;

  return (
    <div role="alert" className="mb-6 rounded-lg border border-amber-500/60 bg-amber-500/10 p-4 text-sm" data-testid="stale-analytics-banner">
      <p className="font-semibold text-amber-300">
        {state.hasSnapshots ? 'Some analytics are out of date' : 'No analytics snapshots have been generated yet'}
      </p>
      {state.stale.length > 0 && (
        <ul className="mt-2 space-y-1 text-amber-100">
          {state.stale.map((s) => (
            <li key={`${s.metric}-${s.period}`}>
              <span className="font-mono">{s.metric}</span> ({s.period}) — last generated{' '}
              {s.lastGeneratedAt ? new Date(s.lastGeneratedAt).toLocaleString() : 'never'}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-amber-100/80">
        Treat these numbers with caution. Check that the analytics scheduler is running, then{' '}
        <button type="button" className="underline" onClick={load}>
          check again
        </button>
        . See the analytics freshness runbook for manual rebuild steps.
      </p>
    </div>
  );
}
