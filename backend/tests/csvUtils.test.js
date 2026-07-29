/**
 * csvUtils.test.js — Unit tests for the CSV export utility (Issue #2)
 *
 * Covers:
 *   - CSV_EXPORT_COLUMNS: correct headers in first row
 *   - serializeEscrowsToCsv: correct number of columns per row
 *   - Special characters (commas, quotes, newlines) in field values are escaped
 *   - Empty dataset produces headers-only CSV
 *   - buildEscrowCsvRow: counterparty derivation, completed_at logic, BigInt id
 */

import { describe, it, expect } from '@jest/globals';
import {
  CSV_EXPORT_COLUMNS,
  buildEscrowCsvRow,
  serializeEscrowsToCsv,
} from '../lib/csvUtils.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const CLIENT = 'GCLIENT0000000000000000000000000000000000000000000000000001';
const FREELANCER = 'GFREELANCER00000000000000000000000000000000000000000000002';

function makeEscrow(overrides = {}) {
  return {
    id: 1n,
    briefHash: 'QmBrief1',
    totalAmount: '1000',
    tokenAddress: 'CTOKEN123',
    status: 'Active',
    clientAddress: CLIENT,
    freelancerAddress: FREELANCER,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-05T00:00:00.000Z'),
    ...overrides,
  };
}

/**
 * Parse a raw CSV string into { header: string[], rows: string[][] }.
 * Handles RFC 4180 quoting: quoted fields with internal commas/newlines/quotes.
 */
function parseCsvFull(text) {
  // Split into lines but respect quoted newlines
  const lines = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      // doubled quote inside a quoted field → literal quote
      if (inQuotes && text[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === '\n' && !inQuotes) {
      if (current.trim() !== '' || lines.length === 0) {
        lines.push(current);
        current = '';
      }
    } else if (ch === '\r' && !inQuotes) {
      // skip \r in \r\n
    } else {
      current += ch;
    }
  }
  if (current.trim()) lines.push(current);

  function parseRow(line) {
    const fields = [];
    let field = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQ = !inQ;
        }
      } else if (ch === ',' && !inQ) {
        fields.push(field);
        field = '';
      } else {
        field += ch;
      }
    }
    fields.push(field);
    return fields;
  }

  const header = parseRow(lines[0]);
  const rows = lines.slice(1).filter(l => l.trim()).map(parseRow);
  return { header, rows };
}

// ── CSV_EXPORT_COLUMNS ────────────────────────────────────────────────────────

describe('CSV_EXPORT_COLUMNS', () => {
  it('exports an array', () => {
    expect(Array.isArray(CSV_EXPORT_COLUMNS)).toBe(true);
  });

  it('contains exactly 8 columns', () => {
    expect(CSV_EXPORT_COLUMNS).toHaveLength(8);
  });

  it('contains all required column names', () => {
    expect(CSV_EXPORT_COLUMNS).toContain('id');
    expect(CSV_EXPORT_COLUMNS).toContain('title');
    expect(CSV_EXPORT_COLUMNS).toContain('amount');
    expect(CSV_EXPORT_COLUMNS).toContain('currency');
    expect(CSV_EXPORT_COLUMNS).toContain('status');
    expect(CSV_EXPORT_COLUMNS).toContain('counterparty');
    expect(CSV_EXPORT_COLUMNS).toContain('created_at');
    expect(CSV_EXPORT_COLUMNS).toContain('completed_at');
  });

  it('has the correct column order', () => {
    expect(CSV_EXPORT_COLUMNS).toEqual([
      'id',
      'title',
      'amount',
      'currency',
      'status',
      'counterparty',
      'created_at',
      'completed_at',
    ]);
  });
});

// ── serializeEscrowsToCsv — empty dataset ─────────────────────────────────────

describe('serializeEscrowsToCsv — empty dataset', () => {
  it('produces a non-empty string when given an empty rows array', () => {
    const csv = serializeEscrowsToCsv([]);
    expect(typeof csv).toBe('string');
    expect(csv.length).toBeGreaterThan(0);
  });

  it('contains only the header row when rows is empty', () => {
    const csv = serializeEscrowsToCsv([]);
    const { header, rows } = parseCsvFull(csv);
    expect(rows).toHaveLength(0);
    expect(header).toEqual(CSV_EXPORT_COLUMNS);
  });

  it('first row of empty-dataset CSV matches CSV_EXPORT_COLUMNS exactly', () => {
    const csv = serializeEscrowsToCsv([]);
    const firstLine = csv.split('\n')[0];
    expect(firstLine).toBe(CSV_EXPORT_COLUMNS.join(','));
  });
});

// ── serializeEscrowsToCsv — correct headers ───────────────────────────────────

describe('serializeEscrowsToCsv — header row', () => {
  it('first row is the header regardless of the number of data rows', () => {
    const row = buildEscrowCsvRow(makeEscrow(), CLIENT);
    const csv = serializeEscrowsToCsv([row]);
    const { header } = parseCsvFull(csv);
    expect(header).toEqual(CSV_EXPORT_COLUMNS);
  });

  it('header columns are comma-separated without quotes when no special chars', () => {
    const csv = serializeEscrowsToCsv([]);
    const headerLine = csv.split('\n')[0];
    expect(headerLine).toBe('id,title,amount,currency,status,counterparty,created_at,completed_at');
  });
});

// ── serializeEscrowsToCsv — correct number of columns per row ─────────────────

describe('serializeEscrowsToCsv — column count', () => {
  it('each data row has exactly 8 columns', () => {
    const rows = [
      buildEscrowCsvRow(makeEscrow({ id: 1n }), CLIENT),
      buildEscrowCsvRow(makeEscrow({ id: 2n }), CLIENT),
    ];
    const csv = serializeEscrowsToCsv(rows);
    const { header, rows: dataRows } = parseCsvFull(csv);
    expect(header).toHaveLength(8);
    dataRows.forEach((row) => {
      expect(row).toHaveLength(8);
    });
  });

  it('produces exactly N data rows for N input rows', () => {
    const rows = Array.from({ length: 5 }, (_, i) =>
      buildEscrowCsvRow(makeEscrow({ id: BigInt(i + 1) }), CLIENT),
    );
    const csv = serializeEscrowsToCsv(rows);
    const { rows: dataRows } = parseCsvFull(csv);
    expect(dataRows).toHaveLength(5);
  });
});

// ── Special characters — commas in field values ───────────────────────────────

describe('serializeEscrowsToCsv — special characters', () => {
  it('a comma in briefHash is quoted and does not split the field', () => {
    const escrow = makeEscrow({ briefHash: 'Phase 1, Phase 2' });
    const row = buildEscrowCsvRow(escrow, CLIENT);
    const csv = serializeEscrowsToCsv([row]);
    const { rows } = parseCsvFull(csv);
    expect(rows[0][1]).toBe('Phase 1, Phase 2');
  });

  it('a double-quote in briefHash is escaped as two consecutive double-quotes', () => {
    const escrow = makeEscrow({ briefHash: 'She said "hello"' });
    const row = buildEscrowCsvRow(escrow, CLIENT);
    const csv = serializeEscrowsToCsv([row]);
    // Raw CSV should contain doubled-quote escaping
    expect(csv).toContain('"She said ""hello"""');
    const { rows } = parseCsvFull(csv);
    expect(rows[0][1]).toBe('She said "hello"');
  });

  it('a newline inside a field value is kept within a quoted field', () => {
    const escrow = makeEscrow({ briefHash: 'Line1\nLine2' });
    const row = buildEscrowCsvRow(escrow, CLIENT);
    const csv = serializeEscrowsToCsv([row]);
    const { rows } = parseCsvFull(csv);
    expect(rows[0][1]).toBe('Line1\nLine2');
  });

  it('a field with comma, quote, and newline is correctly round-tripped', () => {
    const tricky = 'He said "stop, go\nnow"';
    const escrow = makeEscrow({ briefHash: tricky });
    const row = buildEscrowCsvRow(escrow, CLIENT);
    const csv = serializeEscrowsToCsv([row]);
    const { rows } = parseCsvFull(csv);
    expect(rows[0][1]).toBe(tricky);
  });

  it('unicode characters in field values are preserved', () => {
    const escrow = makeEscrow({ briefHash: '日本語テスト 🚀' });
    const row = buildEscrowCsvRow(escrow, CLIENT);
    const csv = serializeEscrowsToCsv([row]);
    const { rows } = parseCsvFull(csv);
    expect(rows[0][1]).toBe('日本語テスト 🚀');
  });

  it('field containing only whitespace is preserved', () => {
    const escrow = makeEscrow({ briefHash: '   ' });
    const row = buildEscrowCsvRow(escrow, CLIENT);
    const csv = serializeEscrowsToCsv([row]);
    const { rows } = parseCsvFull(csv);
    expect(rows[0][1]).toBe('   ');
  });
});

// ── buildEscrowCsvRow ─────────────────────────────────────────────────────────

describe('buildEscrowCsvRow', () => {
  it('converts BigInt id to string', () => {
    const row = buildEscrowCsvRow(makeEscrow({ id: 99n }), CLIENT);
    expect(row.id).toBe('99');
  });

  it('sets title to briefHash', () => {
    const row = buildEscrowCsvRow(makeEscrow({ briefHash: 'QmHash' }), CLIENT);
    expect(row.title).toBe('QmHash');
  });

  it('sets title to empty string when briefHash is null', () => {
    const row = buildEscrowCsvRow(makeEscrow({ briefHash: null }), CLIENT);
    expect(row.title).toBe('');
  });

  it('sets currency to tokenAddress', () => {
    const row = buildEscrowCsvRow(makeEscrow({ tokenAddress: 'CTOKEN999' }), CLIENT);
    expect(row.currency).toBe('CTOKEN999');
  });

  it('derives counterparty as freelancer when caller is client', () => {
    const row = buildEscrowCsvRow(makeEscrow(), CLIENT);
    expect(row.counterparty).toBe(FREELANCER);
  });

  it('derives counterparty as client when caller is freelancer', () => {
    const row = buildEscrowCsvRow(makeEscrow(), FREELANCER);
    expect(row.counterparty).toBe(CLIENT);
  });

  it('sets created_at to ISO string from Date', () => {
    const row = buildEscrowCsvRow(
      makeEscrow({ createdAt: new Date('2026-03-15T12:00:00.000Z') }),
      CLIENT,
    );
    expect(row.created_at).toBe('2026-03-15T12:00:00.000Z');
  });

  it('sets completed_at to updatedAt ISO string when status is Completed', () => {
    const row = buildEscrowCsvRow(
      makeEscrow({ status: 'Completed', updatedAt: new Date('2026-01-10T00:00:00.000Z') }),
      CLIENT,
    );
    expect(row.completed_at).toBe('2026-01-10T00:00:00.000Z');
  });

  it('sets completed_at to empty string when status is Active', () => {
    const row = buildEscrowCsvRow(makeEscrow({ status: 'Active' }), CLIENT);
    expect(row.completed_at).toBe('');
  });

  it('sets completed_at to empty string when status is Disputed', () => {
    const row = buildEscrowCsvRow(makeEscrow({ status: 'Disputed' }), CLIENT);
    expect(row.completed_at).toBe('');
  });

  it('sets completed_at to empty string when status is Cancelled', () => {
    const row = buildEscrowCsvRow(makeEscrow({ status: 'Cancelled' }), CLIENT);
    expect(row.completed_at).toBe('');
  });

  it('produces a row object with exactly the CSV_EXPORT_COLUMNS keys', () => {
    const row = buildEscrowCsvRow(makeEscrow(), CLIENT);
    expect(Object.keys(row).sort()).toEqual([...CSV_EXPORT_COLUMNS].sort());
  });
});
