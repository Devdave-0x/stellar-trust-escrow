/**
 * Analytics snapshot freshness for the admin dashboard banner.
 * Thresholds follow docs/monitoring/analytics-freshness-sla.md.
 */

import prisma from '../../lib/prisma.js';
import { logControllerError } from '../../config/logger.js';

/** A snapshot series is stale once its newest row is older than this. */
export const STALE_AFTER_MS = {
  '5min': 15 * 60 * 1000,
  hourly: 2 * 60 * 60 * 1000,
  daily: 26 * 60 * 60 * 1000,
};

/** Pure check over `groupBy` rows: [{ metric, period, _max: { snapshotAt } }]. */
export function findStaleSeries(rows, now = Date.now()) {
  return rows
    .map((r) => {
      const last = r._max?.snapshotAt ? new Date(r._max.snapshotAt) : null;
      const limit = STALE_AFTER_MS[r.period];
      const ageMs = last ? now - last.getTime() : Infinity;
      return { metric: r.metric, period: r.period, lastGeneratedAt: last?.toISOString() ?? null, ageMinutes: Number.isFinite(ageMs) ? Math.round(ageMs / 60000) : null, stale: limit !== undefined && ageMs > limit };
    })
    .filter((s) => s.stale)
    .map(({ stale, ...rest }) => rest);
}

/** GET /api/admin/analytics/freshness */
const getFreshness = async (req, res) => {
  try {
    const rows = await prisma.analyticsSnapshot.groupBy({
      by: ['metric', 'period'],
      _max: { snapshotAt: true },
    });
    res.json({
      checkedAt: new Date().toISOString(),
      hasSnapshots: rows.length > 0,
      stale: findStaleSeries(rows),
    });
  } catch (err) {
    logControllerError('admin.getAnalyticsFreshness', err, req);
    res.status(500).json({ error: err.message });
  }
};

export default { getFreshness };
