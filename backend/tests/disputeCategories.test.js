import { jest, describe, expect, it, beforeEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const prismaMock = {
  disputeCategory: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  dispute: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
  },
};

const cacheMock = {
  get: jest.fn(),
  set: jest.fn(),
  setWithTags: jest.fn(),
  invalidate: jest.fn(),
  invalidateTags: jest.fn(),
  invalidatePrefix: jest.fn(),
};

jest.unstable_mockModule('../lib/prisma.js', () => ({ default: prismaMock }));
jest.unstable_mockModule('../lib/cache.js', () => ({ default: cacheMock }));
jest.unstable_mockModule('../api/middleware/auth.js', () => ({
  default: (req, _res, next) => {
    req.user = { address: 'GRAISER' };
    next();
  },
}));

const { default: disputeRoutes } = await import('../api/routes/disputeRoutes.js');
const { default: disputeCategoryRoutes } = await import('../api/routes/disputeCategoryRoutes.js');
const { default: disputeCategoryController } = await import(
  '../api/controllers/disputeCategoryController.js'
);

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.tenant = { id: 'tenant_default' };
    next();
  });
  app.use('/api/v1/disputes', disputeRoutes);
  app.use('/api/v1/dispute-categories', disputeCategoryRoutes);

  const admin = express.Router();
  admin.get('/dispute-categories', disputeCategoryController.adminListCategories);
  admin.post('/dispute-categories', disputeCategoryController.createCategory);
  admin.patch('/dispute-categories/:id', disputeCategoryController.updateCategory);
  admin.delete('/dispute-categories/:id', disputeCategoryController.deleteCategory);
  app.use('/api/admin', admin);

  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
  cacheMock.get.mockReturnValue(null);
  prismaMock.disputeCategory.findMany.mockResolvedValue([]);
  prismaMock.dispute.findFirst.mockResolvedValue(null);
  prismaMock.dispute.count.mockResolvedValue(0);
});

describe('GET /api/v1/dispute-categories', () => {
  it('returns only active categories', async () => {
    prismaMock.disputeCategory.findMany.mockResolvedValue([
      { id: 1, name: 'Non-Delivery', description: null, defaultArbiterPoolId: 'pool-non-delivery', active: true },
    ]);

    const res = await request(buildApp()).get('/api/v1/dispute-categories');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(prismaMock.disputeCategory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { active: true } }),
    );
  });
});

describe('POST /api/v1/disputes', () => {
  it('rejects a dispute without a categoryId', async () => {
    const res = await request(buildApp()).post('/api/v1/disputes').send({ escrowId: '42' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(prismaMock.dispute.create).not.toHaveBeenCalled();
  });

  it('rejects an unknown categoryId', async () => {
    prismaMock.disputeCategory.findFirst.mockResolvedValue(null);

    const res = await request(buildApp())
      .post('/api/v1/disputes')
      .send({ escrowId: '42', categoryId: 999 });

    expect(res.status).toBe(400);
    expect(prismaMock.dispute.create).not.toHaveBeenCalled();
  });

  it('auto-assigns the arbiter pool from the category default', async () => {
    prismaMock.disputeCategory.findFirst.mockResolvedValue({
      id: 2,
      defaultArbiterPoolId: 'pool-quality',
    });
    prismaMock.dispute.create.mockResolvedValue({ id: 7, escrowId: 42n, arbiterPoolId: 'pool-quality' });

    const res = await request(buildApp())
      .post('/api/v1/disputes')
      .send({ escrowId: '42', categoryId: 2 });

    expect(res.status).toBe(201);
    expect(prismaMock.dispute.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ categoryId: 2, arbiterPoolId: 'pool-quality' }),
      }),
    );
  });

  it('rejects a second dispute for the same escrow', async () => {
    prismaMock.disputeCategory.findFirst.mockResolvedValue({ id: 1, defaultArbiterPoolId: null });
    prismaMock.dispute.findFirst.mockResolvedValue({ id: 3 });

    const res = await request(buildApp())
      .post('/api/v1/disputes')
      .send({ escrowId: '42', categoryId: 1 });

    expect(res.status).toBe(409);
  });
});

describe('admin dispute category CRUD', () => {
  it('lists every category including inactive ones', async () => {
    prismaMock.disputeCategory.findMany.mockResolvedValue([{ id: 1, name: 'Other', active: false }]);

    const res = await request(buildApp()).get('/api/admin/dispute-categories');

    expect(res.status).toBe(200);
    expect(res.body.categories).toHaveLength(1);
    expect(prismaMock.disputeCategory.findMany).toHaveBeenCalledWith(
      expect.not.objectContaining({ where: expect.anything() }),
    );
  });

  it('creates a category', async () => {
    prismaMock.disputeCategory.findUnique.mockResolvedValue(null);
    prismaMock.disputeCategory.create.mockResolvedValue({ id: 6, name: 'Fraud' });

    const res = await request(buildApp())
      .post('/api/admin/dispute-categories')
      .send({ name: ' Fraud ', defaultArbiterPoolId: 'pool-fraud' });

    expect(res.status).toBe(201);
    expect(prismaMock.disputeCategory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: 'Fraud', defaultArbiterPoolId: 'pool-fraud' }),
      }),
    );
  });

  it('rejects a category without a name', async () => {
    const res = await request(buildApp()).post('/api/admin/dispute-categories').send({});

    expect(res.status).toBe(400);
    expect(prismaMock.disputeCategory.create).not.toHaveBeenCalled();
  });

  it('rejects a duplicate category name', async () => {
    prismaMock.disputeCategory.findUnique.mockResolvedValue({ id: 1, name: 'Other' });

    const res = await request(buildApp())
      .post('/api/admin/dispute-categories')
      .send({ name: 'Other' });

    expect(res.status).toBe(409);
  });

  it('updates a category', async () => {
    prismaMock.disputeCategory.findUnique.mockResolvedValue({ id: 1 });
    prismaMock.disputeCategory.update.mockResolvedValue({ id: 1, name: 'Renamed' });

    const res = await request(buildApp())
      .patch('/api/admin/dispute-categories/1')
      .send({ name: 'Renamed', active: false });

    expect(res.status).toBe(200);
    expect(prismaMock.disputeCategory.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1 },
        data: expect.objectContaining({ name: 'Renamed', active: false }),
      }),
    );
  });

  it('404s when updating a missing category', async () => {
    prismaMock.disputeCategory.findUnique.mockResolvedValue(null);

    const res = await request(buildApp()).patch('/api/admin/dispute-categories/99').send({});

    expect(res.status).toBe(404);
  });

  it('deletes an unused category', async () => {
    prismaMock.disputeCategory.findUnique.mockResolvedValue({ id: 1 });
    prismaMock.dispute.count.mockResolvedValue(0);
    prismaMock.disputeCategory.delete.mockResolvedValue({ id: 1 });

    const res = await request(buildApp()).delete('/api/admin/dispute-categories/1');

    expect(res.status).toBe(204);
    expect(prismaMock.disputeCategory.delete).toHaveBeenCalled();
  });

  it('deactivates instead of deleting a category still in use', async () => {
    prismaMock.disputeCategory.findUnique.mockResolvedValue({ id: 1 });
    prismaMock.dispute.count.mockResolvedValue(4);
    prismaMock.disputeCategory.update.mockResolvedValue({ id: 1, active: false });

    const res = await request(buildApp()).delete('/api/admin/dispute-categories/1');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deactivated: true, disputes: 4 });
    expect(prismaMock.disputeCategory.delete).not.toHaveBeenCalled();
  });
});
