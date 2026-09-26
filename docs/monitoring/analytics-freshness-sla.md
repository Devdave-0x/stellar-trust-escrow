# Analytics Freshness SLA

Defines how often analytics snapshots are expected to be produced, when they
count as stale, and what operators do when they stop updating.

---

## 1. Where analytics data lives

| Source                       | What it holds                                                          | Refresh                                        |
| ---------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------- |
| `analytics_snapshots` table  | `AnalyticsSnapshot` rows: `snapshotAt`, `period`, `metric`, `value`, `labels` | Per `period`: `5min`, `hourly`, `daily`  |
| `GET /api/escrows/stats/*`   | Live volume, active count, success rate computed from `escrows`        | Response cache, 30 s (`TTL.STATS`)             |
| `GET /api/admin/stats`       | Escrow counts by status, total users, open disputes                    | Cache key `admin:stats`, 30 s                  |
| `/metrics` (Prometheus)      | Business gauges/counters (`backend/lib/metrics.js`)                    | Scrape interval                                |
| API analytics middleware     | Per-route request counts and latency (`api/middleware/analytics.js`)   | Flushed every `ANALYTICS_FLUSH_INTERVAL_MS` (default 10 s) to `ANALYTICS_DB_URL` |

Dashboards that show historical trends read `analytics_snapshots`. Live tiles
read the stats endpoints. This SLA covers `analytics_snapshots`; the live
endpoints are covered by the API SLA in `sla-anomaly.md`.

---

## 2. Metrics

Each snapshot row stores one `metric` for one `period`. Expected metric names:

| `metric`               | Definition                                                   | Periods                  |
| ---------------------- | ------------------------------------------------------------ | ------------------------ |
| `escrows_active`       | Escrows with `status = 'Active'`                             | `5min`, `hourly`, `daily`|
| `escrows_created`      | Escrows created in the period                                | `hourly`, `daily`        |
| `escrows_completed`    | Escrows that moved to `Completed` in the period              | `hourly`, `daily`        |
| `escrow_volume`        | Sum of `totalAmount` for escrows created in the period, per token (`labels.token`) | `hourly`, `daily` |
| `escrow_success_rate`  | Completed / (Completed + Cancelled + Disputed), 0–1          | `daily`                  |
| `disputes_open`        | Disputes with `resolvedAt = null`                            | `5min`, `hourly`, `daily`|
| `disputes_raised`      | Disputes created in the period                               | `hourly`, `daily`        |
| `milestones_completed` | Milestones approved in the period                            | `hourly`, `daily`        |
| `users_total`          | Count of `reputation_records`                                | `daily`                  |

New metrics must be added to this table in the same PR that starts writing
them.

---

## 3. Generation jobs

Snapshot jobs are registered in `backend/workers/scheduler.js` with
`node-cron`, following the existing jobs there (UTC timezone, errors caught
and logged with a `[Scheduler]` / job prefix so one failure does not stop the
scheduler).

| Job                     | Cron (UTC)    | Writes `period` | `snapshotAt`                 |
| ----------------------- | ------------- | --------------- | ---------------------------- |
| `analytics-snapshot-5m` | `*/5 * * * *` | `5min`          | Start of the 5-minute bucket |
| `analytics-snapshot-1h` | `5 * * * *`   | `hourly`        | Start of the previous hour   |
| `analytics-snapshot-1d` | `15 0 * * *`  | `daily`         | Start of the previous day    |

Rules:

- `snapshotAt` is the start of the bucket, not the time the job ran, so reruns
  are idempotent. A job must replace (delete + insert, or upsert) existing
  rows for the same `metric`, `period` and `snapshotAt`.
- Jobs only need the scheduler process (`backend/workers/`) and Postgres.
  They must not depend on Redis being available.

> At the time of writing the `AnalyticsSnapshot` model exists but no job in
> `scheduler.js` writes to it yet. Until the jobs land, the alerts below will
> fire; keep them silenced for the environment and rely on the live stats
> endpoints.

---

## 4. Freshness SLA and stale thresholds

Freshness = `now() - max(snapshotAt)` for a given `period` (and metric).

| `period` | Expected age | Warning (stale) | Critical     | SLA target                      |
| -------- | ------------ | --------------- | ------------ | ------------------------------- |
| `5min`   | ≤ 10 min     | > 15 min        | > 30 min     | 99% of the month within 15 min  |
| `hourly` | ≤ 70 min     | > 2 h           | > 4 h        | 99% of the month within 2 h     |
| `daily`  | ≤ 25 h       | > 26 h          | > 48 h       | 99% of the month within 26 h    |

Any metric missing from the latest bucket while others are present is also a
warning (partial snapshot).

### 4.1 Freshness check query

```sql
SELECT period,
       metric,
       max(snapshot_at)                  AS latest,
       now() - max(snapshot_at)          AS age
FROM analytics_snapshots
GROUP BY period, metric
ORDER BY period, age DESC;
```

The index `(metric, period, snapshot_at)` keeps this query cheap.

### 4.2 Alert thresholds

Expose the age above as a gauge (e.g. `analytics_snapshot_age_seconds{period}`)
from the scheduler or a periodic check, then add rules next to the existing
ones in `alerting.md`:

```yaml
- alert: AnalyticsSnapshotStale
  expr: >
    analytics_snapshot_age_seconds{period="5min"} > 900
    or analytics_snapshot_age_seconds{period="hourly"} > 7200
    or analytics_snapshot_age_seconds{period="daily"} > 93600
  for: 5m
  labels:
    severity: warning
- alert: AnalyticsSnapshotCritical
  expr: >
    analytics_snapshot_age_seconds{period="5min"} > 1800
    or analytics_snapshot_age_seconds{period="hourly"} > 14400
    or analytics_snapshot_age_seconds{period="daily"} > 172800
  for: 5m
  labels:
    severity: critical
```

---

## 5. Operator response when snapshots stop updating

1. **Confirm** with the query in 4.1 which `period`s are stale. If only one
   period is stale, the problem is that job; if all are stale, it is the
   scheduler or the database.
2. **Check the scheduler process** is running (`backend/workers/`) and look
   for `[Scheduler]` log lines. No lines at all → the process is down; restart
   it (see `docs/runbook.md` → Restart BullMQ workers).
3. **Check the database**: `GET /health` / readiness probe. If Postgres is
   unavailable, follow the database section of `docs/runbook.md`; snapshots
   will resume on their own.
4. **Check job errors** in logs for the failing job (query errors, timeouts).
   Fix or roll back the offending deploy.
5. **Rebuild missing buckets** (section 6) once the cause is fixed.
6. **Tell dashboard users** if the gap exceeds the critical threshold: post in
   the status channel that historical charts have a gap and when it will be
   backfilled.
7. Critical breaches lasting more than 4 hours get an incident write-up in
   `docs/incidents/`.

---

## 6. Manual rebuild steps

Because buckets are keyed by `snapshotAt`, rebuilding is safe to repeat.

1. Identify the gap: first and last missing `snapshotAt` per `period` from the
   query in 4.1 (or by listing distinct `snapshot_at` values in the range).
2. Take a database backup or confirm point-in-time recovery is available.
3. For each missing bucket, run the same job function the scheduler uses with
   an explicit bucket start, from the backend directory. The job module should
   export a function taking `{ period, at }` so it can be called this way
   (module name shown is the expected one once the job is added):

   ```bash
   node -e "import('./workers/analyticsSnapshotJob.js').then(m => m.runSnapshot({ period: 'hourly', at: '2026-01-01T10:00:00Z' }))"
   ```

   Only point-in-time counts that are derived from timestamps
   (`escrows_created`, `escrows_completed`, `disputes_raised`,
   `milestones_completed`, `escrow_volume`) can be rebuilt accurately.
   Gauge metrics (`escrows_active`, `disputes_open`) for past buckets cannot be
   reconstructed exactly; write the current value only for the latest bucket
   and leave historical gaps empty rather than inventing values.
4. Re-run the query in 4.1 and confirm ages are back under the warning
   threshold.
5. Invalidate cached dashboard responses if needed
   (`GET /api/admin/cache/stats` to inspect, cache tags `stats:*`).
6. Record the rebuilt range and cause in the incident or ops log.
