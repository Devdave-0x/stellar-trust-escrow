import { jest } from '@jest/globals';

const cacheMock = {
  get: jest.fn(),
  set: jest.fn(),
  invalidate: jest.fn(),
  invalidatePrefix: jest.fn(),
};

const prismaMock = {
  disputeCategory: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};

jest.unstable_mockModule('../lib/cache.js', () => ({ default: cacheMock }));
jest.unstable_mockModule('../lib/prisma.js', () => ({ default: prismaMock }));

const { default: disputeCategoryController } = await import(
  '../api/controllers/disputeCategoryController.js'
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
  cacheMock.get.mockResolvedValue(null);
});

describe('disputeCategoryController', () => {
  describe('listCategories (public)', () => {
    it('returns categories from the DB on a cache miss', async () => {
      const categories = [{ id: 1, name: 'Non-Delivery' }];
      prismaMock.disputeCategory.findMany.mockResolvedValue(categories);
      const req = {};
      const res = createMockRes();

      await disputeCategoryController.listCategories(req, res);

      expect(res.json).toHaveBeenCalledWith(categories);
      expect(cacheMock.set).toHaveBeenCalled();
    });

    it('returns cached categories without hitting the DB', async () => {
      const cached = [{ id: 1, name: 'Non-Delivery' }];
      cacheMock.get.mockResolvedValue(cached);
      const req = {};
      const res = createMockRes();

      await disputeCategoryController.listCategories(req, res);

      expect(res.json).toHaveBeenCalledWith(cached);
      expect(prismaMock.disputeCategory.findMany).not.toHaveBeenCalled();
    });
  });

  describe('admin CRUD', () => {
    it('creates a category', async () => {
      const created = { id: 1, name: 'Custom Category' };
      prismaMock.disputeCategory.create.mockResolvedValue(created);
      const req = { body: { name: 'Custom Category' } };
      const res = createMockRes();

      await disputeCategoryController.adminCreateCategory(req, res);

      expect(res.statusCode).toBe(201);
      expect(res.body).toEqual(created);
      expect(cacheMock.invalidate).toHaveBeenCalled();
    });

    it('rejects category creation without a name', async () => {
      const req = { body: {} };
      const res = createMockRes();

      await disputeCategoryController.adminCreateCategory(req, res);

      expect(res.statusCode).toBe(400);
      expect(prismaMock.disputeCategory.create).not.toHaveBeenCalled();
    });

    it('updates a category', async () => {
      prismaMock.disputeCategory.findUnique.mockResolvedValue({ id: 1, name: 'Old' });
      const updated = { id: 1, name: 'New' };
      prismaMock.disputeCategory.update.mockResolvedValue(updated);
      const req = { params: { id: '1' }, body: { name: 'New' } };
      const res = createMockRes();

      await disputeCategoryController.adminUpdateCategory(req, res);

      expect(res.body).toEqual(updated);
    });

    it('returns 404 updating a category that does not exist', async () => {
      prismaMock.disputeCategory.findUnique.mockResolvedValue(null);
      const req = { params: { id: '999' }, body: { name: 'New' } };
      const res = createMockRes();

      await disputeCategoryController.adminUpdateCategory(req, res);

      expect(res.statusCode).toBe(404);
    });

    it('deletes a category', async () => {
      prismaMock.disputeCategory.findUnique.mockResolvedValue({ id: 1, name: 'Old' });
      const req = { params: { id: '1' } };
      const res = createMockRes();

      await disputeCategoryController.adminDeleteCategory(req, res);

      expect(prismaMock.disputeCategory.delete).toHaveBeenCalledWith({ where: { id: 1 } });
      expect(cacheMock.invalidate).toHaveBeenCalled();
    });
  });
});
