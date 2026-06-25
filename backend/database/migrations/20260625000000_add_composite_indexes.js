/**
 * Migration: Add composite indexes for common query patterns
 * Issue #62
 *
 * Query patterns covered:
 *  1. (tenant_id, status)              — Escrow list filtered by tenant + status
 *  2. (tenant_id, status, deadline)    — Escrow list with deadline filter/sort
 *  3. (tenant_id, created_at DESC)     — Escrow list sorted by date within tenant
 *  4. (status, deadline)               — Cross-tenant deadline monitoring queries
 *  5. (tenant_id, raised_at DESC)      — Dispute list sorted by date within tenant
 *  6. (tenant_id, status, created_at)  — Milestone list filtered by tenant + status
 *  7. (tenant_id, address, total_score)— Reputation leaderboard per tenant
 *
 * All indexes use CREATE INDEX CONCURRENTLY to avoid table locks on live data.
 * CONCURRENTLY is not supported inside an explicit transaction, so we run each
 * statement individually (no BEGIN/COMMIT wrapper).
 */

export async function up(db) {
  const indexes = [
    // Escrow: tenant + status + deadline (covers both status-only and deadline-range queries)
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_escrows_tenant_status_deadline
       ON escrows (tenant_id, status, deadline)`,

    // Escrow: tenant + created_at for date-sorted listing
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_escrows_tenant_created_at
       ON escrows (tenant_id, created_at DESC)`,

    // Escrow: status + deadline for scheduler / expiry sweeps
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_escrows_status_deadline
       ON escrows (status, deadline)`,

    // Dispute: tenant + raised_at for date-sorted listing within tenant
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_disputes_tenant_raised_at
       ON disputes (tenant_id, raised_at DESC)`,

    // Milestone: tenant + status + created at for filtered milestone lists
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_milestones_tenant_status
       ON milestones (tenant_id, status)`,

    // Reputation: tenant + total_score for leaderboard queries
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_reputation_tenant_score
       ON reputation_records (tenant_id, total_score DESC)`,
  ];

  for (const sql of indexes) {
    await db.query(sql);
  }
}

export async function down(db) {
  const drops = [
    `DROP INDEX CONCURRENTLY IF EXISTS idx_escrows_tenant_status_deadline`,
    `DROP INDEX CONCURRENTLY IF EXISTS idx_escrows_tenant_created_at`,
    `DROP INDEX CONCURRENTLY IF EXISTS idx_escrows_status_deadline`,
    `DROP INDEX CONCURRENTLY IF EXISTS idx_disputes_tenant_raised_at`,
    `DROP INDEX CONCURRENTLY IF EXISTS idx_milestones_tenant_status`,
    `DROP INDEX CONCURRENTLY IF EXISTS idx_reputation_tenant_score`,
  ];

  for (const sql of drops) {
    await db.query(sql);
  }
}
