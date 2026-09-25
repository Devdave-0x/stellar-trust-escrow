'use client';

import { useCallback, useEffect, useState } from 'react';
import api from '../../lib/api/client';

/**
 * Recent passkey/MFA, password and session changes for the signed-in user,
 * newest first, paginated. The API returns only labels, times and masked
 * IPs — never secrets.
 *
 * @param {object} [props]
 * @param {Function} [props.fetchPage] — (page) => { data, pagination }; injectable for tests
 */
export default function SecurityActivity({ fetchPage } = {}) {
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = fetchPage
        ? await fetchPage(page)
        : (await api.get('/users/me/security-activity', { params: { page, limit: 10 } })).data;
      setResult(data);
    } catch (err) {
      setError(err?.response?.data?.error || err.message || 'Could not load security activity');
    }
  }, [page, fetchPage]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return (
      <p role="alert" className="text-sm text-red-400">
        {error}
      </p>
    );
  }
  if (!result) return <p className="text-sm text-gray-400">Loading security activity…</p>;
  if (result.data.length === 0) {
    return (
      <p className="text-sm text-gray-400" data-testid="security-activity-empty">
        No recent security changes.
      </p>
    );
  }

  const { totalPages } = result.pagination;
  return (
    <div className="space-y-3">
      <ol className="space-y-2" aria-label="Security activity" data-testid="security-activity-list">
        {result.data.map((item, i) => (
          <li key={`${item.type}-${item.occurredAt}-${i}`} className="flex justify-between gap-4 text-sm">
            <span className="text-gray-200">{item.label}</span>
            <span className="text-gray-500 whitespace-nowrap">
              {new Date(item.occurredAt).toLocaleString()}
              {item.ip ? ` · ${item.ip}` : ''}
            </span>
          </li>
        ))}
      </ol>
      {totalPages > 1 && (
        <div className="flex items-center gap-3 text-sm">
          <button type="button" className="btn-secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </button>
          <span className="text-gray-400">
            Page {page} of {totalPages}
          </span>
          <button type="button" className="btn-secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Next
          </button>
        </div>
      )}
    </div>
  );
}
