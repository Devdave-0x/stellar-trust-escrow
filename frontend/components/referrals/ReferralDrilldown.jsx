'use client';

import { useCallback, useEffect, useState } from 'react';
import api from '../../lib/api/client';

const STATUS_LABELS = {
  converted: 'Converted — reward pending',
  rewarded: 'Rewarded',
  pending: 'No escrow activity yet',
  invalid: 'Invalid (self-referral)',
};

function Stat({ label, value }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-2xl font-semibold text-white" data-testid={`stat-${label}`}>
        {value}
      </p>
    </div>
  );
}

/**
 * Referral performance drilldown: conversions, pending rewards, invalid
 * referrals and claim history from GET /users/me/referrals/stats, filtered
 * by the referral join date.
 *
 * @param {object} [props]
 * @param {Function} [props.fetchStats] — injectable for tests
 */
export default function ReferralDrilldown({ fetchStats } = {}) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        ...(from ? { from: new Date(`${from}T00:00:00Z`).toISOString() } : {}),
        ...(to ? { to: new Date(`${to}T23:59:59Z`).toISOString() } : {}),
      };
      const result = fetchStats
        ? await fetchStats(params)
        : (await api.get('/users/me/referrals/stats', { params })).data;
      setData(result);
    } catch (err) {
      setError(err?.response?.data?.error || err.message || 'Failed to load referral stats');
    } finally {
      setLoading(false);
    }
  }, [from, to, fetchStats]);

  useEffect(() => {
    load();
  }, [load]);

  const totals = data?.totals;

  return (
    <section aria-labelledby="referral-drilldown-title" className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 id="referral-drilldown-title" className="text-2xl font-bold text-white">
          Referral performance
        </h1>
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            load();
          }}
        >
          <label className="text-xs text-gray-400">
            From
            <input type="date" className="input-field block" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="text-xs text-gray-400">
            To
            <input type="date" className="input-field block" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
          </label>
          {(from || to) && (
            <button type="button" className="btn-secondary text-sm" onClick={() => (setFrom(''), setTo(''))}>
              Clear
            </button>
          )}
        </form>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}

      {loading && !data && <p className="text-sm text-gray-400">Loading referral stats…</p>}

      {totals && totals.referrals === 0 && (
        <div className="card p-6 text-center" data-testid="referral-empty">
          <p className="text-white font-medium">No referrals {from || to ? 'in this date range' : 'yet'}</p>
          <p className="text-sm text-gray-400 mt-1">Share your referral link to start earning rewards.</p>
        </div>
      )}

      {totals && totals.referrals > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat label="Conversions" value={totals.conversions} />
            <Stat label="Pending rewards" value={totals.pendingRewards} />
            <Stat label="Invalid referrals" value={totals.invalid} />
            <Stat label="Rewards claimed" value={totals.claimed} />
          </div>

          <div className="card p-4">
            <h2 className="text-lg font-semibold text-white mb-3">Referrals</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400">
                  <th className="py-1">Joined</th>
                  <th className="py-1">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.referrals.map((r, i) => (
                  <tr key={`${r.joinedAt}-${i}`} className="border-t border-gray-800">
                    <td className="py-1 text-gray-300">{new Date(r.joinedAt).toLocaleDateString()}</td>
                    <td className="py-1 text-gray-300">{STATUS_LABELS[r.status] ?? r.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card p-4">
            <h2 className="text-lg font-semibold text-white mb-3">Claim history</h2>
            {data.claimHistory.length === 0 ? (
              <p className="text-sm text-gray-400">No rewards claimed in this period.</p>
            ) : (
              <ul className="space-y-1 text-sm text-gray-300" data-testid="claim-history">
                {data.claimHistory.map((c, i) => (
                  <li key={`${c.rewardedAt}-${i}`}>
                    Reward claimed {new Date(c.rewardedAt).toLocaleDateString()} (referral joined{' '}
                    {new Date(c.joinedAt).toLocaleDateString()})
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  );
}
