export async function up(prisma) {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS milestone_status_history (
      id           BIGSERIAL     PRIMARY KEY,
      milestone_id INTEGER       NOT NULL,
      escrow_id    BIGINT        NOT NULL,
      from_status  TEXT,
      to_status    TEXT          NOT NULL,
      changed_by   TEXT          NOT NULL,
      reason       TEXT,
      created_at   TIMESTAMPTZ   NOT NULL DEFAULT now()
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS milestone_status_history_milestone_id_idx
      ON milestone_status_history (milestone_id, created_at);
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS milestone_status_history_escrow_id_idx
      ON milestone_status_history (escrow_id, created_at);
  `);
}

export async function down(prisma) {
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS milestone_status_history;`);
}
