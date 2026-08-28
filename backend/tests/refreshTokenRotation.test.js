/**
 * JWT refresh/rotation — integration tests for authController.refreshToken
 *
 * The live auth flow (Stellar wallet-signature login) issues a single JWT
 * carrying a `jti` tracked server-side in `user_sessions` (services/sessionService.js).
 * "Refresh" re-verifies that JWT, revokes its session, and issues a brand-new
 * JWT + jti in its place — there is no separate access/refresh token pair or
 * token-family table in this codebase (services/refreshTokenService.js and
 * api/middleware/autoRefresh.js implement that, but neither is wired into any
 * route, so it's unreachable dead code today).
 *
 * These tests exercise the real refreshToken/logout/verifySignatureAndLogin
 * controller functions against a mocked sessionService (in-memory session
 * store), so session revocation actually takes effect between calls.
 */

import { jest } from '@jest/globals';
import jwt from 'jsonwebtoken';

const JWT_SECRET = 'test-jwt-secret';
const JWT_ALGORITHM = 'HS256';

const prismaMock = {
  loginHistory: { create: jest.fn(async () => {}) },
  loginLockout: { findUnique: jest.fn(async () => null) },
  user: { findFirst: jest.fn(async () => null) },
};

// In-memory stand-in for the `user_sessions` table, keyed by jti.
const sessions = new Map();
const sessionServiceMock = {
  recordSession: jest.fn(async ({ jti }) => {
    sessions.set(jti, true);
  }),
  isSessionValid: jest.fn(async (jti) => sessions.has(jti)),
  revokeSessionByJti: jest.fn(async (jti) => {
    sessions.delete(jti);
  }),
};

const verifyMock = jest.fn(() => true);
const keypairMock = { verify: verifyMock };

jest.unstable_mockModule('../lib/prisma.js', () => ({ default: prismaMock }));
jest.unstable_mockModule('@stellar/stellar-sdk', () => ({
  Keypair: { fromPublicKey: jest.fn(() => keypairMock) },
  StrKey: { isValidEd25519PublicKey: jest.fn(() => true) },
}));
jest.unstable_mockModule('../services/sessionService.js', () => ({ default: sessionServiceMock }));
jest.unstable_mockModule('../services/mfaService.js', () => ({
  default: { requiresMfa: jest.fn(async () => false) },
}));
jest.unstable_mockModule('../config/secrets.js', () => ({ JWT_SECRET, JWT_ALGORITHM }));
jest.unstable_mockModule('../lib/deviceName.js', () => ({
  deviceNameFromUserAgent: jest.fn(() => 'Test Device'),
}));
jest.unstable_mockModule('../services/emailService.js', () => ({
  default: { notifyLoginLockout: jest.fn(async () => ({ queued: 0 })) },
}));

const { getNonce, verifySignatureAndLogin, refreshToken, logout } =
  await import('../api/controllers/authController.js');

const ADDRESS = `G${'A'.repeat(55)}`;

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

function buildReq(overrides = {}) {
  return {
    body: {},
    headers: { 'user-agent': 'jest-test-agent' },
    socket: { remoteAddress: '127.0.0.1' },
    tenant: { id: 'test-tenant-id' },
    ...overrides,
  };
}

/** Logs in ADDRESS via the real challenge/response flow and returns the issued JWT. */
async function login() {
  await getNonce(buildReq({ body: { address: ADDRESS } }), createMockRes());
  const res = createMockRes();
  await verifySignatureAndLogin(buildReq({ body: { address: ADDRESS, signature: 'c2ln' } }), res);
  return res.body.token;
}

describe('authController.refreshToken', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessions.clear();
    verifyMock.mockReturnValue(true);
  });

  it('rotates a valid token: issues a new token and invalidates the old session', async () => {
    const oldToken = await login();
    const oldJti = jwt.decode(oldToken).jti;
    expect(sessions.has(oldJti)).toBe(true);

    const res = createMockRes();
    await refreshToken(buildReq({ headers: { authorization: `Bearer ${oldToken}` } }), res);

    expect(res.statusCode).toBe(200);
    const newToken = res.body.token;
    expect(newToken).toBeDefined();
    expect(newToken).not.toBe(oldToken);

    const newJti = jwt.decode(newToken).jti;
    expect(newJti).not.toBe(oldJti);
    expect(sessions.has(oldJti)).toBe(false);
    expect(sessions.has(newJti)).toBe(true);
  });

  it('rejects reuse of a token whose session was already rotated away (401)', async () => {
    const oldToken = await login();

    await refreshToken(
      buildReq({ headers: { authorization: `Bearer ${oldToken}` } }),
      createMockRes(),
    );

    // Same (still cryptographically valid, unexpired) token used again.
    const res = createMockRes();
    await refreshToken(buildReq({ headers: { authorization: `Bearer ${oldToken}` } }), res);

    expect(res.statusCode).toBe(401);
  });

  it('rejects a refresh attempt for a session already revoked via logout (401)', async () => {
    const token = await login();

    await logout(buildReq({ headers: { authorization: `Bearer ${token}` } }), createMockRes());

    const res = createMockRes();
    await refreshToken(buildReq({ headers: { authorization: `Bearer ${token}` } }), res);

    expect(res.statusCode).toBe(401);
  });

  it('rejects an expired token (401)', async () => {
    const expired = jwt.sign({ address: ADDRESS, jti: 'expired-jti' }, JWT_SECRET, {
      algorithm: JWT_ALGORITHM,
      expiresIn: '-1h',
    });

    const res = createMockRes();
    await refreshToken(buildReq({ headers: { authorization: `Bearer ${expired}` } }), res);

    expect(res.statusCode).toBe(401);
  });

  it('rejects a malformed/invalid token (401)', async () => {
    const res = createMockRes();
    await refreshToken(buildReq({ headers: { authorization: 'Bearer not-a-real-jwt' } }), res);

    expect(res.statusCode).toBe(401);
  });

  it('rejects a request with no bearer token (401)', async () => {
    const res = createMockRes();
    await refreshToken(buildReq(), res);

    expect(res.statusCode).toBe(401);
  });
});
