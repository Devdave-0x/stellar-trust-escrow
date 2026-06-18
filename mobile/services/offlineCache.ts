/**
 * Offline Cache Service
 *
 * Persists escrow data to SQLite so the app remains usable without a network
 * connection. The cache is invalidated when the app comes back online.
 */

import * as SQLite from 'expo-sqlite';

const db = SQLite.openDatabaseSync('ste_offline.db');

const CACHE_TTL_MS = parseInt(process.env.EXPO_PUBLIC_OFFLINE_CACHE_TTL_MS ?? '300000', 10); // 5 min default

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
      data TEXT NOT NULL,
      cached_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS milestones (
      id INTEGER PRIMARY KEY,
      escrow_id TEXT NOT NULL,
      data TEXT NOT NULL,
      cached_at INTEGER NOT NULL
    );
  `);
}

export function cacheEscrow(escrow: Record<string, unknown>): void {
  db.runSync(`INSERT OR REPLACE INTO escrows (id, data, cached_at) VALUES (?, ?, ?)`, [
    String(escrow.id),
    JSON.stringify(escrow),
    Date.now(),
  ]);
}

export function getCachedEscrow(id: string): Record<string, unknown> | null {
  const row = db.getFirstSync<{ id: string; data: string; cached_at: number }>(
    `SELECT id, data, cached_at FROM escrows WHERE id = ?`,
    [id],
  );
  if (!row || Date.now() - row.cached_at > CACHE_TTL_MS) {
    if (row) db.runSync(`DELETE FROM escrows WHERE id = ?`, [id]);
    return null;
  }
  return safeParseRow<Record<string, unknown>>(row, 'escrows');
}

export function getCachedEscrows(): Record<string, unknown>[] {
  const cutoff = Date.now() - CACHE_TTL_MS;
  db.runSync(`DELETE FROM escrows WHERE cached_at < ?`, [cutoff]);
  const rows = db.getAllSync<{ id: string; data: string; cached_at: number }>(
    `SELECT id, data, cached_at FROM escrows ORDER BY cached_at DESC`,
  );
  return rows
    .map((r) => safeParseRow<Record<string, unknown>>(r, 'escrows'))
    .filter((r): r is Record<string, unknown> => r !== null);
}

export function cacheMilestones(escrowId: string, milestones: Record<string, unknown>[]): void {
  db.runSync(`DELETE FROM milestones WHERE escrow_id = ?`, [escrowId]);
  for (const m of milestones) {
    db.runSync(`INSERT INTO milestones (id, escrow_id, data, cached_at) VALUES (?, ?, ?, ?)`, [
      Number(m.id),
      escrowId,
      JSON.stringify(m),
      Date.now(),
    ]);
  }
}

export function getCachedMilestones(escrowId: string): Record<string, unknown>[] {
  const cutoff = Date.now() - CACHE_TTL_MS;
  db.runSync(`DELETE FROM milestones WHERE escrow_id = ? AND cached_at < ?`, [escrowId, cutoff]);
  const rows = db.getAllSync<{ id: number; data: string; cached_at: number }>(
    `SELECT id, data, cached_at FROM milestones WHERE escrow_id = ? ORDER BY id`,
    [escrowId],
  );
  return rows
    .map((r) => safeParseRow<Record<string, unknown>>(r, 'milestones'))
    .filter((r): r is Record<string, unknown> => r !== null);
}
