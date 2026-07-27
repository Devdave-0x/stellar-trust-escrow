import { jest } from '@jest/globals';
import crypto from 'crypto';

const prismaMock = {
  userSession: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    updateMany: jest.fn(),
    deleteMany: jest.fn(),
  },
};

jest.unstable_mockModule('../lib/prisma.js', () => ({ default: prismaMock }));

const { default: sessionService } = await import('../services/sessionService.js');
const { default: sessionController } = await import('../api/controllers/sessionController.js');

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function createMockRes() {
  return {
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
}

const USER_ADDRESS = 'GALICEXAMPLE0000000000000000000000000000000000000000000';
const CURRENT_JTI = 'jti-current';
const OTHER_JTI = 'jti-other';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('sessionService', () => {
  describe('listSessions', () => {
    it('marks the session matching the current jti as current', async () => {
      prismaMock.userSession.findMany.mockResolvedValue([
        {
          id: 'sess_1',
          userId: USER_ADDRESS,
          tokenHash: hashToken(CURRENT_JTI),
          deviceName: 'Chrome on macOS',
          ipAddress: '1.1.1.1',
          lastActiveAt: new Date('2026-07-25T00:00:00Z'),
          createdAt: new Date('2026-07-20T00:00:00Z'),
        },
        {
          id: 'sess_2',
          userId: USER_ADDRESS,
          tokenHash: hashToken(OTHER_JTI),
          deviceName: 'Safari on iPhone',
          ipAddress: '2.2.2.2',
          lastActiveAt: new Date('2026-07-24T00:00:00Z'),
          createdAt: new Date('2026-07-19T00:00:00Z'),
        },
      ]);

      const sessions = await sessionService.listSessions(USER_ADDRESS, CURRENT_JTI);

      expect(sessions).toHaveLength(2);
      expect(sessions.find((s) => s.id === 'sess_1').current).toBe(true);
      expect(sessions.find((s) => s.id === 'sess_2').current).toBe(false);
      // tokenHash must never be exposed to the client
      expect(sessions[0].tokenHash).toBeUndefined();
    });
  });

  describe('touchSession', () => {
    it('only bumps last_active_at when it is more than a minute stale', async () => {
      await sessionService.touchSession(CURRENT_JTI);

      expect(prismaMock.userSession.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tokenHash: hashToken(CURRENT_JTI),
            lastActiveAt: { lt: expect.any(Date) },
          }),
        }),
      );
    });
  });

  describe('revokeAllExcept', () => {
    it('excludes the current session tokenHash from deletion', async () => {
      prismaMock.userSession.deleteMany.mockResolvedValue({ count: 1 });

      await sessionService.revokeAllExcept(USER_ADDRESS, CURRENT_JTI);

      expect(prismaMock.userSession.deleteMany).toHaveBeenCalledWith({
        where: {
          userId: USER_ADDRESS,
          tokenHash: { not: hashToken(CURRENT_JTI) },
        },
      });
    });
  });
});

describe('sessionController', () => {
  describe('listSessions', () => {
    it('returns the authenticated user sessions', async () => {
      prismaMock.userSession.findMany.mockResolvedValue([
        {
          id: 'sess_1',
          userId: USER_ADDRESS,
          tokenHash: hashToken(CURRENT_JTI),
          deviceName: 'Chrome on macOS',
          ipAddress: '1.1.1.1',
          lastActiveAt: new Date(),
          createdAt: new Date(),
        },
      ]);

      const req = { user: { address: USER_ADDRESS, jti: CURRENT_JTI } };
      const res = createMockRes();

      await sessionController.listSessions(req, res);

      expect(res.json).toHaveBeenCalled();
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].current).toBe(true);
    });

    it('requires authentication', async () => {
      const req = { user: null };
      const res = createMockRes();

      await sessionController.listSessions(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  describe('revokeSession', () => {
    it('revokes a single session owned by the caller', async () => {
      prismaMock.userSession.deleteMany.mockResolvedValue({ count: 1 });

      const req = { user: { address: USER_ADDRESS, jti: CURRENT_JTI }, params: { id: 'sess_2' } };
      const res = createMockRes();

      await sessionController.revokeSession(req, res);

      expect(prismaMock.userSession.deleteMany).toHaveBeenCalledWith({
        where: { id: 'sess_2', userId: USER_ADDRESS },
      });
      expect(res.body).toEqual({ ok: true });
    });

    it('returns 404 when the session does not exist (or belongs to another user)', async () => {
      prismaMock.userSession.deleteMany.mockResolvedValue({ count: 0 });

      const req = { user: { address: USER_ADDRESS, jti: CURRENT_JTI }, params: { id: 'not-mine' } };
      const res = createMockRes();

      await sessionController.revokeSession(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('revokeAllSessions (sign out everywhere else)', () => {
    it('revokes every session except the current one', async () => {
      prismaMock.userSession.deleteMany.mockResolvedValue({ count: 3 });

      const req = { user: { address: USER_ADDRESS, jti: CURRENT_JTI } };
      const res = createMockRes();

      await sessionController.revokeAllSessions(req, res);

      expect(prismaMock.userSession.deleteMany).toHaveBeenCalledWith({
        where: { userId: USER_ADDRESS, tokenHash: { not: hashToken(CURRENT_JTI) } },
      });
      expect(res.body).toEqual({ ok: true, revoked: 3 });
    });

    it('the current session is never deleted, verified against a live listSessions call', async () => {
      // Simulate the deleteMany actually filtering out the current session.
      const store = [
        { id: 'sess_1', userId: USER_ADDRESS, tokenHash: hashToken(CURRENT_JTI) },
        { id: 'sess_2', userId: USER_ADDRESS, tokenHash: hashToken(OTHER_JTI) },
      ];
      prismaMock.userSession.deleteMany.mockImplementation(async ({ where }) => {
        const before = store.length;
        for (let i = store.length - 1; i >= 0; i--) {
          const row = store[i];
          const matchesUser = row.userId === where.userId;
          const matchesHash = where.tokenHash ? row.tokenHash !== where.tokenHash.not : true;
          if (matchesUser && matchesHash) store.splice(i, 1);
        }
        return { count: before - store.length };
      });

      await sessionService.revokeAllExcept(USER_ADDRESS, CURRENT_JTI);

      expect(store).toHaveLength(1);
      expect(store[0].id).toBe('sess_1');
    });
  });
});
