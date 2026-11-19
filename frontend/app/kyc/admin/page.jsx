'use client';

/**
 * KYC Admin Dashboard — /kyc/admin
 *
 * Lists all KYC verification records with status filtering.
 * Protected: requires a server-verified administrator role for both page
 * data and every review mutation.
 */

import { useCallback, useEffect, useState } from 'react';
import Badge from '../../../components/ui/Badge';
import Spinner from '../../../components/ui/Spinner';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const STATUSES = ['', 'Pending', 'Init', 'Processing', 'Approved', 'Declined'];

/**
 * Ask the server to verify the current session's role. Never trust a
 * client-side flag: the server is the source of truth for admin access.
 * Resolves to true only when the server confirms an admin role.
 */
export async function verifyAdminAccess(fetchImpl = fetch) {
  try {
    const res = await fetchImpl(`${API_BASE}/api/auth/me`, {
      credentials: 'include',
    });
    if (!res.ok) return false;
    const data = await res.json();
    const role = data?.user?.role ?? data?.role;
    return role === 'admin';
  } catch {
    return false;
  }
}

/**
 * Perform an admin-gated review mutation. The server re-verifies the admin
 * role on every call, so direct API calls by non-admins are denied there too.
 * Throws an authorization error when the server rejects the request.
 */
export async function submitReviewMutation(path, body, fetchImpl = fetch) {
  const res = await fetchImpl(`${API_BASE}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });

  if (res.status === 401 || res.status === 403) {
    const err = new Error('Not authorized: administrator access required.');
    err.code = 'UNAUTHORIZED';
    throw err;
  }
  if (!res.ok) {
    const err = new Error('Review request failed.');
    err.code = 'REQUEST_FAILED';
    throw err;
  }
  return res.json();
}

export default function KycAdminPage() {
  const [records, setRecords] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [authState, setAuthState] = useState('checking'); // checking | admin | denied
  const [error, setError] = useState(null);

  // Server-verified admin gate: runs before any page data is loaded.
  useEffect(() => {
    let cancelled = false;
    verifyAdminAccess().then((isAdmin) => {
      if (!cancelled) setAuthState(isAdmin ? 'admin' : 'denied');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (authState !== 'admin') return;
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({ page, limit: 20 });
    if (statusFilter) params.set('status', statusFilter);

    fetch(`${API_BASE}/api/kyc/admin?${params}`, { credentials: 'include' })
      .then((r) => {
        if (r.status === 401 || r.status === 403) {
          const err = new Error('Not authorized: administrator access required.');
          err.code = 'UNAUTHORIZED';
          throw err;
        }
        return r.json();
      })
      .then((d) => {
        if (cancelled) return;
        setRecords(d.data ?? []);
        setTotal(d.total ?? 0);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err.code === 'UNAUTHORIZED') setAuthState('denied');
        else setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authState, page, statusFilter]);

  const handleReview = useCallback(async (record, action) => {
    setError(null);
    try {
      await submitReviewMutation(`/api/kyc/admin/${record.id}/${action}`, {
        address: record.address,
      });
      setRecords((prev) =>
        prev.map((r) =>
          r.id === record.id
            ? { ...r, status: action === 'approve' ? 'Approved' : 'Declined' }
            : r,
        ),
      );
    } catch (err) {
      if (err.code === 'UNAUTHORIZED') setAuthState('denied');
      else setError(err.message);
    }
  }, []);

  if (authState === 'checking') {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  if (authState === 'denied') {
    return (
      <div className="space-y-4 py-12 text-center" role="alert">
        <h1 className="text-2xl font-bold text-white">Access denied</h1>
        <p className="text-gray-400 text-sm">
          You must be signed in as an administrator to view this page.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">KYC Admin</h1>
        <p className="text-gray-400 text-sm">{total} total records</p>
      </div>

      {error && (
        <p className="text-red-400 text-sm" role="alert">
          {error}
        </p>
      )}

      {/* Status filter */}
      <div className="flex gap-2 flex-wrap">
        {STATUSES.map((s) => (
          <button
            key={s || 'all'}
            onClick={() => {
              setStatusFilter(s);
              setPage(1);
            }}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
              statusFilter === s
                ? 'bg-indigo-500 border-indigo-500 text-white'
                : 'border-gray-700 text-gray-400 hover:border-gray-500'
            }`}
          >
            {s || 'All'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : records.length === 0 ? (
        <p className="text-gray-500 text-center py-12">No records found.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-800">
                <th className="pb-3 pr-4">Address</th>
                <th className="pb-3 pr-4">Applicant ID</th>
                <th className="pb-3 pr-4">Status</th>
                <th className="pb-3 pr-4">Result</th>
                <th className="pb-3 pr-4">Updated</th>
                <th className="pb-3">Review</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {records.map((r) => (
                <tr key={r.id} className="text-gray-300">
                  <td className="py-3 pr-4 font-mono text-xs">
                    {r.address.slice(0, 8)}…{r.address.slice(-6)}
                  </td>
                  <td className="py-3 pr-4 font-mono text-xs text-gray-500">
                    {r.applicantId ?? '—'}
                  </td>
                  <td className="py-3 pr-4">
                    <Badge status={r.status} size="sm" />
                  </td>
                  <td className="py-3 pr-4 text-xs text-gray-500">
                    {r.reviewResult ?? '—'}
                    {r.rejectLabels?.length > 0 && (
                      <span className="ml-1 text-red-400">({r.rejectLabels.join(', ')})</span>
                    )}
                  </td>
                  <td className="py-3 pr-4 text-xs text-gray-500">
                    {new Date(r.updatedAt).toLocaleDateString()}
                  </td>
                  <td className="py-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleReview(r, 'approve')}
                        className="px-2 py-1 rounded border border-green-700 text-green-400 text-xs hover:border-green-500"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => handleReview(r, 'decline')}
                        className="px-2 py-1 rounded border border-red-700 text-red-400 text-xs hover:border-red-500"
                      >
                        Decline
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {total > 20 && (
        <div className="flex gap-3 justify-center">
          <button
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
            className="px-4 py-1.5 rounded border border-gray-700 text-gray-400 disabled:opacity-40 text-sm"
          >
            Previous
          </button>
          <span className="text-gray-500 text-sm self-center">Page {page}</span>
          <button
            disabled={page * 20 >= total}
            onClick={() => setPage((p) => p + 1)}
            className="px-4 py-1.5 rounded border border-gray-700 text-gray-400 disabled:opacity-40 text-sm"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
