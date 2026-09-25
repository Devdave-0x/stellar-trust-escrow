'use client';

import { useCallback, useEffect, useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

function formatDate(value) {
  return value ? new Date(value).toLocaleString() : 'No expiration';
}

export default function ShareLinkPanel({ escrowId }) {
  const [links, setLinks] = useState([]);
  const [expiresInDays, setExpiresInDays] = useState(30);
  const [newLink, setNewLink] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/escrows/${escrowId}/share`, { credentials: 'include' });
      if (res.ok) setLinks((await res.json()).links || []);
    } catch { /* optional panel */ }
  }, [escrowId]);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch(`${API_BASE}/api/escrows/${escrowId}/share`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expiresInDays: Number(expiresInDays) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to create share link');
      setNewLink(data);
      await load();
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  };

  const revoke = async (link) => {
    const res = await fetch(`${API_BASE}/api/escrows/${escrowId}/share/${link.id || link.token}`, { method: 'DELETE', credentials: 'include' });
    if (res.ok) { setLinks((current) => current.filter((item) => item.id !== link.id)); setNewLink(null); }
  };

  const copy = async () => {
    if (!newLink?.shareUrl) return;
    await navigator.clipboard?.writeText(newLink.shareUrl);
  };

  return (
    <section className="card space-y-4" aria-labelledby="share-links-heading">
      <div><h2 id="share-links-heading" className="text-sm font-semibold uppercase tracking-wider text-gray-400">Share links</h2><p className="text-xs text-gray-500 mt-1">Links are visible to participants and expire automatically.</p></div>
      {newLink && <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm"><p className="font-medium text-emerald-300">New link created — copy it now. The token is shown only once.</p><code className="mt-2 block break-all text-xs text-gray-200">{newLink.shareUrl}</code><div className="mt-2 flex gap-2"><button type="button" onClick={copy} className="rounded bg-emerald-600 px-3 py-1 text-xs text-white">Copy link</button><button type="button" onClick={() => revoke(newLink)} className="rounded border border-gray-600 px-3 py-1 text-xs text-gray-300">Revoke</button></div></div>}
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      <div className="flex gap-2"><select aria-label="Link expiration" value={expiresInDays} onChange={(e) => setExpiresInDays(e.target.value)} className="rounded bg-gray-800 px-2 py-2 text-sm text-white"><option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option></select><button type="button" onClick={create} disabled={loading} className="rounded bg-indigo-600 px-3 py-2 text-sm text-white disabled:opacity-50">{loading ? 'Creating…' : 'Create link'}</button></div>
      <ul className="space-y-2">{links.map((link) => <li key={link.id || link.tokenMasked} className="flex items-center justify-between gap-3 rounded bg-gray-800/60 p-3 text-xs"><span><span className="block font-mono text-gray-300">{link.tokenMasked || '••••••••'}</span><span className="text-gray-500">Expires {formatDate(link.expiresAt)}</span></span><button type="button" onClick={() => revoke(link)} className="text-red-400 hover:text-red-300">Revoke</button></li>)}</ul>
    </section>
  );
}
