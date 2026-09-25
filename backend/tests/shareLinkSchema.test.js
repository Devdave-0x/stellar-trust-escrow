import { jest } from '@jest/globals';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const prismaMock = {
  escrow: { findUnique: jest.fn() },
  escrowShareLink: { create: jest.fn(), findUnique: jest.fn() },
};

jest.unstable_mockModule('../lib/prisma.js', () => ({ default: prismaMock }));

const { sharedEscrowSchema, shareLinkCreateResponseSchema, shareLinkResolveResponseSchema } =
  await import('../../shared/schemas/shareLink.js');
const { createShareLink, resolveShareLink } =
  await import('../api/controllers/shareLinkController.js');

const CLIENT = `G${'A'.repeat(55)}`;

function createMockRes() {
  const res = {
    statusCode: 200,
    body: null,
    req: {},
    status: jest.fn().mockImplementation((code) => {
      res.statusCode = code;
      return res;
    }),
    json: jest.fn().mockImplementation((payload) => {
      res.body = payload;
      return res;
    }),
  };
  return res;
}

function resolvePayload(overrides = {}) {
  return {
    escrow: {
      id: '42',
      status: 'Active',
      totalAmount: '1000000000',
      remainingBalance: '500000000',
      deadline: null,
      createdAt: '2026-09-01T10:00:00.000Z',
      milestones: [{ id: 1, title: 'Design', amount: '500000000', status: 'Approved' }],
    },
    sharedAt: '2026-09-02T10:00:00.000Z',
    expiresAt: '2026-10-02T10:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => jest.clearAllMocks());

describe('shared share-link schemas', () => {
  it('accept a well-formed resolve response, with ISO strings or Date objects', () => {
    expect(shareLinkResolveResponseSchema.safeParse(resolvePayload()).success).toBe(true);
    const withDates = resolvePayload({ sharedAt: new Date(), expiresAt: null });
    expect(shareLinkResolveResponseSchema.safeParse(withDates).success).toBe(true);
  });

  it.each([
    ['escrow.id', (p) => delete p.escrow.id],
    ['escrow.status', (p) => delete p.escrow.status],
    ['escrow.totalAmount', (p) => delete p.escrow.totalAmount],
    ['escrow.milestones', (p) => delete p.escrow.milestones],
    ['sharedAt', (p) => delete p.sharedAt],
  ])('rejects a resolve response missing %s', (_field, mutate) => {
    const payload = resolvePayload();
    mutate(payload);
    expect(shareLinkResolveResponseSchema.safeParse(payload).success).toBe(false);
  });

  it('rejects numeric ids and amounts (they must stay BigInt-safe strings)', () => {
    const numericId = resolvePayload();
    numericId.escrow.id = 42;
    expect(shareLinkResolveResponseSchema.safeParse(numericId).success).toBe(false);

    const numericAmount = resolvePayload();
    numericAmount.escrow.totalAmount = 1000;
    expect(shareLinkResolveResponseSchema.safeParse(numericAmount).success).toBe(false);
  });

  it('rejects an unknown escrow status', () => {
    const payload = resolvePayload();
    payload.escrow.status = 'Frozen';
    expect(shareLinkResolveResponseSchema.safeParse(payload).success).toBe(false);
  });

  it('requires token, shareUrl and createdAt on the create response', () => {
    const ok = {
      token: 'abc',
      shareUrl: 'http://localhost:4000/api/share/abc',
      expiresAt: null,
      createdAt: new Date(),
    };
    expect(shareLinkCreateResponseSchema.safeParse(ok).success).toBe(true);
    for (const field of ['token', 'shareUrl', 'createdAt']) {
      const payload = { ...ok };
      delete payload[field];
      expect(shareLinkCreateResponseSchema.safeParse(payload).success).toBe(false);
    }
  });
});

describe('shared/types/shareLink.d.ts stays in sync with the schemas', () => {
  const dts = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), '../../shared/types/shareLink.d.ts'),
    'utf8',
  );

  /** Field names declared in `export interface <name> { ... }`. */
  function interfaceFields(name) {
    const body = dts.match(new RegExp(`export interface ${name} \\{([\\s\\S]*?)\\n\\}`));
    if (!body) throw new Error(`interface ${name} not found`);
    return [...body[1].matchAll(/^\s+(\w+)\??:/gm)].map((m) => m[1]).sort();
  }

  it.each([
    ['SharedEscrow', sharedEscrowSchema],
    ['ShareLinkResolveResponse', shareLinkResolveResponseSchema],
    ['ShareLinkCreateResponse', shareLinkCreateResponseSchema],
  ])('%s declares the same fields as its schema', (name, schema) => {
    expect(interfaceFields(name)).toEqual(Object.keys(schema.shape).sort());
  });
});

describe('shareLinkController responses are schema-validated', () => {
  it('resolveShareLink sends a response that matches the shared schema', async () => {
    const createdAt = new Date('2026-09-02T10:00:00Z');
    prismaMock.escrowShareLink.findUnique.mockResolvedValue({
      token: 't',
      escrowId: 42n,
      revokedAt: null,
      expiresAt: null,
      createdAt,
    });
    prismaMock.escrow.findUnique.mockResolvedValue({
      id: 42n,
      status: 'Active',
      totalAmount: '1000',
      remainingBalance: '1000',
      deadline: null,
      createdAt,
      milestones: [{ id: 1, title: 'Design', amount: '1000', status: 'Pending' }],
    });

    const res = createMockRes();
    await resolveShareLink({ params: { token: 't' } }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.escrow.id).toBe('42');
    expect(shareLinkResolveResponseSchema.safeParse(res.body).success).toBe(true);
  });

  it('resolveShareLink returns 500 instead of a response that drifted from the schema', async () => {
    prismaMock.escrowShareLink.findUnique.mockResolvedValue({
      token: 't',
      escrowId: 42n,
      revokedAt: null,
      expiresAt: null,
      createdAt: new Date(),
    });
    prismaMock.escrow.findUnique.mockResolvedValue({
      id: 42n,
      status: 'SomethingNew',
      totalAmount: '1000',
      remainingBalance: '1000',
      deadline: null,
      createdAt: new Date(),
      milestones: [],
    });

    const res = createMockRes();
    await resolveShareLink({ params: { token: 't' } }, res);

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: 'Share link response failed validation' });
  });

  it('createShareLink sends a response that matches the shared schema', async () => {
    prismaMock.escrow.findUnique.mockResolvedValue({
      id: 42n,
      clientAddress: CLIENT,
      freelancerAddress: `G${'B'.repeat(55)}`,
    });
    prismaMock.escrowShareLink.create.mockImplementation(({ data }) =>
      Promise.resolve({ ...data, createdAt: new Date() }),
    );

    const res = createMockRes();
    await createShareLink({ user: { address: CLIENT }, params: { id: '42' }, body: {} }, res);

    expect(res.statusCode).toBe(201);
    expect(shareLinkCreateResponseSchema.safeParse(res.body).success).toBe(true);
  });
});
