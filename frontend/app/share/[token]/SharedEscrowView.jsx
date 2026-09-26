'use client';

import { useEffect, useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

/** Read-only view of a publicly shared escrow, with an "Open in app" link. */
export default function SharedEscrowView({ token, validToken, appScheme }) {
  const [state, setState] = useState({ status: validToken ? 'loading' : 'invalid' });

  useEffect(() => {
    if (!validToken) return;
    fetch(`${API_BASE}/api/share/${encodeURIComponent(token)}`)
      .then(async (res) => {
        if (res.status === 410) return setState({ status: 'expired' });
        if (!res.ok) return setState({ status: 'invalid' });
        setState({ status: 'ok', data: await res.json() });
      })
      .catch(() => setState({ status: 'error' }));
  }, [token, validToken]);

  if (state.status === 'loading') return <p className="p-8 text-gray-400">Loading shared escrow…</p>;
  if (state.status !== 'ok') {
    const message = {
      invalid: 'This share link is invalid or has been revoked.',
      expired: 'This share link has expired. Ask the escrow participant for a new one.',
      error: 'Could not load this share link. Please try again.',
    }[state.status];
    return (
      <div className="max-w-xl mx-auto p-8 text-center" role="alert">
        <p className="text-white">{message}</p>
      </div>
    );
  }

  const { escrow, expiresAt } = state.data;
  return (
    <div className="max-w-2xl mx-auto p-8 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-white">Escrow #{escrow.id}</h1>
        <a className="btn-secondary text-sm" href={`${appScheme}://share/${token}`}>
          Open in the app
        </a>
      </div>
      <p className="text-gray-300">
        Status: {escrow.status} · Total: {escrow.totalAmount} · Remaining: {escrow.remainingBalance}
      </p>
      <ul className="space-y-1">
        {escrow.milestones?.map((m) => (
          <li key={m.id} className="text-sm text-gray-300">
            {m.title} — {m.amount} ({m.status})
          </li>
        ))}
      </ul>
      {expiresAt && <p className="text-xs text-gray-500">Link expires {new Date(expiresAt).toLocaleDateString()}</p>}
    </div>
  );
}
