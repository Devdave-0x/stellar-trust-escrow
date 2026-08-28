/**
 * Performance regression test — GET /api/v1/escrows (escrowController.listEscrows)
 *
 * Seeds 10,000 escrows into a mocked Prisma layer and measures p95 latency of
 * repeated calls to the real list-escrows controller, gating on:
 *   - an absolute ceiling (p95 < baselines.escrowList.maxP95Ms)
 *   - a regression ceiling vs. the recorded baseline (no more than
 *     maxRegressionPct above baselines.escrowList.p95Ms)
 *
 * Scope note: this runs entirely in-process against an in-memory dataset (no
 * real Postgres), so it guards the controller/pagination/serialization layer
 * cheaply on every `npm test` run — it will not catch a missing SQL index or a
 * bad query plan against a real database. It runs as part of the standard
 * backend test suite, so it already executes in CI on every PR (including any
 * touching EscrowService, escrowController, or escrow migrations).
 */

import { jest } from '@jest/globals';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { performance } from 'perf_hooks';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED_COUNT = 10000;
const SAMPLE_CALLS = 30;

function makeAddress(prefix, index) {
  return `G${prefix}${String(index).padStart(54, '0')}`;
}

function seedEscrows(count) {
  const escrows = new Array(count);
  for (let i = 0; i < count; i += 1) {
    escrows[i] = {
      id: BigInt(i + 1),
      clientAddress: makeAddress('C', i),
      freelancerAddress: makeAddress('F', i),
      status: ['Active', 'Completed', 'Disputed', 'Cancelled'][i % 4],
      totalAmount: String(1000 + i),
      remainingBalance: String(1000 + i),
      deadline: null,
      deletedAt: null,
      createdAt: new Date(Date.now() - i * 60_000),
    };
  }
  return escrows;
}

const seededEscrows = seedEscrows(SEED_COUNT);

const prismaMock = {
  escrow: {
    findMany: jest.fn(async ({ where, take } = {}) => {
      const matches =
        where?.deletedAt === null
          ? seededEscrows.filter((e) => e.deletedAt === null)
          : seededEscrows;
      const sorted = [...matches].sort((a, b) => b.createdAt - a.createdAt);
      return sorted.slice(0, take ?? 20);
    }),
  },
};

jest.unstable_mockModule('../../lib/prisma.js', () => ({ default: prismaMock }));
jest.unstable_mockModule('../../lib/cache.js', () => ({
  default: {
    get: jest.fn(),
    set: jest.fn(),
    invalidateTags: jest.fn(),
    invalidatePrefix: jest.fn(),
  },
}));
jest.unstable_mockModule('../../services/escrowArchiveService.js', () => ({
  listArchiveTables: jest.fn().mockResolvedValue([]),
}));
jest.unstable_mockModule('../../services/stellarService.js', () => ({
  submitTransaction: jest.fn(),
  getContractEvents: jest.fn(),
  getLatestLedger: jest.fn(),
}));
jest.unstable_mockModule('@stellar/stellar-sdk', () => ({
  xdr: { ScVal: { fromXDR: jest.fn() } },
  scValToNative: jest.fn(),
}));

const { default: escrowController } = await import('../../api/controllers/escrowController.js');

function createRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

function percentile(sortedSamples, p) {
  const index = Math.min(sortedSamples.length - 1, Math.ceil((p / 100) * sortedSamples.length) - 1);
  return sortedSamples[Math.max(0, index)];
}

describe('GET /api/v1/escrows — p95 latency regression gate', () => {
  it(`stays within baseline over ${SAMPLE_CALLS} calls against ${SEED_COUNT} seeded escrows`, async () => {
    const baselines = JSON.parse(await readFile(path.join(__dirname, 'baselines.json'), 'utf8'));
    const { p95Ms: baselineP95, maxP95Ms, maxRegressionPct } = baselines.escrowList;

    const samples = [];
    for (let i = 0; i < SAMPLE_CALLS; i += 1) {
      const req = { query: {} };
      const res = createRes();

      const start = performance.now();
      await escrowController.listEscrows(req, res);
      samples.push(performance.now() - start);

      expect(res.statusCode).toBe(200);
      expect(res.body.data).toHaveLength(20);
    }

    samples.sort((a, b) => a - b);
    const p95 = percentile(samples, 95);
    const regressionCeiling = baselineP95 * (1 + maxRegressionPct / 100);

    expect(p95).toBeLessThan(maxP95Ms);
    expect(p95).toBeLessThanOrEqual(regressionCeiling);
  });
});
