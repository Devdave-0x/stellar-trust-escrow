/**
 * Integration Tests — Auth Endpoints
 *
 * Covers the four public auth routes mounted at /api/auth:
 *
 *   POST /api/auth/nonce    — request a challenge nonce (analogous to "register")
 *   POST /api/auth/verify   — submit signed nonce, receive JWT  (analogous to "login")
 *   POST /api/auth/refresh  — rotate an access token  (refresh flow)
 *   POST /api/auth/logout   — revoke the current session
 *
 * Note: This system uses Stellar wallet-based challenge/response authentication,
 * not email/password. There is no dedicated "register" endpoint — a new wallet
 * is recognised automatically on its first successful /verify call.
 * The tests labelled "register" therefore exercise the /nonce endpoint
 * (which is the first step of the auth flow for any address, new or returning).
 *
 * Rate limiting: the gateway's perUserRateLimiter is intentionally disabled
 * in NODE_ENV=test. Consecutive-failure lockout (5 failures → 423 for 15 min)
 * is enforced by the authController itself through the loginHistoryLockout path.
 */

import { jest } from '@jest/globals';
import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { validate } from '../middleware/zodValidate.js';
import { nonceSchema, verifySchema, refreshSchema } from '../../shared/schemas/auth.js';

// ── Constants ─────────────────────────────────────────────────────────────────

// A valid 56-character Stellar public-key address (G + 55 base32 chars)
const VALID_ADDRESS = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
const OTHER_ADDRESS = 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN';

const JWT_SECRET = 'integration-test-secret';
const JWT_ALGORITHM = 'HS256';

process.env.JWT_SECRET = JWT_SECRET;
process.env.JWT_ACCESS_SECRET = JWT_SECRET;
process.env.NODE_ENV = 'test';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const prismaMock = {
  loginHistory: { create: jest.fn(async () => ({})), findMany: jest.fn(async () => []) },
  loginLockout: { findUnique: jest.fn(async () => null), upsert: jest.fn(async () => ({})) },
  user: { findFirst: jest.fn(async () => null) },
};

const sessionServiceMock = {
  recordSession: jest.fn(async () => {}),
  isSessionValid: jest.fn(async () => true),
  revokeSessionByJti: jest.fn(async () => {}),
  touchSession: jest.fn(async () => {}),
};

const mfaServiceMock = { requiresMfa: jest.fn(async () => false) };
const emailServiceMock = { notifyLoginLockout: jest.fn(async () => ({ queued: 1 })) };
const keypairMock = { verify: jest.fn() };

jest.unstable_mockModule('../lib/prisma.js', () => ({ default: prismaMock }));
jest.unstable_mockModule('../services/sessionService.js', () => ({ default: sessionServiceMock }));
jest.unstable_mockModule('../services/mfaService.js', () => ({ default: mfaServiceMock }));
jest.unstable_mockModule('../services/emailService.js', () => ({ default: emailServiceMock }));
jest.unstable_mockModule('../config/secrets.js', () => ({
  JWT_SECRET,
  JWT_ALGORITHM,
}));
jest.unstable_mockModule('../lib/deviceName.js', () => ({
  deviceNameFromUserAgent: jest.fn(() => 'Test Browser'),
}));
jest.unstable_mockModule('@stellar/stellar-sdk', () => ({
  Keypair: { fromPublicKey: jest.fn(() => keypairMock) },
  StrKey: { isValidEd25519PublicKey: jest.fn((addr) => /^G[A-Z2-7]{55}$/.test(addr)) },
}));

// ── Import routes after mocks are in place ────────────────────────────────────

const { default: authController } = await import('../api/controllers/authController.js');

// ── App factory ───────────────────────────────────────────────────────────────

function buildApp() {
  const app = express();
  app.use(express.json());

  // Minimal tenant middleware — sets req.tenant so lockout paths work
  app.use((req, _res, next) => {
    req.tenant = { id: 'test-tenant' };
    next();
  });

  // Mount routes the same way server.js does (with Zod validation guards)
  app.post('/api/auth/nonce', validate(nonceSchema), authController.getNonce);
  app.post('/api/auth/verify', validate(verifySchema), authController.verifySignatureAndLogin);
  app.post('/api/auth/refresh', authController.refreshToken);
  app.post('/api/auth/logout', authController.logout);

  return app;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Hit /nonce and return the nonce response body. */
async function getNonce(app, address = VALID_ADDRESS) {
  const res = await request(app).post('/api/auth/nonce').send({ address });
  return res;
}

/** Sign a challenge message and call /verify. */
async function verify(app, { address = VALID_ADDRESS, signatureValid = true } = {}) {
  // First request a nonce
  const nonceRes = await getNonce(app, address);
  if (nonceRes.status !== 200) return nonceRes;

  keypairMock.verify.mockReturnValueOnce(signatureValid);

  return request(app).post('/api/auth/verify').send({
    address,
    nonce: nonceRes.body.nonce,
    signature: signatureValid ? 'dmFsaWRzaWc=' : 'aW52YWxpZA==',
  });
}

/** Issue a real JWT for use in refresh / logout tests. */
function makeToken(payload = {}) {
  return jwt.sign(
    { address: VALID_ADDRESS, jti: 'test-jti-123', ...payload },
    JWT_SECRET,
    { algorithm: JWT_ALGORITHM, expiresIn: '1h' },
  );
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  prismaMock.loginLockout.findUnique.mockResolvedValue(null);
  prismaMock.loginHistory.findMany.mockResolvedValue([]);
  prismaMock.user.findFirst.mockResolvedValue(null);
  sessionServiceMock.isSessionValid.mockResolvedValue(true);
  mfaServiceMock.requiresMfa.mockResolvedValue(false);
});

// ══════════════════════════════════════════════════════════════════════════════
// 1. POST /api/auth/nonce  (analogous to "register" — first step of auth flow)
// ══════════════════════════════════════════════════════════════════════════════

describe('POST /api/auth/nonce', () => {
  it('returns a nonce challenge for a valid Stellar address', async () => {
    const app = buildApp();
    const res = await request(app).post('/api/auth/nonce').send({ address: VALID_ADDRESS });

    expect(res.status).toBe(200);
    expect(res.body.nonce).toBeDefined();
    expect(typeof res.body.nonce).toBe('string');
    expect(res.body.nonce.length).toBeGreaterThan(0);
    expect(res.body.message).toBeDefined();
    expect(res.body.address).toBe(VALID_ADDRESS);
    expect(res.body.expiresIn).toBeDefined();
  });

  it('includes the wallet address in the challenge message', async () => {
    const app = buildApp();
    const res = await request(app).post('/api/auth/nonce').send({ address: VALID_ADDRESS });

    expect(res.status).toBe(200);
    expect(res.body.message).toContain(VALID_ADDRESS);
  });

  it('generates a unique nonce for each request', async () => {
    const app = buildApp();
    const res1 = await request(app).post('/api/auth/nonce').send({ address: VALID_ADDRESS });
    // Allow the first nonce to expire so we can request a second one for a different address
    const res2 = await request(app).post('/api/auth/nonce').send({ address: OTHER_ADDRESS });

    expect(res1.body.nonce).not.toBe(res2.body.nonce);
  });

  it('returns 400 for a missing address', async () => {
    const app = buildApp();
    const res = await request(app).post('/api/auth/nonce').send({});

    expect(res.status).toBe(400);
  });

  it('returns 400 for an invalid (non-Stellar) address', async () => {
    const app = buildApp();
    const res = await request(app).post('/api/auth/nonce').send({ address: 'invalid-address' });

    expect(res.status).toBe(400);
  });

  it('returns 400 for an address that is too short', async () => {
    const app = buildApp();
    const res = await request(app).post('/api/auth/nonce').send({ address: 'GSHORT' });

    expect(res.status).toBe(400);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. POST /api/auth/verify  (analogous to "login")
// ══════════════════════════════════════════════════════════════════════════════

describe('POST /api/auth/verify — valid credentials (correct signature)', () => {
  it('returns a JWT access token on successful signature verification', async () => {
    const app = buildApp();
    const res = await verify(app, { signatureValid: true });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(typeof res.body.token).toBe('string');
    expect(res.body.address).toBe(VALID_ADDRESS);
  });

  it('returns the wallet address and expiry in the response body', async () => {
    const app = buildApp();
    const res = await verify(app, { signatureValid: true });

    expect(res.status).toBe(200);
    expect(res.body.address).toBe(VALID_ADDRESS);
    expect(res.body.expiresIn).toBeDefined();
  });

  it('issues a verifiable JWT signed with the correct secret', async () => {
    const app = buildApp();
    const res = await verify(app, { signatureValid: true });

    expect(res.status).toBe(200);
    const decoded = jwt.verify(res.body.token, JWT_SECRET);
    expect(decoded.address).toBe(VALID_ADDRESS);
  });

  it('records a successful login attempt in login history', async () => {
    const app = buildApp();
    await verify(app, { signatureValid: true });

    expect(prismaMock.loginHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'test-tenant',
          address: VALID_ADDRESS,
          success: true,
        }),
      }),
    );
  });
});

describe('POST /api/auth/verify — wrong / invalid signature (analogous to wrong password)', () => {
  it('returns 401 when signature verification fails', async () => {
    const app = buildApp();
    const res = await verify(app, { signatureValid: false });

    expect(res.status).toBe(401);
    expect(res.body.error).toBeDefined();
  });

  it('records a failed login attempt in login history', async () => {
    const app = buildApp();
    await verify(app, { signatureValid: false });

    expect(prismaMock.loginHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'test-tenant',
          address: VALID_ADDRESS,
          success: false,
          failureReason: 'invalid_signature',
        }),
      }),
    );
  });

  it('returns 401 when there is no pending nonce for the address', async () => {
    const app = buildApp();
    keypairMock.verify.mockReturnValueOnce(true);

    // Send verify without requesting a nonce first
    const res = await request(app).post('/api/auth/verify').send({
      address: VALID_ADDRESS,
      nonce: 'nonexistent-nonce',
      signature: 'c29tZXNpZw==',
    });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/no pending nonce/i);
  });

  it('returns 400 when the signature field is missing', async () => {
    const app = buildApp();
    await getNonce(app);

    const res = await request(app).post('/api/auth/verify').send({
      address: VALID_ADDRESS,
      nonce: 'some-nonce',
      // signature intentionally omitted
    });

    // Zod validation layer rejects missing signature
    expect(res.status).toBe(400);
  });

  it('returns 400 when the address field is missing', async () => {
    const app = buildApp();
    const res = await request(app).post('/api/auth/verify').send({
      nonce: 'some-nonce',
      signature: 'c29tZXNpZw==',
    });

    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/verify — non-existent / new address (analogous to non-existent user)', () => {
  it('returns 401 for an address with no pending nonce (treated as unknown wallet)', async () => {
    const app = buildApp();
    // No prior /nonce call — nonce store has nothing for this address
    keypairMock.verify.mockReturnValueOnce(true);

    const res = await request(app).post('/api/auth/verify').send({
      address: OTHER_ADDRESS,
      nonce: 'made-up-nonce',
      signature: 'dmFsaWRzaWc=',
    });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/no pending nonce|request a new one/i);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 3. POST /api/auth/refresh
// ══════════════════════════════════════════════════════════════════════════════

describe('POST /api/auth/refresh — valid token', () => {
  it('issues a new access token when a valid Bearer token is presented', async () => {
    const app = buildApp();
    const token = makeToken();
    sessionServiceMock.isSessionValid.mockResolvedValue(true);

    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.token).not.toBe(token); // must be a new token
    expect(res.body.address).toBe(VALID_ADDRESS);
  });

  it('new token is verifiable with the same JWT secret', async () => {
    const app = buildApp();
    const token = makeToken();

    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const decoded = jwt.verify(res.body.token, JWT_SECRET);
    expect(decoded.address).toBe(VALID_ADDRESS);
  });

  it('revokes the old session JTI and creates a new one', async () => {
    const app = buildApp();
    const token = makeToken({ jti: 'old-jti' });
    sessionServiceMock.isSessionValid.mockResolvedValue(true);

    await request(app)
      .post('/api/auth/refresh')
      .set('Authorization', `Bearer ${token}`);

    expect(sessionServiceMock.revokeSessionByJti).toHaveBeenCalledWith('old-jti');
    expect(sessionServiceMock.recordSession).toHaveBeenCalled();
  });
});

describe('POST /api/auth/refresh — expired token', () => {
  it('returns 401 when the token is expired', async () => {
    const app = buildApp();
    const expiredToken = jwt.sign(
      { address: VALID_ADDRESS, jti: 'expired-jti' },
      JWT_SECRET,
      { algorithm: JWT_ALGORITHM, expiresIn: '-1h' }, // expired 1 hour ago
    );

    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Authorization', `Bearer ${expiredToken}`);

    expect(res.status).toBe(401);
    expect(res.body.error).toBeDefined();
  });

  it('returns 401 when the token is malformed', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Authorization', 'Bearer this.is.not.a.valid.token');

    expect(res.status).toBe(401);
    expect(res.body.error).toBeDefined();
  });

  it('returns 401 when no Authorization header is present', async () => {
    const app = buildApp();
    const res = await request(app).post('/api/auth/refresh');

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Bearer token required/i);
  });

  it('returns 401 when the session has been revoked', async () => {
    const app = buildApp();
    const token = makeToken({ jti: 'revoked-jti' });
    // Simulate revoked session
    sessionServiceMock.isSessionValid.mockResolvedValueOnce(false);

    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/revoked|expired/i);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 4. POST /api/auth/logout
// ══════════════════════════════════════════════════════════════════════════════

describe('POST /api/auth/logout', () => {
  it('returns { ok: true } and clears the session when a valid Bearer token is provided', async () => {
    const app = buildApp();
    const token = makeToken({ jti: 'session-to-revoke' });

    const res = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    // Session should be revoked
    expect(sessionServiceMock.revokeSessionByJti).toHaveBeenCalledWith('session-to-revoke');
  });

  it('is idempotent — returns 200 even without an Authorization header', async () => {
    const app = buildApp();
    const res = await request(app).post('/api/auth/logout');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('is idempotent — returns 200 for an already-expired token', async () => {
    const app = buildApp();
    const expiredToken = jwt.sign(
      { address: VALID_ADDRESS, jti: 'exp-jti' },
      JWT_SECRET,
      { algorithm: JWT_ALGORITHM, expiresIn: '-1h' },
    );

    const res = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${expiredToken}`);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('is idempotent — returns 200 for a malformed token', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', 'Bearer bad-token-value');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 5. Set-Cookie headers
// ══════════════════════════════════════════════════════════════════════════════

describe('Set-Cookie headers', () => {
  it('/verify response does not set a session cookie (token is returned in JSON body)', async () => {
    // This system returns the JWT in the response body, not as a cookie.
    // Verify there is no Set-Cookie header on a successful verify.
    const app = buildApp();
    const res = await verify(app, { signatureValid: true });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    // Cookie-based sessions are not used; token is in the JSON body
    const cookie = res.headers['set-cookie'];
    // Either no cookie header at all, or no session-related cookie
    if (cookie) {
      const cookieStr = Array.isArray(cookie) ? cookie.join('; ') : cookie;
      expect(cookieStr).not.toMatch(/session|accessToken|refreshToken/i);
    }
  });

  it('/refresh response returns new token in JSON body (not via cookie)', async () => {
    const app = buildApp();
    const token = makeToken();

    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    const cookie = res.headers['set-cookie'];
    if (cookie) {
      const cookieStr = Array.isArray(cookie) ? cookie.join('; ') : cookie;
      expect(cookieStr).not.toMatch(/accessToken|refreshToken/i);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 6. Rate limiting — failed login lockout
// ══════════════════════════════════════════════════════════════════════════════

describe('Rate limiting — consecutive failure lockout', () => {
  it('returns 423 when the address is locked due to too many failed attempts', async () => {
    // Simulate an active lockout
    prismaMock.loginLockout.findUnique.mockResolvedValue({
      tenantId: 'test-tenant',
      address: VALID_ADDRESS,
      lockedUntil: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes from now
    });

    const app = buildApp();
    await getNonce(app);

    keypairMock.verify.mockReturnValueOnce(true);
    const res = await request(app).post('/api/auth/verify').send({
      address: VALID_ADDRESS,
      nonce: 'any-nonce',
      signature: 'dmFsaWRzaWc=',
    });

    expect(res.status).toBe(423);
    expect(res.body.error).toMatch(/locked|too many failed/i);
  });

  it('triggers an account lockout after 5 consecutive failures', async () => {
    const app = buildApp();
    // Simulate 5 consecutive failed records returned by the DB
    prismaMock.loginHistory.findMany.mockResolvedValue([
      { success: false },
      { success: false },
      { success: false },
      { success: false },
      { success: false },
    ]);
    prismaMock.user.findFirst.mockResolvedValue({ email: 'wallet@example.com' });

    await verify(app, { signatureValid: false });

    // loginLockout.upsert should be called to create/update the lockout record
    expect(prismaMock.loginLockout.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId_address: { tenantId: 'test-tenant', address: VALID_ADDRESS },
        },
      }),
    );
  });

  it('allows login once a lockout has expired', async () => {
    // Lockout expired in the past
    prismaMock.loginLockout.findUnique.mockResolvedValue({
      tenantId: 'test-tenant',
      address: VALID_ADDRESS,
      lockedUntil: new Date(Date.now() - 60 * 1000), // 1 minute ago
    });

    const app = buildApp();
    const res = await verify(app, { signatureValid: true });

    // Expired lockout is treated as no lockout — login should succeed
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
  });

  it('does not lock after fewer than 5 consecutive failures', async () => {
    const app = buildApp();
    // Only 3 previous failures
    prismaMock.loginHistory.findMany.mockResolvedValue([
      { success: false },
      { success: false },
      { success: false },
    ]);

    await verify(app, { signatureValid: false });

    expect(prismaMock.loginLockout.upsert).not.toHaveBeenCalled();
  });
});
