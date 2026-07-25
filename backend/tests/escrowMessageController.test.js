import { jest } from '@jest/globals';

const prismaMock = {
  $transaction: jest.fn(async (ops) => Promise.all(ops)),
  escrow: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  escrowMessage: {
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
  },
};

const emailServiceMock = {
  notifyNewMessage: jest.fn(async () => ({ queued: 1 })),
};

jest.unstable_mockModule('../lib/prisma.js', () => ({ default: prismaMock }));
jest.unstable_mockModule('../services/emailService.js', () => ({ default: emailServiceMock }));

const { default: escrowMessageController } = await import(
  '../api/controllers/escrowMessageController.js'
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

const CLIENT_ADDRESS = 'GCLIENT111111111111111111111111111111111111111111111';
const FREELANCER_ADDRESS = 'GFREELANCER11111111111111111111111111111111111111111';
const OUTSIDER_ADDRESS = 'GOUTSIDER11111111111111111111111111111111111111111111';

function buildEscrow(overrides = {}) {
  return {
    id: 1n,
    tenantId: 'test-tenant-id',
    clientAddress: CLIENT_ADDRESS,
    freelancerAddress: FREELANCER_ADDRESS,
    arbiterAddress: null,
    ...overrides,
  };
}

describe('escrowMessageController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (ops) => Promise.all(ops));
  });

  describe('sendMessage', () => {
    it('creates a message for a participant and notifies the other participant', async () => {
      const escrow = buildEscrow();
      prismaMock.escrow.findUnique.mockResolvedValue(escrow);
      prismaMock.user.findUnique.mockResolvedValue({ id: 1, walletAddress: CLIENT_ADDRESS });
      prismaMock.user.findMany.mockResolvedValue([
        { id: 2, walletAddress: FREELANCER_ADDRESS, email: 'freelancer@example.com' },
      ]);
      prismaMock.escrowMessage.create.mockResolvedValue({
        id: 10,
        tenantId: 'test-tenant-id',
        escrowId: 1n,
        senderId: 1,
        body: 'Hello there',
        readBy: [1],
        createdAt: new Date('2026-07-01T00:00:00Z'),
      });

      const req = {
        params: { id: '1' },
        body: { body: 'Hello there' },
        user: { userId: 1, tenantId: 'test-tenant-id' },
        tenant: { id: 'test-tenant-id' },
      };
      const res = createMockRes();

      await escrowMessageController.sendMessage(req, res);

      expect(prismaMock.escrowMessage.create).toHaveBeenCalledWith({
        data: {
          tenantId: 'test-tenant-id',
          escrowId: 1n,
          senderId: 1,
          body: 'Hello there',
          readBy: [1],
        },
      });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.body.escrowId).toBe('1');
      expect(emailServiceMock.notifyNewMessage).toHaveBeenCalledTimes(1);
      const notifyPayload = emailServiceMock.notifyNewMessage.mock.calls[0][0];
      expect(notifyPayload.recipients).toEqual([
        { email: 'freelancer@example.com', address: FREELANCER_ADDRESS },
      ]);
    });

    it('blocks a non-participant from sending a message', async () => {
      const escrow = buildEscrow();
      prismaMock.escrow.findUnique.mockResolvedValue(escrow);
      prismaMock.user.findUnique.mockResolvedValue({ id: 99, walletAddress: OUTSIDER_ADDRESS });

      const req = {
        params: { id: '1' },
        body: { body: 'Hi' },
        user: { userId: 99, tenantId: 'test-tenant-id' },
        tenant: { id: 'test-tenant-id' },
      };
      const res = createMockRes();

      await escrowMessageController.sendMessage(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(prismaMock.escrowMessage.create).not.toHaveBeenCalled();
    });

    it('returns 404 when the escrow does not exist', async () => {
      prismaMock.escrow.findUnique.mockResolvedValue(null);

      const req = {
        params: { id: '999' },
        body: { body: 'Hi' },
        user: { userId: 1, tenantId: 'test-tenant-id' },
        tenant: { id: 'test-tenant-id' },
      };
      const res = createMockRes();

      await escrowMessageController.sendMessage(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('listMessages', () => {
    it('returns a paginated list for a participant, newest first', async () => {
      const escrow = buildEscrow();
      prismaMock.escrow.findUnique.mockResolvedValue(escrow);
      prismaMock.user.findUnique.mockResolvedValue({ id: 1, walletAddress: CLIENT_ADDRESS });
      const messages = [
        { id: 2, escrowId: 1n, senderId: 2, body: 'second', readBy: [2], createdAt: new Date() },
        { id: 1, escrowId: 1n, senderId: 1, body: 'first', readBy: [1], createdAt: new Date() },
      ];
      prismaMock.escrowMessage.findMany.mockResolvedValue(messages);
      prismaMock.escrowMessage.count.mockResolvedValue(2);

      const req = {
        params: { id: '1' },
        query: {},
        user: { userId: 1, tenantId: 'test-tenant-id' },
        tenant: { id: 'test-tenant-id' },
      };
      const res = createMockRes();

      await escrowMessageController.listMessages(req, res);

      expect(prismaMock.escrowMessage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { escrowId: 1n },
          orderBy: { createdAt: 'desc' },
        }),
      );
      expect(res.body.data).toHaveLength(2);
      expect(res.body.total).toBe(2);
    });

    it('blocks a non-participant from listing messages', async () => {
      const escrow = buildEscrow();
      prismaMock.escrow.findUnique.mockResolvedValue(escrow);
      prismaMock.user.findUnique.mockResolvedValue({ id: 99, walletAddress: OUTSIDER_ADDRESS });

      const req = {
        params: { id: '1' },
        query: {},
        user: { userId: 99, tenantId: 'test-tenant-id' },
        tenant: { id: 'test-tenant-id' },
      };
      const res = createMockRes();

      await escrowMessageController.listMessages(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(prismaMock.escrowMessage.findMany).not.toHaveBeenCalled();
    });
  });

  describe('markRead', () => {
    it('marks all unread messages as read for the requesting participant', async () => {
      const escrow = buildEscrow();
      prismaMock.escrow.findUnique.mockResolvedValue(escrow);
      prismaMock.user.findUnique.mockResolvedValue({ id: 2, walletAddress: FREELANCER_ADDRESS });
      prismaMock.escrowMessage.findMany.mockResolvedValue([
        { id: 1, readBy: [1] },
        { id: 2, readBy: [1] },
      ]);
      prismaMock.escrowMessage.update.mockResolvedValue({});

      const req = {
        params: { id: '1' },
        user: { userId: 2, tenantId: 'test-tenant-id' },
        tenant: { id: 'test-tenant-id' },
      };
      const res = createMockRes();

      await escrowMessageController.markRead(req, res);

      expect(prismaMock.escrowMessage.update).toHaveBeenCalledTimes(2);
      expect(prismaMock.escrowMessage.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { readBy: [1, 2] },
      });
      expect(res.body).toEqual({ marked: 2 });
    });

    it('returns marked: 0 when there is nothing unread', async () => {
      const escrow = buildEscrow();
      prismaMock.escrow.findUnique.mockResolvedValue(escrow);
      prismaMock.user.findUnique.mockResolvedValue({ id: 2, walletAddress: FREELANCER_ADDRESS });
      prismaMock.escrowMessage.findMany.mockResolvedValue([]);

      const req = {
        params: { id: '1' },
        user: { userId: 2, tenantId: 'test-tenant-id' },
        tenant: { id: 'test-tenant-id' },
      };
      const res = createMockRes();

      await escrowMessageController.markRead(req, res);

      expect(prismaMock.escrowMessage.update).not.toHaveBeenCalled();
      expect(res.body).toEqual({ marked: 0 });
    });

    it('blocks a non-participant from marking messages read', async () => {
      const escrow = buildEscrow();
      prismaMock.escrow.findUnique.mockResolvedValue(escrow);
      prismaMock.user.findUnique.mockResolvedValue({ id: 99, walletAddress: OUTSIDER_ADDRESS });

      const req = {
        params: { id: '1' },
        user: { userId: 99, tenantId: 'test-tenant-id' },
        tenant: { id: 'test-tenant-id' },
      };
      const res = createMockRes();

      await escrowMessageController.markRead(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  describe('getUnreadCount', () => {
    it('counts unread messages across all of the user escrows', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ id: 1, walletAddress: CLIENT_ADDRESS });
      prismaMock.escrow.findMany.mockResolvedValue([{ id: 1n }, { id: 2n }]);
      prismaMock.escrowMessage.count.mockResolvedValue(3);

      const req = { user: { userId: 1, tenantId: 'test-tenant-id' } };
      const res = createMockRes();

      await escrowMessageController.getUnreadCount(req, res);

      expect(prismaMock.escrowMessage.count).toHaveBeenCalledWith({
        where: {
          escrowId: { in: [1n, 2n] },
          NOT: { readBy: { array_contains: 1 } },
        },
      });
      expect(res.body).toEqual({ count: 3 });
    });

    it('returns 0 when the user has no linked wallet address', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ id: 5, walletAddress: null });

      const req = { user: { userId: 5, tenantId: 'test-tenant-id' } };
      const res = createMockRes();

      await escrowMessageController.getUnreadCount(req, res);

      expect(res.body).toEqual({ count: 0 });
      expect(prismaMock.escrow.findMany).not.toHaveBeenCalled();
    });
  });
});
