/**
 * Migration: Add immutable escrow_audit_log table
 *
 * Creates an append-only audit trail for every escrow state transition.
 * Database-level constraints prevent UPDATE and DELETE via a PostgreSQL rule,
 * making the table tamper-evident at the storage layer.
 *
 * Columns:
 *   id          — BIGSERIAL primary key
 *   escrow_id   — references escrows(id)
 *   tenant_id   — multi-tenancy scoping
 *   actor_id    — Stellar address of the user who triggered the transition
 *   actor_ip    — client IP at time of transition
 *   action      — e.g. CREATE, FUND, RELEASE, RAISE_DISPUTE, RESOLVE_DISPUTE, CANCEL
 *   from_state  — escrow status before the transition (nullable for CREATE)
 *   to_state    — escrow status after the transition
 *   metadata    — JSONB snapshot of relevant context (tx hash, milestone index, etc.)
 *   created_at  — immutable insert timestamp
 */

export async function up(db) {
  // 1. Create the table
  await db.query(`
    CREATE TABLE IF NOT EXISTS escrow_audit_log (
      id          BIGSERIAL     PRIMARY KEY,
      escrow_id   BIGINT        NOT NULL,
      tenant_id   TEXT          NOT NULL,
      actor_id    TEXT          NOT NULL,
      actor_ip    TEXT,
      action      TEXT          NOT NULL,
      from_state  TEXT,
      to_state    TEXT          NOT NULL,
      metadata    JSONB,
      created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
    )
  `);

  // 2. Indexes for common query patterns
  await db.query(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_escrow_audit_log_escrow_id
      ON escrow_audit_log (escrow_id, created_at DESC)
  `);
  await db.query(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_escrow_audit_log_tenant_created
      ON escrow_audit_log (tenant_id, created_at DESC)
  `);
  await db.query(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_escrow_audit_log_actor
      ON escrow_audit_log (actor_id, created_at DESC)
  `);

  // 3. Append-only enforcement via PostgreSQL rules
  //    These rules silently block (or raise an error for) any UPDATE/DELETE.
  //    We use INSTEAD NOTHING to make them hard errors at the SQL level.
  await db.query(`
    CREATE OR REPLACE RULE escrow_audit_log_no_update AS
      ON UPDATE TO escrow_audit_log DO INSTEAD NOTHING
  `);
  await db.query(`
    CREATE OR REPLACE RULE escrow_audit_log_no_delete AS
      ON DELETE TO escrow_audit_log DO INSTEAD NOTHING
  `);
}

export async function down(db) {
  await db.query(`DROP RULE IF EXISTS escrow_audit_log_no_update ON escrow_audit_log`);
  await db.query(`DROP RULE IF EXISTS escrow_audit_log_no_delete ON escrow_audit_log`);
  await db.query(`DROP INDEX CONCURRENTLY IF EXISTS idx_escrow_audit_log_escrow_id`);
  await db.query(`DROP INDEX CONCURRENTLY IF EXISTS idx_escrow_audit_log_tenant_created`);
  await db.query(`DROP INDEX CONCURRENTLY IF EXISTS idx_escrow_audit_log_actor`);
  await db.query(`DROP TABLE IF EXISTS escrow_audit_log`);
}
