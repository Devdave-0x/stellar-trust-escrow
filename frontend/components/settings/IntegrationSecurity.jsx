'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useWalletStore } from '../../store/app-store';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const ROTATION_WINDOW_MS = 15 * 60 * 1000;
const STALE_KEY_DAYS = 90;

function authHeaders(token) {
  return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : {};
}

export function isStaleKey(key, now = Date.now()) {
  const lastUsed = key.lastUsedAt ? new Date(key.lastUsedAt).getTime() : 0;
  const created = key.createdAt ? new Date(key.createdAt).getTime() : now;
  const reference = lastUsed || created;
  return now - reference > STALE_KEY_DAYS * 24 * 60 * 60 * 1000;
}

export function ScopeChips({ scopes = [] }) {
  const values = scopes.length ? scopes : ['read'];
  return (
    <div className="flex flex-wrap gap-1" aria-label="Allowed scopes">
      {values.map((scope) => (
        <span key={scope} className="rounded-full bg-indigo-500/15 px-2 py-0.5 text-xs text-indigo-200">
          {scope}
        </span>
      ))}
    </div>
  );
}

export function ApiKeyReview({ token }) {
  const [keys, setKeys] = useState([]);
  const [name, setName] = useState('');
  const [allowedIps, setAllowedIps] = useState('');
  const [scopes, setScopes] = useState(['read']);
  const [newSecret, setNewSecret] = useState(null);
  const [pendingRevoke, setPendingRevoke] = useState(null);
  const [error, setError] = useState('');

  const loadKeys = useCallback(async () => {
    if (!token) return;
    const response = await fetch(`${API_BASE}/api/v1/api-keys`, { headers: authHeaders(token) });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Unable to load API keys');
    setKeys(payload.data || []);
  }, [token]);

  useEffect(() => {
    loadKeys().catch((err) => setError(err.message));
  }, [loadKeys]);

  const createKey = async (event) => {
    event.preventDefault();
    setError('');
    try {
      const response = await fetch(`${API_BASE}/api/v1/api-keys`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          name,
          allowedIps: allowedIps.split(',').map((value) => value.trim()).filter(Boolean),
          scopes,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to create API key');
      setNewSecret(payload.key);
      setName('');
      setAllowedIps('');
      setScopes(['read']);
      await loadKeys();
    } catch (err) {
      setError(err.message);
    }
  };

  const revokeKey = async () => {
    if (!pendingRevoke) return;
    setError('');
    try {
      const response = await fetch(`${API_BASE}/api/v1/api-keys/${pendingRevoke.id}`, {
        method: 'DELETE',
        headers: authHeaders(token),
      });
      const payload = response.status === 204 ? null : await response.json();
      if (!response.ok) throw new Error(payload?.error || 'Unable to revoke API key');
      setPendingRevoke(null);
      await loadKeys();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <section className="card space-y-5" data-testid="api-key-review">
      <div>
        <h2 className="text-lg font-semibold text-white">API keys</h2>
        <p className="mt-1 text-sm text-gray-400">Review usage and scopes before changing an integration.</p>
      </div>
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
      {newSecret && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4" role="status">
          <p className="text-sm font-medium text-amber-100">Copy this key now. It will be masked after copying.</p>
          <button
            type="button"
            className="mt-2 rounded bg-gray-950 px-3 py-2 font-mono text-xs text-amber-100"
            onClick={async () => {
              await navigator.clipboard?.writeText(newSecret);
              setNewSecret('••••••••••••••••');
            }}
          >
            {newSecret === '••••••••••••••••' ? 'Secret copied and masked' : newSecret}
          </button>
        </div>
      )}
      <div className="space-y-3">
        {keys.length === 0 ? <p className="text-sm text-gray-500">No active API keys.</p> : keys.map((key) => {
          const stale = isStaleKey(key);
          return (
            <article key={key.id} className={`rounded-lg border p-4 ${stale ? 'border-amber-500/40 bg-amber-500/5' : 'border-gray-800 bg-gray-900/60'}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-medium text-white">{key.name}</h3>
                  <p className="font-mono text-xs text-gray-500">{key.keyPrefix}••••</p>
                </div>
                {stale && <span className="rounded-full bg-amber-500/15 px-2 py-1 text-xs text-amber-200">Stale key</span>}
              </div>
              <div className="mt-3 grid gap-3 text-xs text-gray-400 sm:grid-cols-3">
                <div><span className="block text-gray-600">Last used</span>{key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString() : 'Never used'}</div>
                <div><span className="block text-gray-600">Scopes</span><ScopeChips scopes={key.scopes} /></div>
                <div><span className="block text-gray-600">Allowed IPs</span>{key.allowedIps?.length ? key.allowedIps.join(', ') : 'Any IP'}</div>
              </div>
              <button type="button" onClick={() => setPendingRevoke(key)} className="mt-3 text-xs text-red-300 hover:text-red-200">Revoke key</button>
            </article>
          );
        })}
      </div>
      <form onSubmit={createKey} className="grid gap-3 border-t border-gray-800 pt-4 sm:grid-cols-4">
        <label className="text-sm text-gray-300">Name<input required value={name} onChange={(event) => setName(event.target.value)} className="mt-1 w-full rounded bg-gray-800 px-3 py-2 text-white" /></label>
        <label className="text-sm text-gray-300">Allowed IPs<input value={allowedIps} onChange={(event) => setAllowedIps(event.target.value)} placeholder="203.0.113.10, 10.0.0.0/24" className="mt-1 w-full rounded bg-gray-800 px-3 py-2 text-white" /></label>
        <fieldset className="text-sm text-gray-300"><legend>Scopes</legend><label className="mt-2 flex items-center gap-2"><input type="checkbox" checked readOnly /> read</label><label className="mt-1 flex items-center gap-2"><input type="checkbox" checked={scopes.includes('read:webhooks')} onChange={(event) => setScopes((current) => event.target.checked ? [...current, 'read:webhooks'] : current.filter((scope) => scope !== 'read:webhooks'))} /> read:webhooks</label><label className="mt-1 flex items-center gap-2"><input type="checkbox" checked={scopes.includes('write:webhooks')} onChange={(event) => setScopes((current) => event.target.checked ? [...current, 'write:webhooks'] : current.filter((scope) => scope !== 'write:webhooks'))} /> write:webhooks</label></fieldset>
        <button type="submit" className="self-end rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500">Create API key</button>
      </form>
      {pendingRevoke && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4" role="alertdialog" aria-label="Confirm API key revocation">
          <p className="text-sm text-red-100">Revoke <strong>{pendingRevoke.name}</strong>? Integrations using this key will stop authenticating.</p>
          <div className="mt-3 flex gap-2"><button type="button" onClick={revokeKey} className="rounded bg-red-600 px-3 py-1.5 text-sm text-white">Confirm revocation</button><button type="button" onClick={() => setPendingRevoke(null)} className="rounded border border-gray-700 px-3 py-1.5 text-sm text-gray-300">Cancel</button></div>
        </div>
      )}
    </section>
  );
}

export function WebhookSecretRotation({ token }) {
  const [subscriptions, setSubscriptions] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [rotation, setRotation] = useState(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const loadSubscriptions = useCallback(async () => {
    if (!token) return;
    const response = await fetch(`${API_BASE}/api/v1/webhooks`, { headers: authHeaders(token) });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Unable to load webhooks');
    const rows = payload.data || payload;
    setSubscriptions(Array.isArray(rows) ? rows : []);
    if (!selectedId && rows?.[0]) setSelectedId(rows[0].id);
  }, [token, selectedId]);

  useEffect(() => {
    loadSubscriptions().catch((err) => setError(err.message));
  }, [loadSubscriptions]);

  const rotate = async (event) => {
    event.preventDefault();
    setError('');
    setCopied(false);
    try {
      const response = await fetch(`${API_BASE}/api/v1/webhooks/${selectedId}/rotate-secret`, {
        method: 'POST',
        headers: authHeaders(token),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to rotate webhook secret');
      setRotation({ secret: payload.data?.secret || payload.secret, expiresAt: Date.now() + ROTATION_WINDOW_MS });
    } catch (err) {
      setError(err.message);
    }
  };

  const completeRotation = () => {
    setRotation(null);
    setCopied(false);
  };

  return (
    <section className="card space-y-5" data-testid="webhook-secret-rotation">
      <div><h2 className="text-lg font-semibold text-white">Webhook secret rotation</h2><p className="mt-1 text-sm text-gray-400">Rotate a secret without exposing it after creation.</p></div>
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
      <form onSubmit={rotate} className="flex flex-wrap items-end gap-3">
        <label className="min-w-64 text-sm text-gray-300">Integration<select required value={selectedId} onChange={(event) => setSelectedId(event.target.value)} className="mt-1 w-full rounded bg-gray-800 px-3 py-2 text-white"><option value="">Select a webhook</option>{subscriptions.map((subscription) => <option key={subscription.id} value={subscription.id}>{subscription.url}</option>)}</select></label>
        <button type="submit" disabled={!selectedId || Boolean(rotation)} className="rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Start rotation</button>
      </form>
      {rotation && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
          <p className="text-sm font-medium text-amber-100">Rotation window ends {new Date(rotation.expiresAt).toLocaleString()}.</p>
          <p className="mt-1 text-xs text-amber-200/80">Copy the new secret once, update the integration, then complete the rotation.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" disabled={copied} onClick={async () => { await navigator.clipboard?.writeText(rotation.secret); setCopied(true); }} className="rounded bg-gray-950 px-3 py-2 font-mono text-xs text-amber-100 disabled:opacity-70">{copied ? 'Secret copied (masked)' : rotation.secret}</button>
            <button type="button" onClick={completeRotation} className="rounded border border-amber-400/40 px-3 py-2 text-xs text-amber-100">Complete rotation</button>
          </div>
        </div>
      )}
    </section>
  );
}

export default function IntegrationSecurity() {
  const { token } = useWalletStore();
  if (!token) return <p className="text-sm text-gray-400">Connect and authenticate your wallet to manage integrations.</p>;
  return <div className="space-y-6"><WebhookSecretRotation token={token} /><ApiKeyReview token={token} /></div>;
}
