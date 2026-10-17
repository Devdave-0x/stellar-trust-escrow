/**
 * Reputation Search Service — Elasticsearch primary, Prisma fallback.
 *
 * Index: reputation_records
 * Fields: address, total_score, completed_escrows, disputed_escrows,
 *         disputes_won, total_volume, last_updated, tenant_id
 *
 * Public API:
 *   ensureIndex()          — create index + mapping if absent
 *   indexRecord(record)    — upsert one reputation record
 *   bulkSync(records)      — bulk upsert (used by sync job)
 *   search(query, opts)    — full-text + filter search with Prisma fallback
 *   leaderboard(opts)      — top-N by score with Prisma fallback
 *   syncFromPrisma()       — full re-sync from Prisma (run on startup / cron)
 */

import { Client } from '@elastic/elasticsearch';
import { randomUUID } from 'node:crypto';
import prisma from '../lib/prisma.js';

// ── Telemetry (bounded, secret-free) ──────────────────────────────────────────

const METRIC_PREFIX = 'reputation_search';

// Fixed label sets — never include raw query text, addresses, or tenant IDs.
const OUTCOMES = Object.freeze(['es_success', 'fallback_success', 'fallback_failure', 'degraded']);
const REASONS = Object.freeze([
  'none',
  'es_unavailable',
  'es_error',
  'fallback_error',
  'invalid_input',
]);

const _counters = new Map();
const _histograms = new Map();

function _bumpCounter(name, labels) {
  const key = `${name}|${labels.outcome}|${labels.reason}`;
  _counters.set(key, (_counters.get(key) ?? 0) + 1);
}

function _observeHistogram(name, labels, value) {
  const key = `${name}|${labels.outcome}|${labels.reason}`;
  const bucket = _histograms.get(key) ?? { count: 0, sum: 0, max: 0 };
  bucket.count += 1;
  bucket.sum += value;
  if (value > bucket.max) bucket.max = value;
  _histograms.set(key, bucket);
}

function _normalizeOutcome(outcome) {
  return OUTCOMES.includes(outcome) ? outcome : 'degraded';
}

function _normalizeReason(reason) {
  return REASONS.includes(reason) ? reason : 'none';
}

/**
 * Emit a bounded counter + latency histogram for a search attempt.
 * Labels are restricted to fixed enums so cardinality stays bounded.
 */
function emitTelemetry({ outcome, reason, durationMs }) {
  const labels = {
    outcome: _normalizeOutcome(outcome),
    reason: _normalizeReason(reason),
  };
  _bumpCounter(`${METRIC_PREFIX}_requests_total`, labels);
  if (typeof durationMs === 'number' && Number.isFinite(durationMs) && durationMs >= 0) {
    _observeHistogram(`${METRIC_PREFIX}_duration_ms`, labels, Math.round(durationMs));
  }
}

/**
 * Structured, secret-free log line. Only bounded fields are included.
 */
function logEvent(level, event, fields = {}) {
  const record = {
    ts: new Date().toISOString(),
    scope: 'ReputationSearch',
    level,
    event,
    ...fields,
  };
  const line = JSON.stringify(record);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

/**
 * Snapshot of collected metrics (for tests / diagnostics). Deterministic order.
 */
export function getMetricsSnapshot() {
  const counters = [..._counters.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => {
      const [name, outcome, reason] = key.split('|');
      return { name, labels: { outcome, reason }, value };
    });
  const histograms = [..._histograms.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, bucket]) => {
      const [name, outcome, reason] = key.split('|');
      return { name, labels: { outcome, reason }, ...bucket };
    });
  return { counters, histograms };
}

export function resetMetrics() {
  _counters.clear();
  _histograms.clear();
}

function newCorrelationId() {
  return randomUUID();
}

// ── ES client (lazy, singleton) ───────────────────────────────────────────────

let _client = null;

function getClient() {
  if (_client) return _client;
  const url = process.env.ELASTICSEARCH_URL;
  if (!url) return null;
  _client = new Client({
    node: url,
    ...(process.env.ELASTICSEARCH_API_KEY && {
      auth: { apiKey: process.env.ELASTICSEARCH_API_KEY },
    }),
    requestTimeout: 5000,
  });
  return _client;
}

export function isAvailable() {
  return !!getClient();
}

const INDEX = 'reputation_records';

// ── Index mapping ─────────────────────────────────────────────────────────────

const MAPPING = {
  mappings: {
    properties: {
      address: { type: 'keyword' },
      tenant_id: { type: 'keyword' },
      total_score: { type: 'long' },
      completed_escrows: { type: 'integer' },
      disputed_escrows: { type: 'integer' },
      disputes_won: { type: 'integer' },
      total_volume: { type: 'keyword' }, // stored as string (BigInt)
      last_updated: { type: 'date' },
      // address prefix field for autocomplete
      address_suggest: {
        type: 'search_as_you_type',
        max_shingle_size: 3,
      },
    },
  },
  settings: {
    number_of_shards: 1,
    number_of_replicas: 0,
  },
};

export async function ensureIndex() {
  const client = getClient();
  if (!client) return false;
  try {
    const exists = await client.indices.exists({ index: INDEX });
    if (!exists) {
      await client.indices.create({ index: INDEX, body: MAPPING });
      console.log(`[ReputationSearch] Created index "${INDEX}"`);
    }
    return true;
  } catch (err) {
    console.warn('[ReputationSearch] ensureIndex failed:', err.message);
    return false;
  }
}

// ── Document helpers ──────────────────────────────────────────────────────────

function toDoc(record) {
  return {
    address: record.address,
    tenant_id: record.tenantId,
    total_score: Number(record.totalScore ?? 0),
    completed_escrows: record.completedEscrows ?? 0,
    disputed_escrows: record.disputedEscrows ?? 0,
    disputes_won: record.disputesWon ?? 0,
    total_volume: String(record.totalVolume ?? '0'),
    last_updated: record.lastUpdated ?? record.updatedAt ?? new Date(),
    address_suggest: record.address,
  };
}

// ── Write operations ──────────────────────────────────────────────────────────

export async function indexRecord(record) {
  const client = getClient();
  if (!client) return false;
  try {
    await client.index({
      index: INDEX,
      id: record.address,
      document: toDoc(record),
    });
    return true;
  } catch (err) {
    console.warn('[ReputationSearch] indexRecord failed:', err.message);
    return false;
  }
}

export async function bulkSync(records) {
  const client = getClient();
  if (!client || records.length === 0) return 0;
  try {
    const ops = records.flatMap((r) => [{ index: { _index: INDEX, _id: r.address } }, toDoc(r)]);
    const { errors, items } = await client.bulk({ operations: ops, refresh: false });
    if (errors) {
      const failed = items.filter((i) => i.index?.error).length;
      console.warn(`[ReputationSearch] bulkSync: ${failed} errors`);
    }
    return records.length;
  } catch (err) {
    console.warn('[ReputationSearch] bulkSync failed:', err.message);
    return 0;
  }
}

// ── Full re-sync from Prisma ──────────────────────────────────────────────────

const SYNC_BATCH = 500;

export async function syncFromPrisma() {
  if (!isAvailable()) return 0;
  await ensureIndex();

  let synced = 0;
  let cursor = undefined;

  for (;;) {
    const batch = await prisma.reputationRecord.findMany({
      take: SYNC_BATCH,
      ...(cursor && { skip: 1, cursor: { address: cursor } }),
      orderBy: { address: 'asc' },
    });
    if (batch.length === 0) break;
    synced += await bulkSync(batch);
    cursor = batch[batch.length - 1].address;
    if (batch.length < SYNC_BATCH) break;
  }

  console.log(`[ReputationSearch] syncFromPrisma: synced ${synced} records`);
  return synced;
}

// ── Search ────────────────────────────────────────────────────────────────────

/**
 * Full-text + filter search with Prisma fallback.
 *
 * @param {string} q          - address prefix or partial address
 * @param {object} opts
 * @param {string} [opts.tenantId]
 * @param {number} [opts.limit=10]
 * @param {number} [opts.from=0]
 * @returns {Promise<{ hits: object[], total: number, source: 'es'|'prisma' }>}
 */
// ── Single-flight fallback dedupe ─────────────────────────────────────────────

const _inflight = new Map();

function fallbackKey({ tenantId, q, limit, from }) {
  // Deterministic key; never logged.
  return JSON.stringify([tenantId ?? null, q ?? '', limit, from]);
}

/**
 * Run `fn` once per identical key while a call is in flight; overlapping
 * callers share the same promise (single-flight). Side effects stay idempotent
 * because the underlying Prisma reads are pure.
 */
function singleFlight(key, fn) {
  const existing = _inflight.get(key);
  if (existing) return existing;
  const promise = (async () => {
    try {
      return await fn();
    } finally {
      _inflight.delete(key);
    }
  })();
  _inflight.set(key, promise);
  return promise;
}

function degradedResponse(reason) {
  return { hits: [], total: 0, source: 'degraded', degraded: true, reason };
}

async function runPrismaFallback({ q, tenantId, limit, from }) {
  const where = {
    ...(tenantId && { tenantId }),
    ...(q && { address: { contains: q, mode: 'insensitive' } }),
  };
  const [records, total] = await prisma.$transaction([
    prisma.reputationRecord.findMany({
      where,
      // Deterministic ordering: score desc, then address asc as tie-breaker.
      orderBy: [{ totalScore: 'desc' }, { address: 'asc' }],
      skip: from,
      take: limit,
    }),
    prisma.reputationRecord.count({ where }),
  ]);
  return { hits: records.map(toDoc), total, source: 'prisma' };
}

export async function search(q, { tenantId, limit = 10, from = 0 } = {}) {
  const correlationId = newCorrelationId();
  const startedAt = Date.now();
  const client = getClient();

  if (client) {
    try {
      const must = [];
      if (q) {
        must.push({
          multi_match: {
            query: q,
            fields: [
              'address',
              'address_suggest',
              'address_suggest._2gram',
              'address_suggest._3gram',
            ],
            type: 'bool_prefix',
          },
        });
      }
      if (tenantId) must.push({ term: { tenant_id: tenantId } });

      const { hits } = await client.search({
        index: INDEX,
        body: {
          query: must.length ? { bool: { must } } : { match_all: {} },
          sort: [{ total_score: 'desc' }],
          from,
          size: limit,
        },
      });

      emitTelemetry({
        outcome: 'es_success',
        reason: 'none',
        durationMs: Date.now() - startedAt,
      });
      logEvent('info', 'search_es_success', { correlationId, source: 'es' });

      return {
        hits: hits.hits.map((h) => h._source),
        total: typeof hits.total === 'object' ? hits.total.value : hits.total,
        source: 'es',
      };
    } catch (err) {
      logEvent('warn', 'search_es_failed_falling_back', {
        correlationId,
        reason: 'es_error',
        errorName: err?.name ?? 'Error',
      });
    }
  } else {
    logEvent('info', 'search_es_unavailable_falling_back', {
      correlationId,
      reason: 'es_unavailable',
    });
  }

  // ── Prisma fallback (single-flight, deterministic, graceful) ──────────────
  const key = fallbackKey({ tenantId, q, limit, from });
  try {
    const result = await singleFlight(key, () => runPrismaFallback({ q, tenantId, limit, from }));
    emitTelemetry({
      outcome: 'fallback_success',
      reason: client ? 'es_error' : 'es_unavailable',
      durationMs: Date.now() - startedAt,
    });
    logEvent('info', 'search_fallback_success', {
      correlationId,
      source: 'prisma',
      reason: client ? 'es_error' : 'es_unavailable',
    });
    return result;
  } catch (err) {
    const reason = 'fallback_error';
    emitTelemetry({
      outcome: 'fallback_failure',
      reason,
      durationMs: Date.now() - startedAt,
    });
    logEvent('warn', 'search_fallback_failed_degraded', {
      correlationId,
      reason,
      errorName: err?.name ?? 'Error',
    });
    return degradedResponse(reason);
  }
}

// ── Leaderboard aggregation ───────────────────────────────────────────────────

/**
 * Top-N reputation records sorted by score, with Prisma fallback.
 *
 * @param {object} opts
 * @param {string} [opts.tenantId]
 * @param {number} [opts.limit=20]
 * @param {number} [opts.from=0]
 * @returns {Promise<{ hits: object[], total: number, source: 'es'|'prisma' }>}
 */
export async function leaderboard({ tenantId, limit = 20, from = 0 } = {}) {
  return search('', { tenantId, limit, from });
}

// ── Graceful degradation helper ───────────────────────────────────────────────

/**
 * Wrap a search-like call so that unexpected infrastructure failures yield a
 * stable degraded response instead of throwing. Public shape is preserved for
 * the success path.
 */
export async function withGracefulDegradation(fn) {
  try {
    return await fn();
  } catch (err) {
    emitTelemetry({ outcome: 'degraded', reason: 'fallback_error', durationMs: 0 });
    logEvent('warn', 'search_degraded', {
      correlationId: newCorrelationId(),
      reason: 'fallback_error',
      errorName: err?.name ?? 'Error',
    });
    return degradedResponse('fallback_error');
  }
}
