'use client';

import { useCallback, useEffect, useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3001';

export function normaliseManifest(manifest) {
  if (!manifest || typeof manifest !== 'object') return null;
  return {
    id: manifest.id || manifest.exportId || 'latest',
    format: String(manifest.format || 'unknown').toUpperCase(),
    filters: manifest.filters || {},
    rowCount: manifest.rowCount ?? manifest.row_count ?? 0,
    checksum: manifest.checksum || manifest.sha256 || 'Unavailable',
    generatedAt: manifest.generatedAt || manifest.generated_at || null,
  };
}

export default function ExportManifestViewer({ address }) {
  const [manifests, setManifests] = useState([]);
  const [loading, setLoading] = useState(Boolean(address));

  const load = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/users/${encodeURIComponent(address)}/export/manifests`, { credentials: 'include' });
      if (!response.ok) throw new Error('manifest endpoint unavailable');
      const data = await response.json();
      const entries = data?.manifests || data?.data || [];
      setManifests(entries.map(normaliseManifest).filter(Boolean));
    } catch {
      // Old exports predate manifests; an empty history is a valid state.
      setManifests([]);
    } finally { setLoading(false); }
  }, [address]);

  useEffect(() => { load(); }, [load]);

  return (
    <section className="card p-6 space-y-4" aria-labelledby="export-manifests-heading">
      <div className="flex items-center justify-between gap-3"><div><h2 id="export-manifests-heading" className="text-lg font-semibold text-white">Export history</h2><p className="text-sm text-gray-400">Verify filters, row counts, checksums, and generation time.</p></div><button type="button" onClick={load} className="text-xs text-indigo-300">Refresh</button></div>
      {loading ? <p role="status" className="text-sm text-gray-400">Loading manifests…</p> : manifests.length === 0 ? <p className="rounded-lg border border-gray-800 p-3 text-sm text-gray-500">No manifest is available for older exports.</p> : (
        <div className="space-y-3">{manifests.map((manifest) => <article key={manifest.id} className="rounded-xl border border-gray-800 p-4 text-sm"><div className="flex flex-wrap justify-between gap-2"><strong className="text-white">{manifest.format} export</strong><span className="text-gray-500">{manifest.generatedAt ? new Date(manifest.generatedAt).toLocaleString() : 'Generation time unavailable'}</span></div><dl className="mt-3 grid gap-2 sm:grid-cols-3"><div><dt className="text-xs text-gray-500">Rows</dt><dd className="text-gray-200">{manifest.rowCount}</dd></div><div><dt className="text-xs text-gray-500">Checksum</dt><dd className="break-all font-mono text-xs text-gray-300">{manifest.checksum}</dd></div><div><dt className="text-xs text-gray-500">Filters</dt><dd className="break-words text-xs text-gray-300">{Object.keys(manifest.filters).length ? JSON.stringify(manifest.filters) : 'None'}</dd></div></dl></article>)}</div>
      )}
    </section>
  );
}
