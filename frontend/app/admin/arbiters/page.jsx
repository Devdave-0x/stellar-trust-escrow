'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAdminStore } from '../../../store/app-store';
import { adminFetch } from '../../../store/admin';
import ArbiterWorkloadHeatmap from '../../../components/admin/ArbiterWorkloadHeatmap';

/** Auto-refresh interval, and the minimum gap between manual refreshes. */
const REFRESH_MS = 60_000;
const MIN_MANUAL_REFRESH_MS = 15_000;

export default function ArbiterWorkloadPage() {
  const { apiKey } = useAdminStore();
  const [weeks, setWeeks] = useState(8);
  const [tenantId, setTenantId] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const lastLoadRef = useRef(0);

  const load = useCallback(async () => {
    if (!apiKey) return;
    setLoading(true);
    setError(null);
    lastLoadRef.current = Date.now();
    try {
      const params = new URLSearchParams({ weeks: String(weeks) });
      if (tenantId.trim()) params.set('tenantId', tenantId.trim());
      const res = await adminFetch(`/api/admin/arbiters/workload?${params}`, apiKey);
      if (!res.ok) throw new Error(`Failed to load workload (HTTP ${res.status})`);
      setData(await res.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [apiKey, weeks, tenantId]);

  // Load on filter change, then refresh on a fixed, bounded interval.
  useEffect(() => {
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  const canRefresh = !loading && Date.now() - lastLoadRef.current >= MIN_MANUAL_REFRESH_MS;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-2xl font-bold text-white">Arbiter workload</h1>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-gray-400">
            Window
            <select className="input-field block" value={weeks} onChange={(e) => setWeeks(Number(e.target.value))}>
              {[4, 8, 12].map((w) => (
                <option key={w} value={w}>
                  {w} weeks
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-gray-400">
            Tenant
            <input
              className="input-field block"
              placeholder="All tenants"
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
            />
          </label>
          <button type="button" className="btn-secondary text-sm" disabled={!canRefresh} onClick={load}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {!apiKey && <p className="text-sm text-gray-400">Sign in with an admin API key to view workload.</p>}
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
      {data && <ArbiterWorkloadHeatmap data={data} />}
      {data && (
        <p className="text-xs text-gray-500">
          Updated {new Date(data.generatedAt).toLocaleTimeString()} · refreshes every {REFRESH_MS / 1000}s
        </p>
      )}
    </div>
  );
}
