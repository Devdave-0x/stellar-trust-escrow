/**
 * Tests for POST /api/escrows/:id/clone.
 */

import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const ADDRESS_CLIENT = `G${'A'.repeat(55)}`;
const ADDRESS_FREELANCER = `G${'B'.repeat(55)}`;
const ADDRESS_REQUESTER = `G${'C'.repeat(55)}`;

// ── Module mock (registered once, mutated per-test) ──────────────────────────

const escrows = [];
let nextMilestoneId = 1;
let draftIdSequence = 0;

const cacheMock = {
  invalidateTags: jest.fn(),
  get: jest.fn(),
  set: jest.fn(),
};

const prismaMock = {
  escrow: {
    findUnique: jest.fn(async ({ where, include }) => {
      const record = escrows.find((e) => e.id === where.id);
      if (!record) return null;
      if (include?.milestones) {
        return {
          ...record,
          milestones: [...record.milestones].sort((a, b) => a.milestoneIndex - b.milestoneIndex),
        };
      }
      return record;
    }),
    create: jest.fn(async ({ data }) => {
      const { milestones, ...escrowData } = data;
      const record = { ...escrowData, milestones: [] };
      if (milestones?.create) {
        record.milestones = milestones.create.map((m) => ({
          id: nextMilestoneId++,
          escrowId: record.id,
          ...m,
        }));
      }
      escrows.push(record);
      return record;
    }),
  },
  $queryRawUnsafe: jest.fn(async () => [{ id: String(-(++draftIdSequence)) }]),
};

jest.unstable_mockModule('../lib/prisma.js', () => ({ default: prismaMock }));
jest.unstable_mockModule('../lib/cache.js', () => ({ default: cacheMock }));

const { default: escrowController } = await import('../api/controllers/escrowController.js');

// ── Helpers ──────────────────────────────────────────────────────────────────

function createApp() {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.user = { address: ADDRESS_REQUESTER };
    next();
  });
  app.post('/api/escrows/:id/clone', escrowController.cloneEscrow);
  return app;
}

function seedEscrow(overrides = {}) {
  const record = {
    id: BigInt(1),
    tenantId: 'tenant_default',
    clientAddress: ADDRESS_CLIENT,
    freelancerAddress: ADDRESS_FREELANCER,
    arbiterAddress: null,
    tokenAddress: 'TOKENADDR',
    totalAmount: '1000',
    remainingBalance: '400',
    status: 'Active',
    briefHash: 'Qm...',
    title: 'Website redesign',
    description: 'Redesign the marketing site',
    ownerId: ADDRESS_CLIENT,
    deadline: new Date('2026-08-01'),
    createdAt: new Date('2026-01-01'),
    createdLedger: BigInt(12345),
    metadata: { propertyType: 'condo' },
    milestones: [
      {
        tenantId: 'tenant_default',
        milestoneIndex: 0,
        title: 'Design mockups',
        descriptionHash: 'Qm-mockups',
        amount: '400',
        status: 'Approved',
        submittedAt: new Date(),
        resolvedAt: new Date(),
      },
      {
        tenantId: 'tenant_default',
        milestoneIndex: 1,
        title: 'Final build',
        descriptionHash: 'Qm-build',
        amount: '600',
        status: 'Pending',
      },
    ],
    ...overrides,
  };
  escrows.push(record);
  return record;
}

beforeEach(() => {
  escrows.length = 0;
  nextMilestoneId = 1;
  draftIdSequence = 0;
  jest.clearAllMocks();
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/escrows/:id/clone', () => {
  it('returns 404 for a non-existent escrow', async () => {
    const app = createApp();
    const res = await request(app).post('/api/escrows/999/clone').send({});
    expect(res.status).toBe(404);
  });

  it('clones title, description, milestones, and participant addresses', async () => {
    const app = createApp();
    seedEscrow();

    const res = await request(app).post('/api/escrows/1/clone').send({});

    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Website redesign (Copy)');
    expect(res.body.description).toBe('Redesign the marketing site');
    expect(res.body.clientAddress).toBe(ADDRESS_CLIENT);
    expect(res.body.freelancerAddress).toBe(ADDRESS_FREELANCER);
    expect(res.body.milestones).toHaveLength(2);
    expect(res.body.milestones[0]).toMatchObject({ title: 'Design mockups', status: 'Pending' });
    expect(res.body.milestones[1]).toMatchObject({ title: 'Final build', status: 'Pending' });
  });

  it('resets status to Draft and clears transaction data', async () => {
    const app = createApp();
    seedEscrow();

    const res = await request(app).post('/api/escrows/1/clone').send({});

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('Draft');
    expect(res.body.totalAmount).toBe('1000');
    expect(res.body.remainingBalance).toBe('1000'); // reset, not the source's partially-spent 400
  });

  it('is owned by the requesting user regardless of the original owner', async () => {
    const app = createApp();
    seedEscrow();

    const res = await request(app).post('/api/escrows/1/clone').send({});

    expect(res.status).toBe(201);
    expect(res.body.ownerId).toBe(ADDRESS_REQUESTER);
  });

  it('applies a title override verbatim (no auto "(Copy)" suffix)', async () => {
    const app = createApp();
    seedEscrow();

    const res = await request(app)
      .post('/api/escrows/1/clone')
      .send({ title: 'A brand new title' });

    expect(res.status).toBe(201);
    expect(res.body.title).toBe('A brand new title');
  });

  it('applies an amount override to totalAmount and remainingBalance', async () => {
    const app = createApp();
    seedEscrow();

    const res = await request(app).post('/api/escrows/1/clone').send({ amount: '2500' });

    expect(res.status).toBe(201);
    expect(res.body.totalAmount).toBe('2500');
    expect(res.body.remainingBalance).toBe('2500');
  });

  it('rejects a non-string/number amount override', async () => {
    const app = createApp();
    seedEscrow();

    const res = await request(app).post('/api/escrows/1/clone').send({ amount: { bad: true } });

    expect(res.status).toBe(400);
  });

  it('applies a deadline override', async () => {
    const app = createApp();
    seedEscrow();

    const res = await request(app)
      .post('/api/escrows/1/clone')
      .send({ deadline: '2027-01-01T00:00:00.000Z' });

    expect(res.status).toBe(201);
    expect(new Date(res.body.deadline).toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });
});
