import { jest } from '@jest/globals';

const prismaMock = {
  user: {
    findFirst: jest.fn(),
    update: jest.fn(),
    findUnique: jest.fn(),
  },
  loginHistory: {
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
  $transaction: jest.fn(async (ops) => Promise.all(ops)),
};

const bcryptMock = { compare: jest.fn() };

const refreshTokenServiceMock = {
  default: {
    createRefreshToken: jest.fn(async () => ({ refreshToken: 'refresh-token-value' })),
  },
};

const tokenMetricsServiceMock = {
  default: { recordTokenGeneration: jest.fn(async () => {}) },
};

const tokenBlacklistServiceMock = {
  default: { isTokenBlacklisted: jest.fn(async () => false) },
};

const emailServiceMock = {
  default: { notifyLoginLockout: jest.fn(async () => ({ queued: 1 })) },
};

jest.unstable_mockModule('../lib/prisma.js', () => ({ default: prismaMock }));
jest.unstable_mockModule('bcryptjs', () => ({ default: bcryptMock, ...bcryptMock }));
jest.unstable_mockModule('../services/refreshTokenService.js', () => refreshTokenServiceMock);
jest.unstable_mockModule('../services/tokenMetricsService.js', () => tokenMetricsServiceMock);
jest.unstable_mockModule('../services/tokenBlacklistService.js', () => tokenBlacklistServiceMock);
jest.unstable_mockModule('../services/emailService.js', () => emailServiceMock);

const { login } = await import('../api/controllers/authController.js');
const { default: userController } = await import('../api/controllers/userController.js');
const { default: adminController } = await import('../api/controllers/adminController.js');

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

function buildLoginReq(overrides = {}) {
  return {
    body: { email: 'user@example.com', password: 'correct-password' },
    tenant: { id: 'test-tenant-id', slug: 'default' },
    ip: '127.0.0.1',
    get: () => 'jest-test-agent',
    ...overrides,
  };
}

const BASE_USER = {
  id: 1,
  tenantId: 'test-tenant-id',
  email: 'user@example.com',
  password: 'hashed-password',
  walletAddress: null,
  lockedUntil: null,
};

describe('login — login history + lockout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (ops) => Promise.all(ops));
  });

  it('records a successful login attempt', async () => {
    prismaMock.user.findFirst.mockResolvedValue(BASE_USER);
    bcryptMock.compare.mockResolvedValue(true);

    const req = buildLoginReq();
    const res = createMockRes();

    await login(req, res);

    expect(prismaMock.loginHistory.create).toHaveBeenCalledWith({
      data: {
        tenantId: 'test-tenant-id',
        userId: 1,
        ipAddress: '127.0.0.1',
        userAgent: 'jest-test-agent',
        success: true,
        failureReason: null,
      },
    });
    expect(res.status).not.toHaveBeenCalledWith(401);
  });

  it('records a failed login attempt for an unknown email without a userId', async () => {
    prismaMock.user.findFirst.mockResolvedValue(null);

    const req = buildLoginReq({ body: { email: 'ghost@example.com', password: 'x' } });
    const res = createMockRes();

    await login(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(prismaMock.loginHistory.create).toHaveBeenCalledWith({
      data: {
        tenantId: 'test-tenant-id',
        userId: null,
        ipAddress: '127.0.0.1',
        userAgent: 'jest-test-agent',
        success: false,
        failureReason: 'user_not_found',
      },
    });
  });

  it('records a failed login attempt for a wrong password', async () => {
    prismaMock.user.findFirst.mockResolvedValue(BASE_USER);
    bcryptMock.compare.mockResolvedValue(false);
    prismaMock.loginHistory.findMany.mockResolvedValue([]);

    const req = buildLoginReq({ body: { email: BASE_USER.email, password: 'wrong' } });
    const res = createMockRes();

    await login(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(prismaMock.loginHistory.create).toHaveBeenCalledWith({
      data: {
        tenantId: 'test-tenant-id',
        userId: 1,
        ipAddress: '127.0.0.1',
        userAgent: 'jest-test-agent',
        success: false,
        failureReason: 'invalid_password',
      },
    });
  });

  it('locks the account and sends an alert email after 5 consecutive failures', async () => {
    prismaMock.user.findFirst.mockResolvedValue(BASE_USER);
    bcryptMock.compare.mockResolvedValue(false);
    // 4 prior consecutive failures + the one just recorded = 5
    prismaMock.loginHistory.findMany.mockResolvedValue([
      { success: false },
      { success: false },
      { success: false },
      { success: false },
      { success: false },
    ]);

    const req = buildLoginReq({ body: { email: BASE_USER.email, password: 'wrong' } });
    const res = createMockRes();

    await login(req, res);

    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { lockedUntil: expect.any(Date) },
    });
    expect(emailServiceMock.default.notifyLoginLockout).toHaveBeenCalledTimes(1);
  });

  it('does not lock the account before 5 consecutive failures', async () => {
    prismaMock.user.findFirst.mockResolvedValue(BASE_USER);
    bcryptMock.compare.mockResolvedValue(false);
    prismaMock.loginHistory.findMany.mockResolvedValue([
      { success: false },
      { success: false },
      { success: false },
    ]);

    const req = buildLoginReq({ body: { email: BASE_USER.email, password: 'wrong' } });
    const res = createMockRes();

    await login(req, res);

    expect(prismaMock.user.update).not.toHaveBeenCalled();
    expect(emailServiceMock.default.notifyLoginLockout).not.toHaveBeenCalled();
  });

  it('rejects login with 423 while the account is locked, without checking the password', async () => {
    prismaMock.user.findFirst.mockResolvedValue({
      ...BASE_USER,
      lockedUntil: new Date(Date.now() + 10 * 60 * 1000),
    });

    const req = buildLoginReq();
    const res = createMockRes();

    await login(req, res);

    expect(res.status).toHaveBeenCalledWith(423);
    expect(bcryptMock.compare).not.toHaveBeenCalled();
    expect(prismaMock.loginHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ failureReason: 'account_locked' }) }),
    );
  });

  it('allows login again once lockedUntil has passed and clears the lock', async () => {
    prismaMock.user.findFirst.mockResolvedValue({
      ...BASE_USER,
      lockedUntil: new Date(Date.now() - 60 * 1000),
    });
    bcryptMock.compare.mockResolvedValue(true);

    const req = buildLoginReq();
    const res = createMockRes();

    await login(req, res);

    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { lockedUntil: null },
    });
    expect(res.status).not.toHaveBeenCalledWith(423);
  });
});

describe('GET /users/me/login-history', () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns the current user's last 50 attempts, newest first, without IP/user agent", async () => {
    const history = [
      { id: 2, success: true, failureReason: null, createdAt: new Date() },
      { id: 1, success: false, failureReason: 'invalid_password', createdAt: new Date() },
    ];
    prismaMock.loginHistory.findMany.mockResolvedValue(history);

    const req = { user: { userId: 1 } };
    const res = createMockRes();

    await userController.getMyLoginHistory(req, res);

    expect(prismaMock.loginHistory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 1 },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    );
    const selectArg = prismaMock.loginHistory.findMany.mock.calls[0][0].select;
    expect(selectArg.ipAddress).toBeUndefined();
    expect(selectArg.userAgent).toBeUndefined();
    expect(res.body.data).toEqual(history);
  });
});

describe('GET /admin/users/:id/login-history', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns full history including IP + user agent for admins', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 1, email: 'user@example.com' });
    const history = [
      { id: 1, success: true, ipAddress: '1.2.3.4', userAgent: 'curl/8', createdAt: new Date() },
    ];
    prismaMock.loginHistory.findMany.mockResolvedValue(history);
    prismaMock.loginHistory.count.mockResolvedValue(1);
    prismaMock.$transaction.mockResolvedValue([history, 1]);

    const req = { params: { id: '1' }, query: {} };
    const res = createMockRes();

    await adminController.getUserLoginHistory(req, res);

    expect(res.body.data).toEqual(history);
    expect(res.body.total).toBe(1);
  });

  it('returns 404 for a non-existent user', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    const req = { params: { id: '999' }, query: {} };
    const res = createMockRes();

    await adminController.getUserLoginHistory(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});
