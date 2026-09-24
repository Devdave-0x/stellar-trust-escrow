// The factory runs before this file's top-level code (jest.mock is hoisted
// above the imports), so the fake database is created inside it.
jest.mock('expo-sqlite', () => {
  const db = {
    execSync: jest.fn(),
    runSync: jest.fn(),
    getFirstSync: jest.fn(),
    getAllSync: jest.fn(),
  };
  return { openDatabaseSync: () => db, __db: db };
});

import {
  CACHE_SCHEMA_VERSION,
  cacheEscrow,
  cacheMilestones,
  getCachedEscrow,
  getCachedEscrowEntry,
  getCachedEscrows,
  initOfflineDb,
  migrateRecord,
  type CacheMigrations,
} from '../services/offlineCache';

const mockDb: {
  execSync: jest.Mock;
  runSync: jest.Mock;
  getFirstSync: jest.Mock;
  getAllSync: jest.Mock;
} = jest.requireMock('expo-sqlite').__db;

const fresh = () => Date.now();

function row(id: string | number, payload: unknown, schemaVersion: number, cachedAt = fresh()) {
  return {
    id,
    data: typeof payload === 'string' ? payload : JSON.stringify(payload),
    cached_at: cachedAt,
    schema_version: schemaVersion,
  };
}

function deletedIds(): unknown[] {
  return mockDb.runSync.mock.calls
    .filter(([sql]) => /^DELETE FROM \w+ WHERE id = \?$/.test(sql))
    .map(([, params]) => params[0]);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('migrateRecord', () => {
  const migrations: CacheMigrations = {
    escrow: {
      1: (p) => ({ ...p, amount: String(p.amountStroops) }),
      2: (p) => ({ ...p, v3: true }),
    },
    milestone: {},
  };

  it('returns a current-version payload unchanged', () => {
    const payload = { id: 'e1' };
    expect(migrateRecord('escrow', 3, payload, migrations, 3)).toBe(payload);
  });

  it('runs every step of the chain for an older record', () => {
    expect(migrateRecord('escrow', 1, { id: 'e1', amountStroops: 5 }, migrations, 3)).toEqual({
      id: 'e1',
      amountStroops: 5,
      amount: '5',
      v3: true,
    });
  });

  it('starts the chain at the record version', () => {
    expect(migrateRecord('escrow', 2, { id: 'e1' }, migrations, 3)).toEqual({ id: 'e1', v3: true });
  });

  it('rejects a record when a migration step is missing', () => {
    expect(migrateRecord('milestone', 1, { id: 1 }, migrations, 3)).toBeNull();
  });

  it('rejects a record written by a newer app build', () => {
    expect(migrateRecord('escrow', 4, { id: 'e1' }, migrations, 3)).toBeNull();
  });

  it('rejects an invalid version', () => {
    expect(migrateRecord('escrow', 0, { id: 'e1' }, migrations, 3)).toBeNull();
    expect(migrateRecord('escrow', Number.NaN, { id: 'e1' }, migrations, 3)).toBeNull();
  });
});

describe('initOfflineDb', () => {
  it('adds schema_version to tables created before versioning', () => {
    mockDb.getAllSync.mockReturnValue([{ name: 'id' }, { name: 'data' }, { name: 'cached_at' }]);

    initOfflineDb();

    const alters = mockDb.execSync.mock.calls
      .map(([sql]) => sql)
      .filter((sql) => sql.startsWith('ALTER'));
    expect(alters).toEqual([
      'ALTER TABLE escrows ADD COLUMN schema_version INTEGER NOT NULL DEFAULT 1',
      'ALTER TABLE milestones ADD COLUMN schema_version INTEGER NOT NULL DEFAULT 1',
    ]);
  });

  it('leaves tables that already have schema_version alone', () => {
    mockDb.getAllSync.mockReturnValue([{ name: 'id' }, { name: 'schema_version' }]);

    initOfflineDb();

    expect(mockDb.execSync.mock.calls.some(([sql]) => sql.startsWith('ALTER'))).toBe(false);
  });
});

describe('cache writes', () => {
  it('stamps escrows with the current schema version', () => {
    cacheEscrow({ id: 'e1', status: 'Active' });

    const [sql, params] = mockDb.runSync.mock.calls[0];
    expect(sql).toContain('schema_version');
    expect(params).toEqual([
      'e1',
      JSON.stringify({ id: 'e1', status: 'Active' }),
      expect.any(Number),
      CACHE_SCHEMA_VERSION,
    ]);
  });

  it('stamps milestones with the current schema version', () => {
    cacheMilestones('e1', [{ id: 7, title: 'Design' }]);

    const insert = mockDb.runSync.mock.calls.find(([sql]) => sql.startsWith('INSERT'));
    expect(insert?.[1]).toEqual([
      7,
      'e1',
      JSON.stringify({ id: 7, title: 'Design' }),
      expect.any(Number),
      CACHE_SCHEMA_VERSION,
    ]);
  });
});

describe('cache reads', () => {
  it('returns a record written before versioning (backfilled as version 1)', () => {
    mockDb.getFirstSync.mockReturnValue(row('e1', { id: 'e1', status: 'Active' }, 1));

    expect(getCachedEscrow('e1')).toEqual({ id: 'e1', status: 'Active' });
    expect(deletedIds()).toEqual([]);
  });

  it('discards and deletes a record written by a newer app build', () => {
    mockDb.getFirstSync.mockReturnValue(row('e1', { id: 'e1' }, CACHE_SCHEMA_VERSION + 1));

    expect(getCachedEscrow('e1')).toBeNull();
    expect(deletedIds()).toEqual(['e1']);
  });

  it('discards and deletes a corrupted record', () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockDb.getFirstSync.mockReturnValue(row('e1', '{not json', CACHE_SCHEMA_VERSION));

    expect(getCachedEscrow('e1')).toBeNull();
    expect(deletedIds()).toEqual(['e1']);
  });

  it('discards and deletes an expired record without decoding it', () => {
    mockDb.getFirstSync.mockReturnValue(row('e1', { id: 'e1' }, CACHE_SCHEMA_VERSION, 0));

    expect(getCachedEscrow('e1')).toBeNull();
    expect(deletedIds()).toEqual(['e1']);
  });

  it('returns the cache time alongside the record for staleness display', () => {
    const cachedAt = fresh() - 60_000;
    mockDb.getFirstSync.mockReturnValue(row('e1', { id: 'e1' }, CACHE_SCHEMA_VERSION, cachedAt));

    expect(getCachedEscrowEntry('e1')).toEqual({ record: { id: 'e1' }, cachedAt });
  });

  it('returns no entry for a record that cannot be used', () => {
    mockDb.getFirstSync.mockReturnValue(row('e1', { id: 'e1' }, CACHE_SCHEMA_VERSION + 1));

    expect(getCachedEscrowEntry('e1')).toBeNull();
  });

  it('keeps usable records and drops unusable ones in a list read', () => {
    mockDb.getAllSync.mockReturnValue([
      row('e1', { id: 'e1' }, CACHE_SCHEMA_VERSION),
      row('e2', { id: 'e2' }, CACHE_SCHEMA_VERSION + 1),
      row('e3', { id: 'e3' }, 1),
    ]);

    expect(getCachedEscrows()).toEqual([{ id: 'e1' }, { id: 'e3' }]);
    expect(deletedIds()).toEqual(['e2']);
  });
});
