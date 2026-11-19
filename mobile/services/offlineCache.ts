import * as SQLite from 'expo-sqlite';
import { AppState, type AppStateStatus } from 'react-native';

const db = SQLite.openDatabaseSync('escrow_cache.db');

const CACHE_VERSION = 1;

const CACHE_TTL_MS: Record<string, number> = {
  escrow: 5 * 60 * 1000,
  milestone: 2 * 60 * 1000,
  reputation: 30 * 60 * 1000,
};

const DEFAULT_TTL_MS = 5 * 60 * 1000;

function getTTL(entityType: string): number {
  return CACHE_TTL_MS[entityType] ?? DEFAULT_TTL_MS;
}

function initCacheDb(): void {
  db.execSync(`
    CREATE TABLE IF NOT EXISTS cache_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  const row = db.getFirstSync<{ value: string }>(
    'SELECT value FROM cache_meta WHERE key = ?',
    ['schema_version']
  );

  const storedVersion = row ? parseInt(row.value, 10) : 0;

  if (storedVersion < CACHE_VERSION) {
    db.execSync('DROP TABLE IF EXISTS escrow_cache');
    db.execSync(
      `INSERT OR REPLACE INTO cache_meta (key, value) VALUES ('schema_version', '${CACHE_VERSION}')`
    );
  }

  const cacheColumns = db.getAllSync<{ name: string }>('PRAGMA table_info(escrow_cache)');
  if (cacheColumns.length > 0 && !cacheColumns.some((c) => c.name === 'wallet')) {
    db.execSync(`ALTER TABLE escrow_cache ADD COLUMN wallet TEXT NOT NULL DEFAULT ''`);
  }

  db.execSync(`
    CREATE TABLE IF NOT EXISTS escrow_cache (
      id TEXT PRIMARY KEY,
      wallet TEXT NOT NULL DEFAULT '',
      data TEXT NOT NULL,
      entity_type TEXT NOT NULL DEFAULT 'escrow',
/**
 * Offline Cache Service
 *
 * Persists escrow data to SQLite so the app remains usable without a network
 * connection. The cache is invalidated when the app comes back online.
 */

import * as SQLite from 'expo-sqlite';

const db = SQLite.openDatabaseSync('ste_offline.db');

const CACHE_TTL_MS = parseInt(process.env.EXPO_PUBLIC_OFFLINE_CACHE_TTL_MS ?? '300000', 10); // 5 min default

let activeWallet: string | null = null;

export function getActiveWallet(): string | null {
  return activeWallet;
}

/**
 * Scope the offline cache to the signed-in wallet. When the wallet changes,
 * all cached rows belonging to the previous wallet are purged so one account
 * can never observe another account's escrow or reputation records.
 */
export function setActiveWallet(address: string | null): void {
  const next = address ?? null;
  if (next === activeWallet) return;

  const previous = activeWallet;
  activeWallet = next;

  if (previous !== null) {
    db.runSync(`DELETE FROM escrows WHERE wallet = ?`, [previous]);
    db.runSync(`DELETE FROM milestones WHERE wallet = ?`, [previous]);
    db.runSync(`DELETE FROM escrow_cache WHERE wallet = ?`, [previous]);
  }
}

function requireWallet(): string {
  if (!activeWallet) {
    throw new Error('offlineCache: no active wallet set');
  }
  return activeWallet;
}

function safeParseRow<T>(
  row: { id?: string | number; escrow_id?: string; data: string } | null,
  tableName: string,
): T | null {
  if (!row) return null;
  try {
    return JSON.parse(row.data) as T;
  } catch {
    const pk = row.id ?? row.escrow_id;
    db.runSync(`DELETE FROM ${tableName} WHERE id = ?`, [String(pk)]);
    return null;
  }
}

export function initOfflineDb(): void {
  db.execSync(`
    CREATE TABLE IF NOT EXISTS escrows (
      id TEXT PRIMARY KEY,
      wallet TEXT NOT NULL DEFAULT '',
      data TEXT NOT NULL,
      cached_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS milestones (
      id INTEGER PRIMARY KEY,
      escrow_id TEXT NOT NULL,
      wallet TEXT NOT NULL DEFAULT '',
      data TEXT NOT NULL,
      cached_at INTEGER NOT NULL
    );
  `);

  // Migrate pre-existing tables that lack the wallet column.
  for (const table of ['escrows', 'milestones']) {
    const columns = db.getAllSync<{ name: string }>(`PRAGMA table_info(${table})`);
    if (!columns.some((c) => c.name === 'wallet')) {
      db.execSync(`ALTER TABLE ${table} ADD COLUMN wallet TEXT NOT NULL DEFAULT ''`);
    }
  }
}

initCacheDb();

export interface Escrow {
  id: string;
  status: string;
  [key: string]: unknown;
}

export function cacheEscrow(escrow: Escrow, entityType = 'escrow'): void {
  const wallet = requireWallet();
  db.runSync(
    'INSERT OR REPLACE INTO escrow_cache (id, wallet, data, entity_type, cached_at) VALUES (?, ?, ?, ?, ?)',
    [escrow.id, wallet, JSON.stringify(escrow), entityType, Date.now()]
  );
}

export function getCachedEscrow(id: string, entityType = 'escrow'): Escrow | null {
  const wallet = requireWallet();
  const row = db.getFirstSync<{ data: string; cached_at: number }>(
    'SELECT data, cached_at FROM escrow_cache WHERE id = ? AND wallet = ?',
    [id, wallet]
  );

  if (!row) return null;

  if (Date.now() - row.cached_at > getTTL(entityType)) {
    db.runSync('DELETE FROM escrow_cache WHERE id = ? AND wallet = ?', [id, wallet]);
    return null;
  }

  try {
    return JSON.parse(row.data) as Escrow;
  } catch {
    db.runSync('DELETE FROM escrow_cache WHERE id = ? AND wallet = ?', [id, wallet]);
    console.warn(`Corrupted cache entry deleted: id=${id}`);
    return null;
  }
}

export function getCachedEscrows(entityType = 'escrow'): Escrow[] {
  const wallet = requireWallet();
  const ttl = getTTL(entityType);
  const cutoff = Date.now() - ttl;

  db.runSync('DELETE FROM escrow_cache WHERE wallet = ? AND entity_type = ? AND cached_at <= ?', [
    wallet,
    entityType,
    cutoff,
  ]);

  const rows = db.getAllSync<{ id: string; data: string }>(
    'SELECT id, data FROM escrow_cache WHERE wallet = ? AND entity_type = ?',
    [wallet, entityType]
  );

  const results: Escrow[] = [];
  const corruptedIds: string[] = [];

  for (const row of rows) {
    try {
      results.push(JSON.parse(row.data) as Escrow);
    } catch {
      corruptedIds.push(row.id);
    }
  }

  if (corruptedIds.length > 0) {
    const placeholders = corruptedIds.map(() => '?').join(',');
    db.runSync(
      `DELETE FROM escrow_cache WHERE wallet = ? AND id IN (${placeholders})`,
      [wallet, ...corruptedIds]
    );
    console.warn(`Deleted ${corruptedIds.length} corrupted cache entries`);
  }

  return results;
}

export function pruneStaleCache(): void {
  const now = Date.now();
  for (const [entityType, ttl] of Object.entries(CACHE_TTL_MS)) {
    db.runSync('DELETE FROM escrow_cache WHERE entity_type = ? AND cached_at <= ?', [
      entityType,
      now - ttl,
    ]);
  }
  db.runSync('DELETE FROM escrow_cache WHERE cached_at <= ?', [now - DEFAULT_TTL_MS]);

  if (activeWallet) {
    const cutoff = now - CACHE_TTL_MS;
    db.runSync(`DELETE FROM escrows WHERE wallet = ? AND cached_at < ?`, [activeWallet, cutoff]);
    db.runSync(`DELETE FROM milestones WHERE wallet = ? AND cached_at < ?`, [activeWallet, cutoff]);
  }
}

let appStateSubscription: { remove: () => void } | null = null;

export function startCacheCleanupListener(): void {
  if (appStateSubscription) return;

  appStateSubscription = AppState.addEventListener(
    'change',
    (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        pruneStaleCache();
      }
    }
  );
}

export function stopCacheCleanupListener(): void {
  appStateSubscription?.remove();
  appStateSubscription = null;
}

export function clearAllCache(): void {
  db.runSync('DELETE FROM escrow_cache');
  db.runSync('DELETE FROM escrows');
  db.runSync('DELETE FROM milestones');
}

export function invalidateCacheVersion(): void {
  db.execSync('DROP TABLE IF EXISTS escrow_cache');
  db.execSync(
    `INSERT OR REPLACE INTO cache_meta (key, value) VALUES ('schema_version', '${CACHE_VERSION}')`
  );
  initCacheDb();
export function cacheEscrow(escrow: Record<string, unknown>): void {
  const wallet = requireWallet();
  db.runSync(`INSERT OR REPLACE INTO escrows (id, wallet, data, cached_at) VALUES (?, ?, ?, ?)`, [
    String(escrow.id),
    wallet,
    JSON.stringify(escrow),
    Date.now(),
  ]);
}

export function getCachedEscrow(id: string): Record<string, unknown> | null {
  const wallet = requireWallet();
  const row = db.getFirstSync<{ id: string; data: string; cached_at: number }>(
    `SELECT id, data, cached_at FROM escrows WHERE id = ? AND wallet = ?`,
    [id, wallet],
  );
  if (!row || Date.now() - row.cached_at > CACHE_TTL_MS) {
    if (row) db.runSync(`DELETE FROM escrows WHERE id = ? AND wallet = ?`, [id, wallet]);
    return null;
  }
  return safeParseRow<Record<string, unknown>>(row, 'escrows');
}

export function getCachedEscrows(): Record<string, unknown>[] {
  const wallet = requireWallet();
  const cutoff = Date.now() - CACHE_TTL_MS;
  db.runSync(`DELETE FROM escrows WHERE wallet = ? AND cached_at < ?`, [wallet, cutoff]);
  const rows = db.getAllSync<{ id: string; data: string; cached_at: number }>(
    `SELECT id, data, cached_at FROM escrows WHERE wallet = ? ORDER BY cached_at DESC`,
    [wallet],
  );
  return rows
    .map((r) => safeParseRow<Record<string, unknown>>(r, 'escrows'))
    .filter((r): r is Record<string, unknown> => r !== null);
}

export function cacheMilestones(escrowId: string, milestones: Record<string, unknown>[]): void {
  const wallet = requireWallet();
  db.runSync(`DELETE FROM milestones WHERE escrow_id = ? AND wallet = ?`, [escrowId, wallet]);
  for (const m of milestones) {
    db.runSync(
      `INSERT INTO milestones (id, escrow_id, wallet, data, cached_at) VALUES (?, ?, ?, ?, ?)`,
      [Number(m.id), escrowId, wallet, JSON.stringify(m), Date.now()],
    );
  }
}

export function getCachedMilestones(escrowId: string): Record<string, unknown>[] {
  const wallet = requireWallet();
  const cutoff = Date.now() - CACHE_TTL_MS;
  db.runSync(`DELETE FROM milestones WHERE escrow_id = ? AND wallet = ? AND cached_at < ?`, [
    escrowId,
    wallet,
    cutoff,
  ]);
  const rows = db.getAllSync<{ id: number; data: string; cached_at: number }>(
    `SELECT id, data, cached_at FROM milestones WHERE escrow_id = ? AND wallet = ? ORDER BY id`,
    [escrowId, wallet],
  );
  return rows
    .map((r) => safeParseRow<Record<string, unknown>>(r, 'milestones'))
    .filter((r): r is Record<string, unknown> => r !== null);
}

export interface EscrowStateSnapshot {
  status?: string;
  version?: string | number;
  [key: string]: unknown;
}

export interface ReconcileResult {
  stale: boolean;
  requiresRefresh: boolean;
  cached: EscrowStateSnapshot | null;
  fresh: EscrowStateSnapshot | null;
}

function stateMismatch(
  cached: EscrowStateSnapshot | null,
  fresh: EscrowStateSnapshot | null,
): boolean {
  if (!cached || !fresh) return true;
  if (cached.status !== fresh.status) return true;
  if (cached.version !== undefined && fresh.version !== undefined) {
    return String(cached.version) !== String(fresh.version);
  }
  return false;
}

/**
 * Compare a cached escrow snapshot with freshly fetched indexed/on-chain
 * state. On mismatch the cached entry is marked stale (removed) so it can no
 * longer be used to drive actions.
 */
export function reconcileEscrowState(
  cached: EscrowStateSnapshot | null,
  fresh: EscrowStateSnapshot | null,
): ReconcileResult {
  const stale = stateMismatch(cached, fresh);

  if (stale && cached && activeWallet) {
    const id = cached.id;
    if (id !== undefined) {
      db.runSync(`DELETE FROM escrows WHERE id = ? AND wallet = ?`, [String(id), activeWallet]);
    }
  }

  return { stale, requiresRefresh: stale, cached, fresh };
}

/**
 * Guard for actions that depend on escrow state. Returns false (and forces a
 * refresh) when the cached state is stale relative to the fresh state, so an
 * action is never submitted against obsolete state.
 */
export function canSubmitAction(
  escrowId: string,
  freshState: EscrowStateSnapshot | null,
): boolean {
  const cached = getCachedEscrow(escrowId);
  const result = reconcileEscrowState(cached, freshState);
  return !result.stale;
}
