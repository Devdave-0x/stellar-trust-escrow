/**
 * Offline Cache Service
 *
 * Persists escrow and milestone data to SQLite so active escrow details remain
 * readable when the device loses connectivity. Cached reads are intentionally
 * read-only; mutation screens should disable write actions while offline.
 */

import * as SQLite from 'expo-sqlite';

const db = SQLite.openDatabaseSync('ste_offline.db');

const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_TTL_MS = Number.parseInt(
  process.env.EXPO_PUBLIC_OFFLINE_CACHE_TTL_MS ?? String(DEFAULT_CACHE_TTL_MS),
  10,
);

export interface Escrow {
  id: string;
  status: string;
  milestones?: Milestone[];
  [key: string]: unknown;
}

export interface Milestone {
  id: number;
  escrowId?: string;
  status: string;
  [key: string]: unknown;
}

function cacheCutoff(): number {
  return Date.now() - CACHE_TTL_MS;
}

function safeParseRow<T>(
  row: { id?: string | number; escrow_id?: string; data: string } | null,
  tableName: 'escrows' | 'milestones',
): T | null {
  if (!row) return null;

  try {
    return JSON.parse(row.data) as T;
  } catch {
    const key = tableName === 'milestones' ? row.id : row.id ?? row.escrow_id;
    if (key !== undefined) {
      db.runSync(`DELETE FROM ${tableName} WHERE id = ?`, [String(key)]);
    }
    return null;
  }
}

export function initOfflineDb(): void {
  db.execSync(`
    CREATE TABLE IF NOT EXISTS escrows (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      cached_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS milestones (
      id TEXT PRIMARY KEY,
      escrow_id TEXT NOT NULL,
      data TEXT NOT NULL,
      cached_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_milestones_escrow_id ON milestones (escrow_id);
  `);
}

initOfflineDb();

export function cacheEscrow(escrow: Record<string, unknown>): void {
  if (!escrow.id) return;

  db.runSync('INSERT OR REPLACE INTO escrows (id, data, cached_at) VALUES (?, ?, ?)', [
    String(escrow.id),
    JSON.stringify(escrow),
    Date.now(),
  ]);
}

export function getCachedEscrow(id: string): Escrow | null {
  const row = db.getFirstSync<{ id: string; data: string; cached_at: number }>(
    'SELECT id, data, cached_at FROM escrows WHERE id = ?',
    [id],
  );

  if (!row) return null;
  if (row.cached_at < cacheCutoff()) {
    db.runSync('DELETE FROM escrows WHERE id = ?', [id]);
    return null;
  }

  return safeParseRow<Escrow>(row, 'escrows');
}

export function getCachedEscrows(): Escrow[] {
  db.runSync('DELETE FROM escrows WHERE cached_at < ?', [cacheCutoff()]);

  const rows = db.getAllSync<{ id: string; data: string; cached_at: number }>(
    'SELECT id, data, cached_at FROM escrows ORDER BY cached_at DESC',
  );

  return rows
    .map((row) => safeParseRow<Escrow>(row, 'escrows'))
    .filter((escrow): escrow is Escrow => escrow !== null);
}

export function cacheMilestones(escrowId: string, milestones: Record<string, unknown>[]): void {
  db.runSync('DELETE FROM milestones WHERE escrow_id = ?', [escrowId]);

  for (const milestone of milestones) {
    if (milestone.id === undefined || milestone.id === null) continue;

    db.runSync(
      'INSERT OR REPLACE INTO milestones (id, escrow_id, data, cached_at) VALUES (?, ?, ?, ?)',
      [String(milestone.id), escrowId, JSON.stringify({ ...milestone, escrowId }), Date.now()],
    );
  }
}

export function getCachedMilestones(escrowId: string): Milestone[] {
  db.runSync('DELETE FROM milestones WHERE escrow_id = ? AND cached_at < ?', [
    escrowId,
    cacheCutoff(),
  ]);

  const rows = db.getAllSync<{ id: string; data: string; cached_at: number }>(
    'SELECT id, data, cached_at FROM milestones WHERE escrow_id = ? ORDER BY CAST(id AS INTEGER)',
    [escrowId],
  );

  return rows
    .map((row) => safeParseRow<Milestone>(row, 'milestones'))
    .filter((milestone): milestone is Milestone => milestone !== null);
}

export function pruneStaleCache(): void {
  const cutoff = cacheCutoff();
  db.runSync('DELETE FROM escrows WHERE cached_at < ?', [cutoff]);
  db.runSync('DELETE FROM milestones WHERE cached_at < ?', [cutoff]);
}

export function clearAllCache(): void {
  db.runSync('DELETE FROM escrows');
  db.runSync('DELETE FROM milestones');
}
