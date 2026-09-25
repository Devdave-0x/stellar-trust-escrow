'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

const DEFAULT_STEPS = [
  { id: 'connect-wallet', label: 'Connect your wallet' },
  { id: 'complete-profile', label: 'Complete your profile' },
  { id: 'create-escrow', label: 'Create your first escrow' },
];

export function normaliseChecklist(items = []) {
  return items.map((item, index) => ({
    id: item.id || item.key || `step-${index}`,
    label: item.label || item.title || `Step ${index + 1}`,
    status: ['completed', 'pending', 'skipped'].includes(item.status) ? item.status : 'pending',
    next: Boolean(item.next),
  }));
}

export default function OnboardingChecklist({ address, steps = DEFAULT_STEPS, onAction }) {
  const [items, setItems] = useState(normaliseChecklist(steps));
  const [loading, setLoading] = useState(Boolean(address));
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/users/me/onboarding`, { credentials: 'include' });
      if (!response.ok) throw new Error('Unable to load onboarding progress');
      const data = await response.json();
      setItems(normaliseChecklist(data?.items || data?.steps || data?.checklist || []));
      setError('');
    } catch (err) {
      setError(err.message || 'Unable to load onboarding progress');
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => { load(); }, [load]);

  const nextId = useMemo(() => items.find((item) => item.status === 'pending')?.id, [items]);
  const markSkipped = async (id) => {
    const previous = items;
    setItems((current) => current.map((item) => item.id === id ? { ...item, status: 'skipped' } : item));
    try {
      const response = await fetch(`${API_BASE}/api/users/me/onboarding/${encodeURIComponent(id)}`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'skipped' }),
      });
      if (!response.ok) throw new Error('Unable to update onboarding step');
      onAction?.(id, 'skipped');
    } catch (err) {
      setItems(previous);
      setError(err.message || 'Unable to update onboarding step');
    }
  };

  return (
    <section className="card p-6 space-y-4" aria-labelledby="onboarding-heading">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="onboarding-heading" className="text-lg font-semibold text-white">Getting started</h2>
          <p className="text-sm text-gray-400">Track the steps that unlock the full escrow experience.</p>
        </div>
        <span className="text-xs text-indigo-300">{items.filter((item) => item.status === 'completed').length}/{items.length} complete</span>
      </div>
      {loading ? <p className="text-sm text-gray-400" role="status">Loading checklist…</p> : (
        <ol className="space-y-2">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-3 rounded-xl border border-gray-800 p-3">
              <span aria-label={item.status} className={`h-2.5 w-2.5 rounded-full ${item.status === 'completed' ? 'bg-emerald-400' : item.status === 'skipped' ? 'bg-gray-500' : 'bg-amber-400'}`} />
              <span className={`flex-1 text-sm ${item.status === 'skipped' ? 'text-gray-500 line-through' : 'text-gray-200'}`}>{item.label}</span>
              {item.id === nextId && <span className="text-xs text-indigo-300">Next step</span>}
              {item.status === 'completed' && <span className="text-xs text-emerald-300">Completed</span>}
              {item.status === 'skipped' && <span className="text-xs text-gray-500">Skipped</span>}
              {item.status === 'pending' && <button type="button" onClick={() => markSkipped(item.id)} className="text-xs text-gray-400 hover:text-white">Skip</button>}
            </li>
          ))}
        </ol>
      )}
      {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
    </section>
  );
}
