'use client';

/**
 * OfflineContext
 *
 * Detects online/offline status, manages an IndexedDB-backed cache for
 * critical dashboard data, and queues non-financial mutations for replay
 * when connectivity is restored.
 *
 * Usage:
 *   const { isOnline, isSyncing, cachedEscrows, queueMutation } = useOffline();
 */

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

const DB_NAME = 'ste-offline';
const DB_VERSION = 1;
const STORES = {
  escrows: 'escrows',
  profile: 'profile',
  mutations: 'mutations',
  draft: 'draft',
};

// ── Offline draft allowlist ───────────────────────────────────────────────────
// Only these non-sensitive escrow form fields may ever be persisted for
// offline recovery. Anything else (auth tokens, secret keys, signatures,
// wallet credentials, etc.) is dropped before it reaches storage.
export const DRAFT_FIELD_ALLOWLIST = Object.freeze([
  'title',
  'description',
  'amount',
  'currency',
  'buyerAddress',
  'sellerAddress',
  'arbiterAddress',
  'milestones',
  'deadline',
  'category',
  'notes',
]);

// Keys that must never be persisted, even if they appear in the allowlist
// (defense in depth against future allowlist mistakes).
const SENSITIVE_KEY_PATTERN =
  /(token|secret|private|signature|signed|mnemonic|seed|password|passphrase|credential|apikey|api_key|auth)/i;

/**
 * Filter an arbitrary draft object down to the permitted, non-sensitive
 * fields. Returns a new plain object; never mutates the input.
 */
export function sanitizeDraft(draft) {
  if (!draft || typeof draft !== 'object' || Array.isArray(draft)) return {};
  const safe = {};
  for (const key of DRAFT_FIELD_ALLOWLIST) {
    if (SENSITIVE_KEY_PATTERN.test(key)) continue;
    if (Object.prototype.hasOwnProperty.call(draft, key)) {
      const value = draft[key];
      if (value === undefined) continue;
      safe[key] = value;
    }
  }
  return safe;
}

// ── IndexedDB helpers ─────────────────────────────────────────────────────────

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORES.escrows)) {
        db.createObjectStore(STORES.escrows, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.profile)) {
        db.createObjectStore(STORES.profile, { keyPath: 'address' });
      }
      if (!db.objectStoreNames.contains(STORES.mutations)) {
        db.createObjectStore(STORES.mutations, {
          keyPath: 'id',
          autoIncrement: true,
        });
      }
      if (!db.objectStoreNames.contains(STORES.draft)) {
        db.createObjectStore(STORES.draft, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbPut(storeName, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(value);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function dbGetAll(storeName) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbClear(storeName) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).clear();
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function dbDelete(storeName, key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).delete(key);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

// ── Context ───────────────────────────────────────────────────────────────────

const DRAFT_ID = 'escrow-form';

const OfflineContext = createContext(null);

export function OfflineProvider({ children }) {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );
  const [isSyncing, setIsSyncing] = useState(false);
  const [cachedEscrows, setCachedEscrows] = useState([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [draft, setDraft] = useState({});
  const syncRef = useRef(false);

  // ── Online/offline detection ───────────────────────────────────────────────
  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // ── Load cached escrows and offline draft on mount ─────────────────────────
  useEffect(() => {
    dbGetAll(STORES.escrows)
      .then(setCachedEscrows)
      .catch(() => {});
    dbGetAll(STORES.mutations)
      .then((m) => setPendingCount(m.length))
      .catch(() => {});
    dbGetAll(STORES.draft)
      .then((rows) => {
        const stored = rows.find((r) => r.id === DRAFT_ID);
        // Filter again on read so only permitted fields are restored.
        setDraft(stored ? sanitizeDraft(stored.data) : {});
      })
      .catch(() => {});
  }, []);

  // ── Persist a sanitized offline draft ──────────────────────────────────────
  const saveDraft = useCallback(async (nextDraft) => {
    const safe = sanitizeDraft(nextDraft);
    setDraft(safe);
    await dbPut(STORES.draft, {
      id: DRAFT_ID,
      data: safe,
      _savedAt: Date.now(),
    }).catch(() => {});
    return safe;
  }, []);

  const clearDraft = useCallback(async () => {
    setDraft({});
    await dbDelete(STORES.draft, DRAFT_ID).catch(() => {});
  }, []);

  // ── Cache escrow data ──────────────────────────────────────────────────────
  const cacheEscrows = useCallback(async (escrows) => {
    for (const e of escrows) {
      await dbPut(STORES.escrows, { ...e, _cachedAt: Date.now() }).catch(() => {});
    }
    setCachedEscrows(await dbGetAll(STORES.escrows).catch(() => []));
  }, []);

  // ── Queue a non-financial mutation for later replay ────────────────────────
  const queueMutation = useCallback(async (mutation) => {
    await dbPut(STORES.mutations, {
      ...mutation,
      _queuedAt: Date.now(),
    }).catch(() => {});
    const all = await dbGetAll(STORES.mutations).catch(() => []);
    setPendingCount(all.length);
  }, []);

  // ── Sync queued mutations when back online ─────────────────────────────────
  const syncMutations = useCallback(async () => {
    if (syncRef.current) return;
    syncRef.current = true;
    setIsSyncing(true);

    try {
      const mutations = await dbGetAll(STORES.mutations);
      for (const m of mutations) {
        try {
          await fetch(m.url, {
            method: m.method ?? 'POST',
            headers: { 'Content-Type': 'application/json', ...(m.headers ?? {}) },
            body: m.body ? JSON.stringify(m.body) : undefined,
          });
          await dbDelete(STORES.mutations, m.id);
        } catch {
          // Leave in queue — will retry next time
        }
      }
      const remaining = await dbGetAll(STORES.mutations).catch(() => []);
      setPendingCount(remaining.length);
    } finally {
      setIsSyncing(false);
      syncRef.current = false;
    }
  }, []);

  // ── Auto-sync when coming back online ─────────────────────────────────────
  useEffect(() => {
    if (isOnline) syncMutations();
  }, [isOnline, syncMutations]);

  return (
    <OfflineContext.Provider
      value={{
        isOnline,
        isSyncing,
        cachedEscrows,
        pendingCount,
        draft,
        cacheEscrows,
        queueMutation,
        syncMutations,
        saveDraft,
        clearDraft,
      }}
    >
      {children}
    </OfflineContext.Provider>
  );
}

export function useOffline() {
  const ctx = useContext(OfflineContext);
  if (!ctx) throw new Error('useOffline must be used within OfflineProvider');
  return ctx;
}
