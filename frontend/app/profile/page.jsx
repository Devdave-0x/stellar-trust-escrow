'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import ReputationBadge from '../../components/ui/ReputationBadge';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Spinner from '../../components/ui/Spinner';
import TruncatedAddress from '../../components/ui/TruncatedAddress';
import EscrowCard from '../../components/escrow/EscrowCard';
import ErrorBoundary from '../../components/error/ErrorBoundary';
import StatCard from '../../components/ui/StatCard';
import EmptyState from '../../components/ui/EmptyState';
import { useWalletStore } from '../../store/app-store';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

const STATUS_GROUPS = ['Active', 'Disputed', 'Released', 'Cancelled'];

function normaliseEscrow(e) {
  return {
    id: String(e.id),
    title: e.title || `Escrow #${e.id}`,
    status: e.status,
    totalAmount: e.totalAmount
      ? `${Number(e.totalAmount).toLocaleString()} USDC`
      : '—',
    counterparty: e.clientAddress
      ? `${e.clientAddress.slice(0, 4)}…${e.clientAddress.slice(-4)}`
      : '—',
    role: e.role || 'client',
    deadline: e.deadline || null,
    assetSymbol: e.assetSymbol || 'USDC',
  };
}

export default function MyProfilePage() {
  const { address } = useWalletStore();
  const router = useRouter();

  const [stats, setStats] = useState(null);
  const [escrows, setEscrows] = useState([]);
  const [recentlyResolved, setRecentlyResolved] = useState([]);
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [savingName, setSavingName] = useState(false);

  useEffect(() => {
    if (!address) {
      router.replace('/');
    }
  }, [address, router]);

  useEffect(() => {
    if (!address) return;
    setLoading(true);

    Promise.allSettled([
      fetch(`${API_BASE}/api/users/me/stats`, { credentials: 'include' }).then((r) =>
        r.ok ? r.json() : null,
      ),
      fetch(`${API_BASE}/api/users/me/escrows`, { credentials: 'include' }).then((r) =>
        r.ok ? r.json() : { escrows: [] },
      ),
      fetch(`${API_BASE}/api/users/${address}`, { credentials: 'include' }).then((r) =>
        r.ok ? r.json() : null,
      ),
    ]).then(([statsResult, escrowsResult, profileResult]) => {
      if (statsResult.status === 'fulfilled' && statsResult.value) {
        setStats(statsResult.value);
      }
      if (escrowsResult.status === 'fulfilled') {
        const raw = escrowsResult.value?.escrows ?? escrowsResult.value?.data ?? [];
        const normalised = raw.map(normaliseEscrow);
        setEscrows(normalised);
        const resolved = normalised
          .filter((e) => e.status === 'Released')
          .slice(0, 5);
        setRecentlyResolved(resolved);
      }
      if (profileResult.status === 'fulfilled' && profileResult.value?.displayName) {
        setDisplayName(profileResult.value.displayName);
        setNameInput(profileResult.value.displayName);
      }
      setLoading(false);
    });
  }, [address]);

  const handleSaveName = async () => {
    setSavingName(true);
    try {
      await fetch(`${API_BASE}/api/users/me`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: nameInput }),
      });
      setDisplayName(nameInput);
      setEditingName(false);
    } finally {
      setSavingName(false);
    }
  };

  if (!address) return null;

  const grouped = STATUS_GROUPS.reduce((acc, status) => {
    const group = escrows.filter((e) => e.status === status);
    if (group.length) acc[status] = group;
    return acc;
  }, {});

  const disputeRate =
    stats?.totalEscrows > 0
      ? ((stats.disputedEscrows / stats.totalEscrows) * 100).toFixed(1)
      : '0.0';

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      {/* Profile header card */}
      <ErrorBoundary>
        <div className="card flex flex-col sm:flex-row gap-6 items-start">
          <div className="w-16 h-16 rounded-2xl bg-indigo-600/30 flex items-center justify-center text-indigo-300 font-bold text-xl flex-shrink-0">
            {address.slice(1, 3)}
          </div>

          <div className="flex-1 min-w-0">
            {/* Display name (editable) */}
            {editingName ? (
              <div className="flex items-center gap-2 mb-2">
                <input
                  className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  placeholder="Display name"
                  maxLength={50}
                  autoFocus
                />
                <Button size="sm" onClick={handleSaveName} isLoading={savingName}>
                  Save
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditingName(false)}>
                  Cancel
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2 mb-1">
                {displayName ? (
                  <h1 className="text-xl font-bold text-white">{displayName}</h1>
                ) : (
                  <h1 className="text-xl font-bold text-white font-mono">
                    <TruncatedAddress address={address} />
                  </h1>
                )}
                <button
                  onClick={() => { setNameInput(displayName); setEditingName(true); }}
                  className="text-xs text-gray-500 hover:text-indigo-400 transition-colors"
                  aria-label="Edit display name"
                >
                  Edit
                </button>
              </div>
            )}

            <p className="text-gray-500 text-xs font-mono break-all">{address}</p>

            {stats?.memberSince && (
              <p className="text-gray-500 text-sm mt-1">
                Member since {new Date(stats.memberSince).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </p>
            )}
          </div>

          <div className="text-center flex-shrink-0">
            {stats?.reputationScore != null && (
              <>
                <ReputationBadge score={stats.reputationScore} size="lg" />
                <p className="text-xs text-gray-500 mt-1">Reputation Score</p>
              </>
            )}
            <div className="mt-3 flex gap-2">
              <Button variant="secondary" size="sm" href={`/profile/${address}`}>
                Public View
              </Button>
            </div>
          </div>
        </div>
      </ErrorBoundary>

      {/* Stats */}
      <ErrorBoundary>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Spinner />
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Total Escrows" value={stats?.totalEscrows ?? escrows.length} />
            <StatCard
              label="Total Volume"
              value={stats?.totalVolume ? `${Number(stats.totalVolume).toLocaleString()} USDC` : '—'}
            />
            <StatCard label="Completed" value={stats?.completedEscrows ?? recentlyResolved.length} />
            <StatCard label="Dispute Rate" value={`${disputeRate}%`} />
          </div>
        )}
      </ErrorBoundary>

      {/* Recently resolved */}
      {recentlyResolved.length > 0 && (
        <ErrorBoundary>
          <section>
            <h2 className="text-lg font-semibold text-white mb-4">Recently Resolved</h2>
            <div className="grid gap-4 md:grid-cols-2">
              {recentlyResolved.map((escrow) => (
                <EscrowCard key={escrow.id} escrow={escrow} />
              ))}
            </div>
          </section>
        </ErrorBoundary>
      )}

      {/* Escrows grouped by status */}
      <ErrorBoundary>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Spinner />
          </div>
        ) : Object.keys(grouped).length === 0 ? (
          <div className="card">
            <EmptyState
              type="escrows"
              title="No escrows yet"
              description="Create your first escrow to get started with secure, milestone-based payments on Stellar."
              actionLabel="Create your first escrow"
              actionHref="/escrow/create"
            />
          </div>
        ) : (
          Object.entries(grouped).map(([status, group]) => (
            <section key={status}>
              <div className="flex items-center gap-3 mb-4">
                <h2 className="text-lg font-semibold text-white">{status}</h2>
                <Badge status={status} size="sm" />
                <span className="text-sm text-gray-500">({group.length})</span>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {group.map((escrow) => (
                  <EscrowCard key={escrow.id} escrow={escrow} />
                ))}
              </div>
            </section>
          ))
        )}
      </ErrorBoundary>
    </div>
  );
}
