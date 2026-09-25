'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAdminStore } from '../../../store/app-store';
import { adminFetch } from '../../../store/admin';
import EmptyState from '../../../components/ui/EmptyState';

const STATUS_FILTERS = ['Pending', 'EvidenceRequested', 'Approved', 'Rejected', 'Paid'];
const DECISION_LABELS = { approve: 'Approve', deny: 'Deny', request_evidence: 'Request evidence' };

function PoolImpact({ impact }) {
  return (
    <div className={`rounded-lg border p-3 text-sm ${impact.solvent ? 'border-gray-800' : 'border-red-600'}`}>
      <p className="font-medium text-white">Solvency impact</p>
      <dl className="mt-2 grid grid-cols-2 gap-1 text-gray-300">
        <dt>Estimated pool balance</dt>
        <dd>{impact.estimatedBalance}</dd>
        <dt>Approved, not yet paid</dt>
        <dd>{impact.approvedUnpaid}</dd>
        <dt>Available</dt>
        <dd>{impact.available}</dd>
        <dt>After this payout</dt>
        <dd className={impact.solvent ? '' : 'text-red-400 font-semibold'}>{impact.afterPayout}</dd>
      </dl>
      {!impact.solvent && <p className="mt-2 text-red-400">Paying this claim would exceed the pool. Approval is blocked.</p>}
      <p className="mt-2 text-xs text-gray-500">{impact.source}</p>
    </div>
  );
}

export default function InsuranceClaimReviewPage() {
  const { apiKey } = useAdminStore();
  const [status, setStatus] = useState('Pending');
  const [claims, setClaims] = useState([]);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const loadClaims = useCallback(async () => {
    if (!apiKey) return;
    setError(null);
    const res = await adminFetch(`/api/admin/insurance/claims?status=${encodeURIComponent(status)}`, apiKey);
    if (!res.ok) return setError(`Failed to load claims (HTTP ${res.status})`);
    const body = await res.json();
    setClaims(body.data ?? []);
  }, [apiKey, status]);

  const loadDetail = useCallback(
    async (claimId) => {
      setSelected(claimId);
      setDetail(null);
      const res = await adminFetch(`/api/admin/insurance/claims/${claimId}`, apiKey);
      if (!res.ok) return setError(`Failed to load claim (HTTP ${res.status})`);
      setDetail(await res.json());
    },
    [apiKey],
  );

  useEffect(() => {
    loadClaims();
  }, [loadClaims]);

  const decide = async (decision) => {
    setBusy(true);
    setError(null);
    try {
      const res = await adminFetch(`/api/admin/insurance/claims/${selected}/decision`, apiKey, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, note: note || undefined }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `Decision failed (HTTP ${res.status})`);
      setNote('');
      await Promise.all([loadDetail(selected), loadClaims()]);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const reviewable = detail && ['Pending', 'EvidenceRequested'].includes(detail.claim.status);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-white">Insurance claim review</h1>
        <select className="input-field" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status filter">
          {STATUS_FILTERS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}

      <div className="grid md:grid-cols-3 gap-6">
        <ul className="space-y-2" aria-label="Claims">
          {claims.length === 0 && <EmptyState title="No claims" description={`No ${status} claims.`} />}
          {claims.map((c) => (
            <li key={c.claimId}>
              <button
                type="button"
                onClick={() => loadDetail(c.claimId)}
                className={`w-full text-left card p-3 ${selected === c.claimId ? 'ring-2 ring-indigo-500' : ''}`}
              >
                <p className="text-white">Claim #{c.claimId}</p>
                <p className="text-xs text-gray-400">
                  {c.amount} · {new Date(c.submittedAt).toLocaleDateString()}
                </p>
              </button>
            </li>
          ))}
        </ul>

        <div className="md:col-span-2 space-y-4">
          {!detail && <p className="text-sm text-gray-400">Select a claim to review.</p>}
          {detail && (
            <>
              <div className="card p-4 space-y-1 text-sm text-gray-300">
                <p className="text-lg text-white">
                  Claim #{detail.claim.claimId} — {detail.claim.status}
                </p>
                <p>Claimant: {detail.claim.claimant}</p>
                <p>Amount: {detail.claim.amount}</p>
                <p>Evidence: {detail.evidence.description}</p>
                {detail.evidence.ipfsCid && (
                  <a className="text-indigo-400 underline" href={`https://ipfs.io/ipfs/${detail.evidence.ipfsCid}`} target="_blank" rel="noreferrer">
                    Open evidence bundle
                  </a>
                )}
              </div>

              <PoolImpact impact={detail.poolImpact} />

              {reviewable && (
                <div className="card p-4 space-y-3">
                  <textarea
                    className="input-field w-full"
                    placeholder="Reviewer note (optional)"
                    value={note}
                    maxLength={2000}
                    onChange={(e) => setNote(e.target.value)}
                  />
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(DECISION_LABELS).map(([decision, label]) => (
                      <button
                        key={decision}
                        type="button"
                        className={decision === 'approve' ? 'btn-primary' : 'btn-secondary'}
                        disabled={busy || (decision === 'approve' && !detail.poolImpact.solvent)}
                        onClick={() => decide(decision)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="card p-4">
                <p className="font-medium text-white mb-2">Decision history</p>
                {detail.history.length === 0 ? (
                  <p className="text-sm text-gray-400">No decisions yet.</p>
                ) : (
                  <ul className="space-y-1 text-sm text-gray-300">
                    {detail.history.map((h, i) => (
                      <li key={i}>
                        {new Date(h.createdAt).toLocaleString()} — {h.action.replace('INSURANCE_CLAIM_', '').toLowerCase()} by {h.actor}
                        {h.metadata?.note ? `: ${h.metadata.note}` : ''}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
