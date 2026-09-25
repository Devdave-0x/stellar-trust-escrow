'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

/** Conversation list with unread counts scoped to the connected user. */
export default function EscrowConversationList({ escrows = [], address }) {
  const [unread, setUnread] = useState({});

  const refresh = useCallback(async () => {
    if (!address) return;
    try {
      const res = await fetch(`${API_BASE}/api/users/me/unread-messages`, { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      setUnread(data.byEscrow || {});
    } catch {
      setUnread({});
    }
  }, [address]);

  useEffect(() => { refresh(); }, [refresh]);

  if (!escrows.length) return null;
  return (
    <section className="card" aria-labelledby="conversations-heading">
      <div className="flex items-center justify-between mb-3">
        <h2 id="conversations-heading" className="text-lg font-semibold text-white">Conversations</h2>
        <button type="button" onClick={refresh} className="text-xs text-indigo-400 hover:text-indigo-300">Refresh</button>
      </div>
      <ul className="divide-y divide-gray-800">
        {escrows.map((escrow) => {
          const count = Number(unread[String(escrow.id)] || 0);
          return (
            <li key={escrow.id}>
              <Link href={`/escrow/${escrow.id}`} className="flex items-center justify-between gap-3 py-3 hover:bg-gray-800/40 rounded px-2">
                <span className="text-sm text-gray-200 truncate">{escrow.title || `Escrow #${escrow.id}`}</span>
                {count > 0 && <span aria-label={`${count} unread messages`} className="min-w-6 rounded-full bg-indigo-600 px-2 py-0.5 text-center text-xs font-semibold text-white">{count > 99 ? '99+' : count}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
