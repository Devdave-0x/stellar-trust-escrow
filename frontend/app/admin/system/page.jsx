'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAdminStore } from '../../../store/app-store';
import RelayerBalanceStatus from '../../../components/admin/RelayerBalanceStatus';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export default function AdminSystemPage() {
  const { apiKey } = useAdminStore();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE}/api/relayer/status`, {
        headers: { 'x-admin-api-key': apiKey || '' },
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to load relayer status');
      setData(payload);
    } catch (err) {
      setError(err.message);
    } finally {
      setRefreshing(false);
    }
  }, [apiKey]);

  useEffect(() => {
    if (apiKey) refresh();
  }, [apiKey, refresh]);

  if (!apiKey) {
    return <p className="text-sm text-gray-400">Authenticate on the admin dashboard to view system status.</p>;
  }

  return (
    <main className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">System Status</h1>
          <p className="mt-1 text-sm text-gray-400">Monitor relayer health without exposing secret material.</p>
        </div>
        <Link href="/admin" className="text-sm text-indigo-400 hover:text-indigo-300">← Dashboard</Link>
      </div>
      {error && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p>}
      {data && <RelayerBalanceStatus data={data} onRefresh={refresh} refreshing={refreshing} />}
      {!data && !error && <p className="text-sm text-gray-500">Loading system status…</p>}
    </main>
  );
}
