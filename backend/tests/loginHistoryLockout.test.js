import { jest } from '@jest/globals';

const prismaMock = {
  user: { findFirst: jest.fn(), findUnique: jest.fn() },
  loginHistory: { create: jest.fn(), findMany: jest.fn(), count: jest.fn() },
  loginLockout: { findUnique: jest.fn(), upsert: jest.fn() },
  $transaction: jest.fn(async (ops) => Promise.all(ops)),
};

const verifyMock = jest.fn();
const keypairMock = { verify: verifyMock };

const sessionServiceMock = { recordSession: jest.fn(async () => {}) };
const mfaServiceMock = { requiresMfa: jest.fn(async () => false) };
const emailServiceMock = { notifyLoginLockout: jest.fn(async () => ({ queued: 1 })) };

jest.unstable_mockModule('../lib/prisma.js', () => ({ default: prismaMock }));
jest.unstable_mockModule('@stellar/stellar-sdk', () => ({
  Keypair: { fromPublicKey: jest.fn(() => keypairMock) },
  StrKey: { isValidEd25519PublicKey: jest.fn(() => true) },
}));
jest.unstable_mockModule('../services/sessionService.js', () => ({ default: sessionServiceMock }));
jest.unstable_mockModule('../services/mfaService.js', () => ({ default: mfaServiceMock }));
jest.unstable_mockModule('../config/secrets.js', () => ({
  JWT_SECRET: 'test-jwt-secret',
  JWT_ALGORITHM: 'HS256',
}));
jest.unstable_mockModule('../lib/deviceName.js', () => ({
  deviceNameFromUserAgent: jest.fn(() => 'Test Device'),
}));
jest.unstable_mockModule('../services/emailService.js', () => ({ default: emailServiceMock }));
// Pre-existing gap in devdave/develop: adminController.js imports this file but it
// doesn't exist in the repo. Mock it so importing adminController.js doesn't blow up.
jest.unstable_mockModule('../services/keyRotationService.js', () => ({
  default: { rotateKey: jest.fn(), getValidPublicKeys: jest.fn(async () => []) },
}));

const { getNonce, verifySignatureAndLogin } = await import('../api/controllers/authController.js');
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

const ADDRESS = `G${'A'.repeat(55)}`;

function buildReq(overrides = {}) {
  return {
    body: {},
    headers: { 'user-agent': 'jest-test-agent' },
    socket: { remoteAddress: '127.0.0.1' },
    tenant: { id: 'test-tenant-id' },
    ...overrides,
  };
}

/** Runs getNonce for ADDRESS so verifySignatureAndLogin has a pending challenge. */
async function seedNonce() {
  const res = createMockRes();
  await getNonce(buildReq({ body: { address: ADDRESS } }), res);
}

describe('verifySignatureAndLogin — login history + lockout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.loginLockout.findUnique.mockResolvedValue(null);
    prismaMock.loginHistory.findMany.mockResolvedValue([]);
    prismaMock.user.findFirst.mockResolvedValue(null);
  });

  it('records a successful login attempt', async () => {
    await seedNonce();
    verifyMock.mockReturnValue(true);

    const req = buildReq({ body: { address: ADDRESS, signature: 'c2ln' } });
    const res = createMockRes();

    await verifySignatureAndLogin(req, res);

    expect(prismaMock.loginHistory.create).toHaveBeenCalledWith({
      data: {
        tenantId: 'test-tenant-id',
        address: ADDRESS,
        ipAddress: '127.0.0.1',
        userAgent: 'jest-test-agent',
        success: true,
        failureReason: null,
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body.address).toBe(ADDRESS);
  });

  it('records a failed attempt when signature verification fails', async () => {
    await seedNonce();
    verifyMock.mockReturnValue(false);

    const req = buildReq({ body: { address: ADDRESS, signature: 'bad-sig' } });
    const res = createMockRes();

    await verifySignatureAndLogin(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(prismaMock.loginHistory.create).toHaveBeenCalledWith({
      data: {
        tenantId: 'test-tenant-id',
        address: ADDRESS,
        ipAddress: '127.0.0.1',
        userAgent: 'jest-test-agent',
        success: false,
        failureReason: 'invalid_signature',
      },
    });
  });

  it('records a failed attempt when there is no pending nonce', async () => {
    // No seedNonce() call — nothing pending for this address.
    const req = buildReq({ body: { address: ADDRESS, signature: 'c2ln' } });
    const res = createMockRes();

    await verifySignatureAndLogin(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(prismaMock.loginHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ failureReason: 'no_pending_nonce' }) }),
    );
  });

  it('locks the address and sends an alert email after 5 consecutive failures', async () => {
    await seedNonce();
    verifyMock.mockReturnValue(false);
    // 4 prior consecutive failures + the one just recorded = 5
    prismaMock.loginHistory.findMany.mockResolvedValue([
      { success: false },
      { success: false },
      { success: false },
      { success: false },
      { success: false },
    ]);
    prismaMock.user.findFirst.mockResolvedValue({ email: 'user@example.com' });

    const req = buildReq({ body: { address: ADDRESS, signature: 'bad-sig' } });
    const res = createMockRes();

    await verifySignatureAndLogin(req, res);

    expect(prismaMock.loginLockout.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId_address: { tenantId: 'test-tenant-id', address: ADDRESS } },
        create: expect.objectContaining({ tenantId: 'test-tenant-id', address: ADDRESS }),
      }),
    );
    expect(emailServiceMock.notifyLoginLockout).toHaveBeenCalledTimes(1);
  });

  it('does not lock the address before 5 consecutive failures', async () => {
    await seedNonce();
    verifyMock.mockReturnValue(false);
    prismaMock.loginHistory.findMany.mockResolvedValue([
      { success: false },
      { success: false },
    ]);

    const req = buildReq({ body: { address: ADDRESS, signature: 'bad-sig' } });
    const res = createMockRes();

    await verifySignatureAndLogin(req, res);

    expect(prismaMock.loginLockout.upsert).not.toHaveBeenCalled();
    expect(emailServiceMock.notifyLoginLockout).not.toHaveBeenCalled();
  });

  it('rejects login with 423 while the address is locked, without checking the signature', async () => {
    prismaMock.loginLockout.findUnique.mockResolvedValue({
      tenantId: 'test-tenant-id',
      address: ADDRESS,
      lockedUntil: new Date(Date.now() + 10 * 60 * 1000),
    });

    const req = buildReq({ body: { address: ADDRESS, signature: 'c2ln' } });
    const res = createMockRes();

    await verifySignatureAndLogin(req, res);

    expect(res.status).toHaveBeenCalledWith(423);
    expect(verifyMock).not.toHaveBeenCalled();
    expect(prismaMock.loginHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ failureReason: 'account_locked' }) }),
    );
  });

  it('allows login once a past lockout has expired', async () => {
    prismaMock.loginLockout.findUnique.mockResolvedValue({
      tenantId: 'test-tenant-id',
      address: ADDRESS,
      lockedUntil: new Date(Date.now() - 60 * 1000),
    });
    await seedNonce();
    verifyMock.mockReturnValue(true);

    const req = buildReq({ body: { address: ADDRESS, signature: 'c2ln' } });
    const res = createMockRes();

    await verifySignatureAndLogin(req, res);

    expect(res.status).not.toHaveBeenCalledWith(423);
    expect(res.statusCode).toBe(200);
  });
});

describe('GET /users/me/login-history', () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns the current user's login history keyed by address, without IP/user agent", async () => {
    const history = [
      { id: 2, success: true, failureReason: null, createdAt: new Date() },
      { id: 1, success: false, failureReason: 'invalid_signature', createdAt: new Date() },
    ];
    prismaMock.loginHistory.findMany.mockResolvedValue(history);

    const req = { user: { address: ADDRESS } };
    const res = createMockRes();

    await userController.getMyLoginHistory(req, res);

    expect(prismaMock.loginHistory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { address: ADDRESS },
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

describe('GET /admin/users/:address/login-history', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns full history including IP + user agent for admins', async () => {
    const history = [
      { id: 1, success: true, ipAddress: '1.2.3.4', userAgent: 'curl/8', createdAt: new Date() },
    ];
    prismaMock.loginHistory.findMany.mockResolvedValue(history);
    prismaMock.loginHistory.count.mockResolvedValue(1);
    prismaMock.$transaction.mockResolvedValue([history, 1]);

    const req = { params: { address: ADDRESS }, query: {} };
    const res = createMockRes();

    await adminController.getUserLoginHistory(req, res);

    expect(res.body.data).toEqual(history);
    expect(res.body.total).toBe(1);
  });
});
