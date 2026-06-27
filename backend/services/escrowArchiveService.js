const ARCHIVE_RETENTION_DAYS = 90;

function getArchiveTableName(date = new Date()) {
  const value = new Date(date);
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, '0');
  return `escrows_archive_${year}_${month}`;
}

function getArchiveWindow(date = new Date()) {
  const safe = new Date(date);
  safe.setUTCSeconds(0, 0);
  const start = new Date(Date.UTC(safe.getUTCFullYear(), safe.getUTCMonth(), 1, 0, 0, 0, 0));
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return { start, end, tableName: getArchiveTableName(safe) };
}

async function ensureArchivePartition(prisma, date = new Date()) {
  const { tableName, start, end } = getArchiveWindow(date);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS ${tableName} (LIKE escrows INCLUDING ALL)
  `);

  return { tableName, start, end };
}

async function archiveCompletedEscrows(
  prisma,
  olderThan = new Date(Date.now() - ARCHIVE_RETENTION_DAYS * 24 * 60 * 60 * 1000),
) {
  // Archive terminal-state escrows: Completed and Cancelled
  const rows = await prisma.escrow.findMany({
    where: {
      status: { in: ['Completed', 'Cancelled'] },
      updatedAt: { lt: olderThan },
    },
    orderBy: { createdAt: 'asc' },
    take: 500,
  });

  if (!rows.length) return { archived: 0, rows: [] };

  const archived = [];

  for (const row of rows) {
    const { tableName } = getArchiveWindow(row.createdAt);
    await ensureArchivePartition(prisma, row.createdAt);
    await prisma.$executeRawUnsafe(
      `
      INSERT INTO ${tableName} (id, tenant_id, client_address, freelancer_address, arbiter_address, token_address, total_amount, remaining_balance, status, brief_hash, deadline, created_at, updated_at, created_ledger)
      SELECT id, tenant_id, client_address, freelancer_address, arbiter_address, token_address, total_amount, remaining_balance, status, brief_hash, deadline, created_at, updated_at, created_ledger
      FROM escrows
      WHERE id = $1
      ON CONFLICT (id) DO NOTHING
    `,
      row.id,
    );
    await prisma.$executeRawUnsafe('DELETE FROM escrows WHERE id = $1', row.id);
    archived.push({ id: row.id, tableName, createdAt: row.createdAt });
  }

  return { archived: archived.length, rows: archived };
}

const ARCHIVE_TABLE_RE = /^escrows_archive_\d{4}_\d{2}$/;

async function listArchiveTables(prisma) {
  const rows = await prisma.$queryRawUnsafe(`
    SELECT tablename
    FROM pg_catalog.pg_tables
    WHERE schemaname = 'public'
      AND tablename LIKE 'escrows_archive_%'
    ORDER BY tablename ASC
  `);

  // Validate names against expected pattern before returning for use in raw SQL
  return rows.map((row) => row.tablename).filter((name) => ARCHIVE_TABLE_RE.test(name));
}

export {
  ARCHIVE_RETENTION_DAYS,
  archiveCompletedEscrows,
  ensureArchivePartition,
  getArchiveTableName,
  getArchiveWindow,
  listArchiveTables,
};

export default {
  ARCHIVE_RETENTION_DAYS,
  archiveCompletedEscrows,
  ensureArchivePartition,
  getArchiveTableName,
  getArchiveWindow,
  listArchiveTables,
};
