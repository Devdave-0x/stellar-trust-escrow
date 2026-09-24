/**
 * Offline Cache Service
 *
 * Persists escrow and milestone data to SQLite so the app remains usable
 * without a network connection. Entries expire per entity type and are
 * pruned whenever the app returns to the foreground.
 *
 * Every row carries a `schema_version` so payload formats can evolve: writes
 * stamp CACHE_SCHEMA_VERSION, and reads pass older rows through
 * CACHE_MIGRATIONS. Rows that cannot be migrated, were written by a newer
 * app build, or hold corrupted JSON are deleted instead of being returned.
 */

import * as SQLite from 'expo-sqlite';
import { AppState, type AppStateStatus } from 'react-native';

const db = SQLite.openDatabaseSync('ste_offline.db');

// === Schema versioning

/**
 * Payload format written by this build. Bump it when a cached payload's shape
 * changes, and register a migration from the previous version below.
 *
 * Version 1 is the format written before versioning existed; rows from those
 * builds are backfilled with 1 when the column is added.
 */
export const CACHE_SCHEMA_VERSION = 1;

export type CacheEntity = 'escrow' | 'milestone';

export type CachedRecord = Record<string, unknown>;

/** Upgrades a payload from version `n` (its key in CacheMigrations) to `n + 1`. */
export type CacheMigration = (payload: CachedRecord) => CachedRecord;

export type CacheMigrations = Record<CacheEntity, Record<number, CacheMigration>>;

export const CACHE_MIGRATIONS: CacheMigrations = {
  escrow: {},
  milestone: {},
};

/**
 * Bring a cached payload from `version` up to `targetVersion`.
 *
 * Returns null when the record cannot be used: an unknown or newer version
 * (written by a later app build), or a gap in the migration chain.
 */
export function migrateRecord(
  entity: CacheEntity,
  version: number,
  payload: CachedRecord,
  migrations: CacheMigrations = CACHE_MIGRATIONS,
  targetVersion: number = CACHE_SCHEMA_VERSION,
): CachedRecord | null {
  if (!Number.isInteger(version) || version < 1 || version > targetVersion) return null;

  let current = payload;
  for (let from = version; from < targetVersion; from += 1) {
    const step = migrations[entity][from];
    if (!step) return null;
    current = step(current);
  }
  return current;
}

// === TTLs

const ESCROW_TTL_MS = parseInt(process.env.EXPO_PUBLIC_OFFLINE_CACHE_TTL_MS ?? '300000', 10);
const MILESTONE_TTL_MS = 2 * 60 * 1000;

// Table names are fixed here and never come from callers, so interpolating
// them into SQL below is safe.
const TABLES = {
  escrow: { name: 'escrows', ttlMs: ESCROW_TTL_MS },
  milestone: { name: 'milestones', ttlMs: MILESTONE_TTL_MS },
} as const satisfies Record<CacheEntity, { name: string; ttlMs: number }>;

// === Setup

/** Add `schema_version` to a table created by a build that predates it. */
function ensureSchemaVersionColumn(table: string): void {
  const columns = db.getAllSync<{ name: string }>(`PRAGMA table_info(${table})`);
  if (!columns.some((column) => column.name === 'schema_version')) {
    db.execSync(`ALTER TABLE ${table} ADD COLUMN schema_version INTEGER NOT NULL DEFAULT 1`);
  }
}

export function initOfflineDb(): void {
  db.execSync(`
    CREATE TABLE IF NOT EXISTS escrows (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      cached_at INTEGER NOT NULL,
      schema_version INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS milestones (
      id INTEGER PRIMARY KEY,
      escrow_id TEXT NOT NULL,
      data TEXT NOT NULL,
      cached_at INTEGER NOT NULL,
      schema_version INTEGER NOT NULL DEFAULT 1
    );
  `);
  ensureSchemaVersionColumn(TABLES.escrow.name);
  ensureSchemaVersionColumn(TABLES.milestone.name);
}

// === Row decoding

interface CacheRow {
  id: string | number;
  data: string;
  cached_at: number;
  schema_version: number;
}

function deleteRow(entity: CacheEntity, id: string | number): void {
  db.runSync(`DELETE FROM ${TABLES[entity].name} WHERE id = ?`, [id]);
}

/**
 * Parse and migrate a row. Unusable rows are deleted and yield null; rows
 * migrated from an older version are rewritten at the current version so the
 * migration runs once per row.
 */
function decodeRow(entity: CacheEntity, row: CacheRow): CachedRecord | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(row.data);
  } catch {
    deleteRow(entity, row.id);
    console.warn(`Corrupted ${entity} cache entry deleted: id=${row.id}`);
    return null;
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    deleteRow(entity, row.id);
    return null;
  }

  const record = migrateRecord(entity, row.schema_version, parsed as CachedRecord);
  if (!record) {
    deleteRow(entity, row.id);
    return null;
  }

  if (row.schema_version !== CACHE_SCHEMA_VERSION) {
    db.runSync(`UPDATE ${TABLES[entity].name} SET data = ?, schema_version = ? WHERE id = ?`, [
      JSON.stringify(record),
      CACHE_SCHEMA_VERSION,
      row.id,
    ]);
  }
  return record;
}

function isExpired(entity: CacheEntity, cachedAt: number): boolean {
  return Date.now() - cachedAt > TABLES[entity].ttlMs;
}

// === Escrows

export interface Escrow {
  id: string;
  status: string;
  [key: string]: unknown;
}

export function cacheEscrow(escrow: Record<string, unknown>): void {
  db.runSync(
    `INSERT OR REPLACE INTO escrows (id, data, cached_at, schema_version) VALUES (?, ?, ?, ?)`,
    [String(escrow.id), JSON.stringify(escrow), Date.now(), CACHE_SCHEMA_VERSION],
  );
}

export function getCachedEscrow(id: string): Record<string, unknown> | null {
  const row = db.getFirstSync<CacheRow>(
    `SELECT id, data, cached_at, schema_version FROM escrows WHERE id = ?`,
    [id],
  );
  if (!row) return null;
  if (isExpired('escrow', row.cached_at)) {
    deleteRow('escrow', row.id);
    return null;
  }
  return decodeRow('escrow', row);
}

export function getCachedEscrows(): Record<string, unknown>[] {
  db.runSync(`DELETE FROM escrows WHERE cached_at < ?`, [Date.now() - ESCROW_TTL_MS]);
  const rows = db.getAllSync<CacheRow>(
    `SELECT id, data, cached_at, schema_version FROM escrows ORDER BY cached_at DESC`,
  );
  return rows
    .map((row) => decodeRow('escrow', row))
    .filter((record): record is Record<string, unknown> => record !== null);
}

// === Milestones

export function cacheMilestones(escrowId: string, milestones: Record<string, unknown>[]): void {
  db.runSync(`DELETE FROM milestones WHERE escrow_id = ?`, [escrowId]);
  for (const milestone of milestones) {
    db.runSync(
      `INSERT INTO milestones (id, escrow_id, data, cached_at, schema_version) VALUES (?, ?, ?, ?, ?)`,
      [Number(milestone.id), escrowId, JSON.stringify(milestone), Date.now(), CACHE_SCHEMA_VERSION],
    );
  }
}

export function getCachedMilestones(escrowId: string): Record<string, unknown>[] {
  db.runSync(`DELETE FROM milestones WHERE escrow_id = ? AND cached_at < ?`, [
    escrowId,
    Date.now() - MILESTONE_TTL_MS,
  ]);
  const rows = db.getAllSync<CacheRow>(
    `SELECT id, data, cached_at, schema_version FROM milestones WHERE escrow_id = ? ORDER BY id`,
    [escrowId],
  );
  return rows
    .map((row) => decodeRow('milestone', row))
    .filter((record): record is Record<string, unknown> => record !== null);
}

// === Maintenance

/** Delete every entry past its entity's TTL. */
export function pruneStaleCache(): void {
  const now = Date.now();
  for (const { name, ttlMs } of Object.values(TABLES)) {
    db.runSync(`DELETE FROM ${name} WHERE cached_at < ?`, [now - ttlMs]);
  }
}

let appStateSubscription: { remove: () => void } | null = null;

/** Prune stale entries whenever the app returns to the foreground. */
export function startCacheCleanupListener(): void {
  if (appStateSubscription) return;
  appStateSubscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
    if (nextState === 'active') pruneStaleCache();
  });
}

export function stopCacheCleanupListener(): void {
  appStateSubscription?.remove();
  appStateSubscription = null;
}

export function clearAllCache(): void {
  db.runSync(`DELETE FROM escrows`);
  db.runSync(`DELETE FROM milestones`);
}
