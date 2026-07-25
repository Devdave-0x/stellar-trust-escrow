import { jest } from '@jest/globals';

const prismaMock = {
  tenant: {
    findUnique: jest.fn(),
  },
  announcement: {
    create: jest.fn(),
    update: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
  },
};

jest.unstable_mockModule('../lib/prisma.js', () => ({ default: prismaMock }));

const { default: announcementController } = await import(
  '../api/controllers/announcementController.js'
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

describe('announcementController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createAnnouncement', () => {
    it('creates a global (target=all) announcement', async () => {
      prismaMock.announcement.create.mockResolvedValue({ id: 1, target: 'all' });

      const req = {
        body: {
          title: 'Maintenance',
          body: 'We will be down for maintenance',
          target: 'all',
          endsAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        },
      };
      const res = createMockRes();

      await announcementController.createAnnouncement(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(prismaMock.tenant.findUnique).not.toHaveBeenCalled();
      expect(prismaMock.announcement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ target: 'all', tenantId: null, createdBy: 'admin' }),
        }),
      );
    });

    it('creates a tenant-targeted announcement after validating the tenant exists', async () => {
      prismaMock.tenant.findUnique.mockResolvedValue({ id: 'tenant-1' });
      prismaMock.announcement.create.mockResolvedValue({ id: 2, target: 'tenant' });

      const req = {
        body: {
          title: 'New feature',
          body: 'Check it out',
          target: 'tenant',
          tenantId: 'tenant-1',
          endsAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          createdBy: 'alice@example.com',
        },
      };
      const res = createMockRes();

      await announcementController.createAnnouncement(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(prismaMock.announcement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ target: 'tenant', tenantId: 'tenant-1' }),
        }),
      );
    });

    it('rejects target=tenant without a tenantId', async () => {
      const req = {
        body: {
          title: 'X',
          body: 'Y',
          target: 'tenant',
          endsAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        },
      };
      const res = createMockRes();

      await announcementController.createAnnouncement(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(prismaMock.announcement.create).not.toHaveBeenCalled();
    });

    it('rejects a missing endsAt', async () => {
      const req = { body: { title: 'X', body: 'Y', target: 'all' } };
      const res = createMockRes();

      await announcementController.createAnnouncement(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('404s when the target tenant does not exist', async () => {
      prismaMock.tenant.findUnique.mockResolvedValue(null);

      const req = {
        body: {
          title: 'X',
          body: 'Y',
          target: 'tenant',
          tenantId: 'missing',
          endsAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        },
      };
      const res = createMockRes();

      await announcementController.createAnnouncement(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('updateAnnouncement', () => {
    it('updates fields on an existing announcement', async () => {
      prismaMock.announcement.findFirst.mockResolvedValue({
        id: 1,
        target: 'all',
        tenantId: null,
        startsAt: new Date('2026-01-01T00:00:00Z'),
        endsAt: new Date('2026-01-02T00:00:00Z'),
        createdBy: 'admin',
      });
      prismaMock.announcement.update.mockResolvedValue({ id: 1, title: 'Updated' });

      const req = { params: { id: '1' }, body: { title: 'Updated' } };
      const res = createMockRes();

      await announcementController.updateAnnouncement(req, res);

      expect(prismaMock.announcement.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { title: 'Updated' },
      });
      expect(res.body.title).toBe('Updated');
    });

    it('returns 404 for a non-existent announcement', async () => {
      prismaMock.announcement.findFirst.mockResolvedValue(null);

      const req = { params: { id: '999' }, body: { title: 'x' } };
      const res = createMockRes();

      await announcementController.updateAnnouncement(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('deleteAnnouncement', () => {
    it('soft-deletes an announcement', async () => {
      prismaMock.announcement.findFirst.mockResolvedValue({ id: 1 });
      prismaMock.announcement.update.mockResolvedValue({ id: 1, deletedAt: new Date() });

      const req = { params: { id: '1' } };
      const res = createMockRes();

      await announcementController.deleteAnnouncement(req, res);

      expect(prismaMock.announcement.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { deletedAt: expect.any(Date) },
      });
      expect(res.body).toEqual({ ok: true });
    });

    it('returns 404 when already deleted or missing', async () => {
      prismaMock.announcement.findFirst.mockResolvedValue(null);

      const req = { params: { id: '1' } };
      const res = createMockRes();

      await announcementController.deleteAnnouncement(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('listActive', () => {
    it('returns announcements matching target=all OR target=tenant for the current tenant', async () => {
      const announcements = [{ id: 1, target: 'all' }, { id: 2, target: 'tenant', tenantId: 't1' }];
      prismaMock.announcement.findMany.mockResolvedValue(announcements);

      const req = { tenant: { id: 't1' } };
      const res = createMockRes();

      await announcementController.listActive(req, res);

      expect(prismaMock.announcement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            deletedAt: null,
            OR: [{ target: 'all' }, { target: 'tenant', tenantId: 't1' }],
          }),
        }),
      );
      expect(res.body.data).toEqual(announcements);
    });

    it('only queries the active window (startsAt <= now <= endsAt) — expired/future excluded by the query', async () => {
      prismaMock.announcement.findMany.mockResolvedValue([]);

      const req = { tenant: { id: 't1' } };
      const res = createMockRes();

      await announcementController.listActive(req, res);

      const { where } = prismaMock.announcement.findMany.mock.calls[0][0];
      expect(where.startsAt.lte).toBeInstanceOf(Date);
      expect(where.endsAt.gte).toBeInstanceOf(Date);
      expect(res.body.data).toEqual([]);
    });
  });
});
