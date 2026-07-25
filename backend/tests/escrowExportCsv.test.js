import { jest } from '@jest/globals';
import { PassThrough } from 'stream';

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

const CLIENT = 'GCLIENT0000000000000000000000000000000000000000000000000';
const FREELANCER = 'GFREELANCER00000000000000000000000000000000000000000000';

/** A writable stream standing in for `res`, with the headers/status API the controller uses. */
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

function parseCsv(text) {
  const lines = text.trim().split('\n');
  const header = lines[0].split(',');
  const rows = lines.slice(1).map((line) => line.split(','));
  return { header, rows };
}

beforeEach(() => {
  // resetAllMocks (not clearAllMocks) so queued mockResolvedValueOnce values
  // from a prior test — e.g. a never-consumed second "page" — don't leak in.
  jest.resetAllMocks();
});

describe('escrowController.exportEscrowsCsv', () => {
  it('requires authentication', async () => {
    const req = { user: null, query: {} };
    const res = createStreamRes();

    await escrowController.exportEscrowsCsv(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('sets the correct headers', async () => {
    prismaMock.escrow.findMany.mockResolvedValueOnce([]);

    const req = { user: { address: CLIENT }, query: {} };
    const res = createStreamRes();

    await escrowController.exportEscrowsCsv(req, res);
    await res.getBody();

    expect(res.headers['content-type']).toBe('text/csv');
    expect(res.headers['content-disposition']).toMatch(
      /^attachment; filename="escrows-\d{4}-\d{2}-\d{2}\.csv"$/,
    );
  });

  it('returns header-only row for an empty result', async () => {
    prismaMock.escrow.findMany.mockResolvedValueOnce([]);

    const req = { user: { address: CLIENT }, query: {} };
    const res = createStreamRes();

    await escrowController.exportEscrowsCsv(req, res);
    const body = await res.getBody();

    const { header, rows } = parseCsv(body);
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
    expect(rows).toEqual([]);
  });

  it('emits correct row content, deriving counterparty from the caller role', async () => {
    // A single-row batch is under CSV_EXPORT_BATCH_SIZE, so the export loop
    // stops after this one call — no second mock needed.
    prismaMock.escrow.findMany.mockResolvedValueOnce([
      {
        id: 1n,
        briefHash: 'QmBrief1',
        totalAmount: '1000',
        tokenAddress: 'CTOKEN123',
        status: 'Completed',
        clientAddress: CLIENT,
        freelancerAddress: FREELANCER,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-05T00:00:00Z'),
      },
    ]);

    const req = { user: { address: CLIENT }, query: {} };
    const res = createStreamRes();

    await escrowController.exportEscrowsCsv(req, res);
    const body = await res.getBody();
    const { rows } = parseCsv(body);

    expect(rows).toHaveLength(1);
    const [id, title, amount, currency, status, counterparty, createdAt, completedAt] = rows[0];
    expect(id).toBe('1');
    expect(title).toBe('QmBrief1');
    expect(amount).toBe('1000');
    expect(currency).toBe('CTOKEN123');
    expect(status).toBe('Completed');
    expect(counterparty).toBe(FREELANCER);
    expect(createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(completedAt).toBe('2026-01-05T00:00:00.000Z');
  });

  it('leaves completed_at blank for escrows that are not Completed', async () => {
    prismaMock.escrow.findMany.mockResolvedValueOnce([
      {
        id: 2n,
        briefHash: 'QmBrief2',
        totalAmount: '500',
        tokenAddress: 'CTOKEN456',
        status: 'Active',
        clientAddress: CLIENT,
        freelancerAddress: FREELANCER,
        createdAt: new Date('2026-02-01T00:00:00Z'),
        updatedAt: new Date('2026-02-02T00:00:00Z'),
      },
    ]);

    const req = { user: { address: CLIENT }, query: {} };
    const res = createStreamRes();

    await escrowController.exportEscrowsCsv(req, res);
    const body = await res.getBody();
    const { rows } = parseCsv(body);

    expect(rows[0][rows[0].length - 1]).toBe('');
  });

  it('applies the from/to date filters to the query', async () => {
    prismaMock.escrow.findMany.mockResolvedValueOnce([]);

    const req = {
      user: { address: CLIENT },
      query: { from: '2026-01-01', to: '2026-01-31' },
    };
    const res = createStreamRes();

    await escrowController.exportEscrowsCsv(req, res);
    await res.getBody();

    expect(prismaMock.escrow.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: {
            gte: new Date('2026-01-01'),
            lte: expect.any(Date),
          },
        }),
      }),
    );
  });

  it('rejects an invalid date filter', async () => {
    const req = { user: { address: CLIENT }, query: { from: 'not-a-date' } };
    const res = createStreamRes();

    await escrowController.exportEscrowsCsv(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(prismaMock.escrow.findMany).not.toHaveBeenCalled();
  });

  it('streams in batches without buffering the whole result set at once', async () => {
    // A full-size batch (500 rows) forces a second fetch; the loop stops once a
    // short/empty batch comes back — confirms rows are paged rather than loaded
    // in a single unbounded query.
    const FULL_BATCH = 500;
    const batch1 = Array.from({ length: FULL_BATCH }, (_, i) => ({
      id: BigInt(i + 1),
      briefHash: `brief-${i}`,
      totalAmount: '10',
      tokenAddress: 'TOKEN',
      status: 'Active',
      clientAddress: CLIENT,
      freelancerAddress: FREELANCER,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    }));

    prismaMock.escrow.findMany
      .mockResolvedValueOnce(batch1) // full page — triggers a second fetch
      .mockResolvedValueOnce([]); // empty — loop stops

    const req = { user: { address: CLIENT }, query: {} };
    const res = createStreamRes();

    await escrowController.exportEscrowsCsv(req, res);
    const body = await res.getBody();

    expect(prismaMock.escrow.findMany).toHaveBeenCalledTimes(2);
    // second call continues from the last row's cursor, not from the top
    expect(prismaMock.escrow.findMany.mock.calls[1][0].where).toEqual(
      expect.objectContaining({ id: { gt: BigInt(FULL_BATCH) } }),
    );
    const { rows } = parseCsv(body);
    expect(rows).toHaveLength(FULL_BATCH);
  });
});
