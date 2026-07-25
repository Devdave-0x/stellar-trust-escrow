import { jest } from '@jest/globals';
import { PassThrough } from 'stream';

const prismaMock = {
  escrow: { findUnique: jest.fn() },
  escrowShareLink: {
    findFirst: jest.fn(),
    create: jest.fn(),
  },
};

jest.unstable_mockModule('../lib/prisma.js', () => ({ default: prismaMock }));

const { default: certificateController } =
  await import('../api/controllers/certificateController.js');

function createMockRes() {
  const stream = new PassThrough();
  const res = Object.assign(stream, {
    statusCode: 200,
    body: null,
    headers: {},
    status: jest.fn().mockImplementation(function (code) {
      this.statusCode = code;
      return this;
    }),
    json: jest.fn().mockImplementation(function (payload) {
      this.body = payload;
      return this;
    }),
    setHeader: jest.fn().mockImplementation(function (key, value) {
      this.headers[key] = value;
    }),
  });
  return res;
}

const completedEscrow = {
  id: 42n,
  status: 'Completed',
  title: 'Landing page redesign',
  clientAddress: 'G'.repeat(56),
  freelancerAddress: 'H'.repeat(56),
  arbiterAddress: null,
  totalAmount: '1000',
  tokenAddress: 'T'.repeat(56),
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-02-01T00:00:00Z'),
  milestones: [],
};

beforeEach(() => {
  jest.clearAllMocks();
  prismaMock.escrowShareLink.findFirst.mockResolvedValue(null);
  prismaMock.escrowShareLink.create.mockResolvedValue({ token: 'test-token' });
});

describe('certificateController.getCertificate', () => {
  it('streams a PDF for a completed escrow', async () => {
    prismaMock.escrow.findUnique.mockResolvedValue(completedEscrow);
    const req = { params: { id: '42' } };
    const res = createMockRes();

    const chunks = [];
    res.on('data', (c) => chunks.push(c));
    const finished = new Promise((resolve) => res.on('end', resolve));

    await certificateController.getCertificate(req, res);
    await finished;

    expect(res.headers['Content-Type']).toBe('application/pdf');
    expect(res.headers['Content-Disposition']).toContain('escrow-42-certificate.pdf');
    expect(Buffer.concat(chunks).subarray(0, 4).toString()).toBe('%PDF');
    expect(res.json).not.toHaveBeenCalled();
  });

  it('returns 404 when the escrow does not exist', async () => {
    prismaMock.escrow.findUnique.mockResolvedValue(null);
    const req = { params: { id: '999' } };
    const res = createMockRes();

    await certificateController.getCertificate(req, res);

    expect(res.statusCode).toBe(404);
  });

  it('returns 404 when the escrow is not yet completed', async () => {
    prismaMock.escrow.findUnique.mockResolvedValue({ ...completedEscrow, status: 'Active' });
    const req = { params: { id: '42' } };
    const res = createMockRes();

    await certificateController.getCertificate(req, res);

    expect(res.statusCode).toBe(404);
    expect(res.body.error).toMatch(/completed/i);
  });
});
