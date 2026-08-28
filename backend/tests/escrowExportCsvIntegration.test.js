/**
 * escrowExportCsvIntegration.test.js
 *
 * Issue #2 — Integration test for GET /api/v1/escrows/export.csv
 *
 * Seeds 3 escrows via the Prisma mock, invokes the controller directly
 * (matching the pattern in escrowExportCsv.test.js), parses the resulting
 * CSV, and asserts all 3 rows are present with correct data.
 *
 * Three escrow scenarios:
 *   1. Completed escrow — caller is client  → counterparty is freelancer, completed_at set
 *   2. Active escrow    — caller is client  → counterparty is freelancer, completed_at empty
 *   3. Disputed escrow  — caller is freelancer → counterparty is client, completed_at empty
 */

import { jest } from '@jest/globals';
import { PassThrough } from 'stream';

// ── Mock all heavy dependencies before importing the controller ───────────────

const prismaMock = {
  escrow: { findMany: jest.fn() },
};

jest.unstable_mockModule('../lib/prisma.js', () => ({ default: prismaMock }));
jest.unstable_mockModule('../lib/cache.js', () => ({
  default: {
    get: jest.fn(),
    set: jest.fn(),
    invalidateTags: jest.fn(),
    analytics: jest.fn(() => ({})),
  },
}));
jest.unstable_mockModule('../services/stellarService.js', () => ({
  submitTransaction: jest.fn(),
  getContractEvents: jest.fn(),
  getLatestLedger: jest.fn(),
}));
jest.unstable_mockModule('@stellar/stellar-sdk', () => ({
  xdr: { ScVal: { fromXDR: jest.fn() } },
  scValToNative: jest.fn(),
  SorobanRpc: {},
  Transaction: jest.fn(),
  Networks: { TESTNET: 'test', PUBLIC: 'public' },
}));

const { default: escrowController } = await import('../api/controllers/escrowController.js');

// ── Constants ─────────────────────────────────────────────────────────────────

const CLIENT     = 'GCLIENT0000000000000000000000000000000000000000000000001';
const FREELANCER = 'GFREELANCER00000000000000000000000000000000000000000000002';
const TOKEN_ADDR = 'CUSDC_TOKEN_ADDRESS_000000000000000000000000000000000000001';

/**
 * The three seeded escrow records.
 * All have id as BigInt to match the schema's BigInt primary key.
 */
const SEEDED_ESCROWS = [
  {
    id: 101n,
    briefHash: 'QmCompletedBrief',
    totalAmount: '5000',
    tokenAddress: TOKEN_ADDR,
    status: 'Completed',
    clientAddress: CLIENT,
    freelancerAddress: FREELANCER,
    createdAt: new Date('2026-01-10T08:00:00.000Z'),
    updatedAt: new Date('2026-02-01T15:30:00.000Z'),
  },
  {
    id: 102n,
    briefHash: 'QmActiveBrief',
    totalAmount: '2500',
    tokenAddress: TOKEN_ADDR,
    status: 'Active',
    clientAddress: CLIENT,
    freelancerAddress: FREELANCER,
    createdAt: new Date('2026-03-05T10:00:00.000Z'),
    updatedAt: new Date('2026-03-05T10:00:00.000Z'),
  },
  {
    id: 103n,
    briefHash: 'QmDisputedBrief',
    totalAmount: '1800',
    tokenAddress: TOKEN_ADDR,
    status: 'Disputed',
    clientAddress: CLIENT,
    freelancerAddress: FREELANCER,
    createdAt: new Date('2026-04-12T09:00:00.000Z'),
    updatedAt: new Date('2026-04-20T14:00:00.000Z'),
  },
];

// ── Test helpers ──────────────────────────────────────────────────────────────

/**
 * Creates a mock response object that acts as a writable stream and
 * captures all streamed CSV output.
 */
function createStreamRes() {
  const stream = new PassThrough();
  stream.headers = {};
  stream.setHeader = (name, value) => {
    stream.headers[name.toLowerCase()] = value;
  };
  stream.status = jest.fn().mockReturnValue(stream);
  stream.json = jest.fn();
  stream.headersSent = false;

  let chunks = '';
  stream.on('data', (chunk) => {
    chunks += chunk.toString();
  });
  stream.getBody = () =>
    new Promise((resolve) => {
      if (stream.writableEnded || stream.readableEnded) return resolve(chunks);
      stream.on('end', () => resolve(chunks));
    });

  return stream;
}

/**
 * Minimal CSV parser that handles the simple (unquoted) fields produced by
 * the escrow export controller for these test fixtures.
 */
function parseCsv(text) {
  const lines = text.trim().split('\n');
  const header = lines[0].split(',');
  const rows = lines.slice(1).filter((l) => l.trim()).map((line) => line.split(','));
  return { header, rows };
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

beforeEach(() => {
  jest.resetAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// Integration: 3-escrow export (caller = CLIENT)
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/v1/escrows/export.csv — 3-escrow integration test', () => {
  /**
   * Seed the mock so it returns all 3 escrows in one batch (< 500 rows).
   * The export loop stops at the first batch that's shorter than the page size.
   */
  function seedEscrows() {
    prismaMock.escrow.findMany.mockResolvedValueOnce(SEEDED_ESCROWS);
  }

  it('produces exactly 3 data rows when 3 escrows are seeded', async () => {
    seedEscrows();

    const req = { user: { address: CLIENT }, query: {} };
    const res = createStreamRes();

    await escrowController.exportEscrowsCsv(req, res);
    const body = await res.getBody();

    const { rows } = parseCsv(body);
    expect(rows).toHaveLength(3);
  });

  it('header row contains all 8 expected columns', async () => {
    seedEscrows();

    const req = { user: { address: CLIENT }, query: {} };
    const res = createStreamRes();

    await escrowController.exportEscrowsCsv(req, res);
    const body = await res.getBody();

    const { header } = parseCsv(body);
    expect(header).toEqual([
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

  it('row 1 — Completed escrow has correct data and completed_at set', async () => {
    seedEscrows();

    const req = { user: { address: CLIENT }, query: {} };
    const res = createStreamRes();

    await escrowController.exportEscrowsCsv(req, res);
    const body = await res.getBody();
    const { rows } = parseCsv(body);

    const [id, title, amount, currency, status, counterparty, createdAt, completedAt] = rows[0];

    expect(id).toBe('101');
    expect(title).toBe('QmCompletedBrief');
    expect(amount).toBe('5000');
    expect(currency).toBe(TOKEN_ADDR);
    expect(status).toBe('Completed');
    // Caller is CLIENT so counterparty should be FREELANCER
    expect(counterparty).toBe(FREELANCER);
    expect(createdAt).toBe('2026-01-10T08:00:00.000Z');
    // Completed escrow: completed_at = updatedAt
    expect(completedAt).toBe('2026-02-01T15:30:00.000Z');
  });

  it('row 2 — Active escrow has correct data and empty completed_at', async () => {
    seedEscrows();

    const req = { user: { address: CLIENT }, query: {} };
    const res = createStreamRes();

    await escrowController.exportEscrowsCsv(req, res);
    const body = await res.getBody();
    const { rows } = parseCsv(body);

    const [id, title, amount, currency, status, counterparty, createdAt, completedAt] = rows[1];

    expect(id).toBe('102');
    expect(title).toBe('QmActiveBrief');
    expect(amount).toBe('2500');
    expect(currency).toBe(TOKEN_ADDR);
    expect(status).toBe('Active');
    expect(counterparty).toBe(FREELANCER);
    expect(createdAt).toBe('2026-03-05T10:00:00.000Z');
    // Active escrow: completed_at must be empty
    expect(completedAt).toBe('');
  });

  it('row 3 — Disputed escrow has correct data and empty completed_at', async () => {
    seedEscrows();

    const req = { user: { address: CLIENT }, query: {} };
    const res = createStreamRes();

    await escrowController.exportEscrowsCsv(req, res);
    const body = await res.getBody();
    const { rows } = parseCsv(body);

    const [id, title, amount, currency, status, counterparty, createdAt, completedAt] = rows[2];

    expect(id).toBe('103');
    expect(title).toBe('QmDisputedBrief');
    expect(amount).toBe('1800');
    expect(currency).toBe(TOKEN_ADDR);
    expect(status).toBe('Disputed');
    expect(counterparty).toBe(FREELANCER);
    expect(createdAt).toBe('2026-04-12T09:00:00.000Z');
    // Disputed escrow: completed_at must be empty
    expect(completedAt).toBe('');
  });

  it('each of the 3 rows has exactly 8 columns', async () => {
    seedEscrows();

    const req = { user: { address: CLIENT }, query: {} };
    const res = createStreamRes();

    await escrowController.exportEscrowsCsv(req, res);
    const body = await res.getBody();
    const { rows } = parseCsv(body);

    rows.forEach((row, i) => {
      expect(row).toHaveLength(8);
    });
  });

  it('sets Content-Type: text/csv header', async () => {
    seedEscrows();

    const req = { user: { address: CLIENT }, query: {} };
    const res = createStreamRes();

    await escrowController.exportEscrowsCsv(req, res);
    await res.getBody();

    expect(res.headers['content-type']).toBe('text/csv');
  });

  it('sets Content-Disposition attachment header with dated filename', async () => {
    seedEscrows();

    const req = { user: { address: CLIENT }, query: {} };
    const res = createStreamRes();

    await escrowController.exportEscrowsCsv(req, res);
    await res.getBody();

    expect(res.headers['content-disposition']).toMatch(
      /^attachment; filename="escrows-\d{4}-\d{2}-\d{2}\.csv"$/,
    );
  });

  it('all 3 escrow IDs are present in the export', async () => {
    seedEscrows();

    const req = { user: { address: CLIENT }, query: {} };
    const res = createStreamRes();

    await escrowController.exportEscrowsCsv(req, res);
    const body = await res.getBody();
    const { rows } = parseCsv(body);

    const exportedIds = rows.map((r) => r[0]);
    expect(exportedIds).toContain('101');
    expect(exportedIds).toContain('102');
    expect(exportedIds).toContain('103');
  });

  it('queries Prisma with the caller address as the user filter', async () => {
    seedEscrows();

    const req = { user: { address: CLIENT }, query: {} };
    const res = createStreamRes();

    await escrowController.exportEscrowsCsv(req, res);
    await res.getBody();

    expect(prismaMock.escrow.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ clientAddress: CLIENT }, { freelancerAddress: CLIENT }],
        }),
      }),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Integration: caller is FREELANCER — counterparty perspective
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/v1/escrows/export.csv — counterparty as freelancer perspective', () => {
  it('counterparty column shows CLIENT when caller is FREELANCER', async () => {
    prismaMock.escrow.findMany.mockResolvedValueOnce([SEEDED_ESCROWS[0]]);

    const req = { user: { address: FREELANCER }, query: {} };
    const res = createStreamRes();

    await escrowController.exportEscrowsCsv(req, res);
    const body = await res.getBody();
    const { rows } = parseCsv(body);

    // counterparty column is index 5
    expect(rows[0][5]).toBe(CLIENT);
  });
});
