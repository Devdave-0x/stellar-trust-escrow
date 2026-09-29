'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAdminStore } from '../../../store/app-store';
import { buildAdminHeaders } from '../../../store/admin';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export default function AdminWebhookDeliveriesPage() {
  const { apiKey } = useAdminStore();
  const [subscriptions, setSubscriptions] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [deliveries, setDeliveries] = useState([]);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!apiKey) return;
    fetch(`${API_BASE}/api/webhooks`, { headers: buildAdminHeaders(apiKey) })
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed');
        return res.json();
      })
      .then((body) => {
        const rows = body.data || [];
        setSubscriptions(rows);
        if (rows[0]) setSelectedId(rows[0].id);
      })
      .catch((err) => setError(err.message));
  }, [apiKey]);

  useEffect(() => {
    if (!apiKey || !selectedId) return;
    fetch(`${API_BASE}/api/webhooks/${selectedId}/deliveries`, {
      headers: buildAdminHeaders(apiKey),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed');
        return res.json();
      })
      .then((body) => setDeliveries(body.deliveries || []))
      .catch((err) => setError(err.message));
  }, [apiKey, selectedId]);

  const visibleDeliveries = useMemo(
    () => (status ? deliveries.filter((delivery) => delivery.status === status) : deliveries),
    [deliveries, status],
  );

  if (!apiKey) {
    return (
      <div className="card">
        <h1 className="text-2xl font-bold">Webhook Delivery Log</h1>
        <p className="mt-2 text-sm text-gray-500">Authenticate from the admin dashboard first.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Webhook Delivery Log</h1>
        <p className="mt-1 text-sm text-gray-500">
          Inspect delivery attempts without exposing webhook secrets or payload signatures.
        </p>
      </div>

      {error && <p role="alert">{error}</p>}

      <div className="grid gap-3 md:grid-cols-2">
        <label>
          Subscription
          <select
            aria-label="Webhook subscription"
            value={selectedId}
            onChange={(event) => setSelectedId(event.target.value)}
          >
            {subscriptions.map((subscription) => (
              <option key={subscription.id} value={subscription.id}>
                {subscription.url}
              </option>
            ))}
          </select>
        </label>

        <label>
          Delivery status
          <select
            aria-label="Delivery status"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="delivered">Delivered</option>
            <option value="failed">Failed</option>
          </select>
        </label>
      </div>

      {visibleDeliveries.length === 0 ? (
        <p role="status">No webhook deliveries match the current filter.</p>
      ) : (
        <table className="w-full text-left text-sm" aria-label="Webhook deliveries">
          <thead>
            <tr>
              <th>Event</th>
              <th>Status</th>
              <th>Attempts</th>
              <th>Response</th>
              <th>Failure detail</th>
            </tr>
          </thead>
          <tbody>
            {visibleDeliveries.map((delivery) => (
              <tr key={delivery.id}>
                <td>{delivery.eventType}</td>
                <td>{delivery.status}</td>
                <td>{delivery.attempts}</td>
                <td>{delivery.responseCode ?? '—'}</td>
                <td>{delivery.errorMessage || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
