import { jest } from '@jest/globals';

const prismaMock = {
  escrowTemplate: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    delete: jest.fn(),
  },
  escrow: {
    findUnique: jest.fn(),
  },
};

jest.unstable_mockModule('../lib/prisma.js', () => ({ default: prismaMock }));

const { default: escrowTemplateController } = await import(
  '../api/controllers/escrowTemplateController.js'
);

function createMockRes() {
  const res = {
    statusCode: 200,
    body: null,
    status: jest.fn().mockImplementation(function (code) {
      this.statusCode = code;
      return this;
    }),
    json: jest.fn().mockImplementation(function (payload) {
      this.body = payload;
      return this;
    }),
  };
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('escrowTemplateController', () => {
  describe('createTemplate', () => {
    it('saves a template from a raw config body', async () => {
      const created = { id: 1, userId: 7, name: 'Standard Gig', config: { amount: '100' } };
      prismaMock.escrowTemplate.create.mockResolvedValue(created);

      const req = {
        user: { userId: 7 },
        body: { name: 'Standard Gig', config: { amount: '100', currency: 'USDC' } },
      };
      const res = createMockRes();

      await escrowTemplateController.createTemplate(req, res);

      expect(res.statusCode).toBe(201);
      expect(res.body).toEqual(created);
      expect(prismaMock.escrowTemplate.create).toHaveBeenCalledWith({
        data: { userId: 7, name: 'Standard Gig', config: { amount: '100', currency: 'USDC' } },
      });
    });

    it('builds config from an existing escrow when fromEscrowId is given', async () => {
      prismaMock.escrow.findUnique.mockResolvedValue({
        id: 42n,
        totalAmount: '500',
        tokenAddress: 'USDC',
        milestones: [{ title: 'Design', amount: '200' }],
      });
      prismaMock.escrowTemplate.create.mockResolvedValue({ id: 2 });

      const req = { user: { userId: 7 }, body: { name: 'From Escrow', fromEscrowId: '42' } };
      const res = createMockRes();

      await escrowTemplateController.createTemplate(req, res);

      expect(prismaMock.escrowTemplate.create).toHaveBeenCalledWith({
        data: {
          userId: 7,
          name: 'From Escrow',
          config: {
            titlePrefix: '',
            amount: '500',
            currency: 'USDC',
            milestones: [{ title: 'Design', amount: '200' }],
            tags: [],
          },
        },
      });
      expect(res.statusCode).toBe(201);
    });

    it('rejects when neither config nor fromEscrowId is provided', async () => {
      const req = { user: { userId: 7 }, body: { name: 'Nothing' } };
      const res = createMockRes();

      await escrowTemplateController.createTemplate(req, res);

      expect(res.statusCode).toBe(400);
      expect(prismaMock.escrowTemplate.create).not.toHaveBeenCalled();
    });
  });

  describe('applyTemplate', () => {
    it('merges the saved config with overrides', async () => {
      prismaMock.escrowTemplate.findUnique.mockResolvedValue({
        id: 1,
        userId: 7,
        name: 'Standard Gig',
        config: { amount: '100', currency: 'USDC', tags: ['design'] },
      });

      const req = { user: { userId: 7 }, params: { id: '1' }, body: { amount: '250' } };
      const res = createMockRes();

      await escrowTemplateController.applyTemplate(req, res);

      expect(res.statusCode).toBe(201);
      expect(res.body.config).toEqual({ amount: '250', currency: 'USDC', tags: ['design'] });
    });

    it('returns 404 for a template owned by another user', async () => {
      prismaMock.escrowTemplate.findUnique.mockResolvedValue({ id: 1, userId: 999, config: {} });

      const req = { user: { userId: 7 }, params: { id: '1' }, body: {} };
      const res = createMockRes();

      await escrowTemplateController.applyTemplate(req, res);

      expect(res.statusCode).toBe(404);
    });
  });

  describe('deleteTemplate', () => {
    it('deletes a template owned by the user', async () => {
      prismaMock.escrowTemplate.findUnique.mockResolvedValue({ id: 1, userId: 7 });

      const req = { user: { userId: 7 }, params: { id: '1' } };
      const res = createMockRes();

      await escrowTemplateController.deleteTemplate(req, res);

      expect(prismaMock.escrowTemplate.delete).toHaveBeenCalledWith({ where: { id: 1 } });
      expect(res.body).toEqual({ message: 'Template deleted.' });
    });

    it('returns 404 deleting a template that does not belong to the user', async () => {
      prismaMock.escrowTemplate.findUnique.mockResolvedValue({ id: 1, userId: 999 });

      const req = { user: { userId: 7 }, params: { id: '1' } };
      const res = createMockRes();

      await escrowTemplateController.deleteTemplate(req, res);

      expect(res.statusCode).toBe(404);
      expect(prismaMock.escrowTemplate.delete).not.toHaveBeenCalled();
    });
  });
});
