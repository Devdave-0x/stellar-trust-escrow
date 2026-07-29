/**
 * Tests for lib/jwt.js
 *
 * Covers:
 *  - Token generation (access, refresh, access_secret)
 *  - Successful verification
 *  - Expired token rejection
 *  - Wrong-secret rejection
 *  - Malformed token rejection
 *  - Payload round-trip (all fields survive sign/verify)
 *  - Refresh token uses a different secret than access token
 *  - Clock-based expiry boundary conditions
 */

import { jest } from '@jest/globals';
import jwt from 'jsonwebtoken';
import { signToken, verifyToken, decodeToken } from '../lib/jwt.js';
import { JWT_ALGORITHM } from '../config/secrets.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Generate a distinct secret that is unlikely to collide with the test env secrets. */
function rndSecret() {
  return `test-secret-${Math.random().toString(36).slice(2)}`;
}

// ── signToken ─────────────────────────────────────────────────────────────────

describe('signToken', () => {
  it('returns a string', () => {
    const secret = rndSecret();
    const token = signToken({ sub: 'user1' }, { secret });
    expect(typeof token).toBe('string');
  });

  it('produces a three-part JWT (header.payload.signature)', () => {
    const secret = rndSecret();
    const token = signToken({ sub: 'user1' }, { secret });
    expect(token.split('.')).toHaveLength(3);
  });

  it('uses HS256 as the signing algorithm', () => {
    const secret = rndSecret();
    const token = signToken({ sub: 'user1' }, { secret });
    const header = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString());
    expect(header.alg).toBe('HS256');
  });

  it('embeds exp claim matching the requested expiresIn', () => {
    const secret = rndSecret();
    const before = Math.floor(Date.now() / 1000);
    const token = signToken({ sub: 'u' }, { secret, expiresIn: '1h' });
    const decoded = jwt.decode(token);
    const after = Math.floor(Date.now() / 1000);
    // exp should be ~3600 s in the future
    expect(decoded.exp).toBeGreaterThanOrEqual(before + 3598);
    expect(decoded.exp).toBeLessThanOrEqual(after + 3602);
  });

  it('embeds iat claim close to current time', () => {
    const secret = rndSecret();
    const before = Math.floor(Date.now() / 1000);
    const token = signToken({ sub: 'u' }, { secret });
    const decoded = jwt.decode(token);
    const after = Math.floor(Date.now() / 1000);
    expect(decoded.iat).toBeGreaterThanOrEqual(before - 1);
    expect(decoded.iat).toBeLessThanOrEqual(after + 1);
  });

  it('signs access type tokens with JWT_SECRET by default', () => {
    // Sign with default type then verify with same secret via the module
    const token = signToken({ address: 'GTEST' }, { type: 'access', expiresIn: '1m' });
    // verifyToken should not throw
    expect(() => verifyToken(token, { type: 'access' })).not.toThrow();
  });

  it('signs refresh tokens with a different secret than access tokens', () => {
    const accessToken = signToken({ address: 'GTEST' }, { type: 'access', expiresIn: '1m' });
    const refreshToken = signToken({ address: 'GTEST' }, { type: 'refresh', expiresIn: '7d' });
    // Verifying an access token with the refresh type key must fail
    expect(() => verifyToken(accessToken, { type: 'refresh' })).toThrow();
    // Verifying a refresh token with the access type key must fail
    expect(() => verifyToken(refreshToken, { type: 'access' })).toThrow();
  });

  it('signs access_secret tokens with a different secret than access tokens', () => {
    const accessToken = signToken({ address: 'GTEST' }, { type: 'access', expiresIn: '1m' });
    const wsToken = signToken({ address: 'GTEST' }, { type: 'access_secret', expiresIn: '5m' });
    expect(() => verifyToken(accessToken, { type: 'access_secret' })).toThrow();
    expect(() => verifyToken(wsToken, { type: 'access' })).toThrow();
  });
});

// ── verifyToken — success ─────────────────────────────────────────────────────

describe('verifyToken — success', () => {
  it('returns the decoded payload on a valid token', () => {
    const secret = rndSecret();
    const token = signToken({ address: 'GA...', role: 'admin' }, { secret, expiresIn: '1h' });
    const payload = verifyToken(token, { secret });
    expect(payload.address).toBe('GA...');
    expect(payload.role).toBe('admin');
  });

  it('payload round-trip: all custom fields are readable after verify', () => {
    const secret = rndSecret();
    const claims = {
      address: 'GBHELLOWORLD1234567890',
      jti: 'abc-123',
      tier: 'premium',
      tenantId: 'tenant-99',
      extra: { nested: true },
    };
    const token = signToken(claims, { secret, expiresIn: '1h' });
    const result = verifyToken(token, { secret });
    expect(result.address).toBe(claims.address);
    expect(result.jti).toBe(claims.jti);
    expect(result.tier).toBe(claims.tier);
    expect(result.tenantId).toBe(claims.tenantId);
    expect(result.extra).toEqual(claims.extra);
  });

  it('returns standard JWT claims (iat, exp) alongside custom claims', () => {
    const secret = rndSecret();
    const token = signToken({ sub: 'u1' }, { secret, expiresIn: '30m' });
    const result = verifyToken(token, { secret });
    expect(typeof result.iat).toBe('number');
    expect(typeof result.exp).toBe('number');
    expect(result.exp).toBeGreaterThan(result.iat);
  });
});

// ── verifyToken — rejection ───────────────────────────────────────────────────

describe('verifyToken — rejection', () => {
  it('throws TokenExpiredError for an expired token', () => {
    const secret = rndSecret();
    // Issue a token with -1s expiry (already in the past)
    const token = jwt.sign({ sub: 'u' }, secret, {
      algorithm: JWT_ALGORITHM,
      expiresIn: -1,
    });
    expect(() => verifyToken(token, { secret })).toThrow(
      expect.objectContaining({ name: 'TokenExpiredError' }),
    );
  });

  it('throws JsonWebTokenError for a wrong secret', () => {
    const secret = rndSecret();
    const wrongSecret = rndSecret();
    const token = signToken({ sub: 'u' }, { secret, expiresIn: '1h' });
    expect(() => verifyToken(token, { secret: wrongSecret })).toThrow(
      expect.objectContaining({ name: 'JsonWebTokenError' }),
    );
  });

  it('throws JsonWebTokenError for a tampered payload', () => {
    const secret = rndSecret();
    const token = signToken({ sub: 'u', role: 'user' }, { secret, expiresIn: '1h' });
    const [h, , s] = token.split('.');
    const tamperedPayload = Buffer.from(
      JSON.stringify({ sub: 'u', role: 'admin' }),
    ).toString('base64url');
    const tampered = `${h}.${tamperedPayload}.${s}`;
    expect(() => verifyToken(tampered, { secret })).toThrow(
      expect.objectContaining({ name: 'JsonWebTokenError' }),
    );
  });

  it('throws JsonWebTokenError for a completely malformed string', () => {
    expect(() => verifyToken('not.a.jwt', { secret: rndSecret() })).toThrow(
      expect.objectContaining({ name: 'JsonWebTokenError' }),
    );
  });

  it('throws for an empty string', () => {
    expect(() => verifyToken('', { secret: rndSecret() })).toThrow();
  });

  it('throws for a token with only two parts', () => {
    expect(() => verifyToken('header.payload', { secret: rndSecret() })).toThrow();
  });
});

// ── Expiry boundary conditions (mocked clock) ─────────────────────────────────

describe('expiry boundary conditions', () => {
  const secret = rndSecret();

  it('token is valid one second before expiry', () => {
    // Issue token expiring in 2 seconds, then advance clock by 1 second
    const token = signToken({ sub: 'boundary' }, { secret, expiresIn: 2 });
    // Manually verify with clockTolerance to simulate time passing
    const nowAt1s = Math.floor(Date.now() / 1000) + 1;
    // clockTimestamp lets us simulate the verifier being 1s in the future
    expect(() =>
      jwt.verify(token, secret, { algorithms: [JWT_ALGORITHM], clockTimestamp: nowAt1s }),
    ).not.toThrow();
  });

  it('token is invalid one second after expiry', () => {
    // expiresIn: 1 second, then advance verifier clock by 2 seconds
    const token = signToken({ sub: 'boundary' }, { secret, expiresIn: 1 });
    const nowAt2s = Math.floor(Date.now() / 1000) + 2;
    expect(() =>
      jwt.verify(token, secret, { algorithms: [JWT_ALGORITHM], clockTimestamp: nowAt2s }),
    ).toThrow(expect.objectContaining({ name: 'TokenExpiredError' }));
  });

  it('nbf claim: token is not yet valid before its notBefore time', () => {
    // Issue a token that becomes valid 60 seconds from now
    const nbfToken = jwt.sign({ sub: 'nbf-test' }, secret, {
      algorithm: JWT_ALGORITHM,
      expiresIn: '1h',
      notBefore: 60, // valid in 60 s
    });
    // Try to verify immediately — should throw NotBeforeError
    expect(() => verifyToken(nbfToken, { secret })).toThrow(
      expect.objectContaining({ name: 'NotBeforeError' }),
    );
  });
});

// ── decodeToken ───────────────────────────────────────────────────────────────

describe('decodeToken', () => {
  it('decodes without verifying (returns payload even with wrong secret context)', () => {
    const secret = rndSecret();
    const token = signToken({ address: 'GDECODE', jti: 'xyz' }, { secret, expiresIn: '1h' });
    const decoded = decodeToken(token);
    expect(decoded.address).toBe('GDECODE');
    expect(decoded.jti).toBe('xyz');
  });

  it('returns null for garbage input', () => {
    expect(decodeToken('garbage')).toBeNull();
  });

  it('decodes an expired token without throwing', () => {
    const secret = rndSecret();
    const token = jwt.sign({ sub: 'old' }, secret, {
      algorithm: JWT_ALGORITHM,
      expiresIn: -1,
    });
    const decoded = decodeToken(token);
    expect(decoded).not.toBeNull();
    expect(decoded.sub).toBe('old');
  });
});

// ── Refresh token generation ──────────────────────────────────────────────────

describe('refresh token', () => {
  it('generates a refresh token with 7-day expiry by default', () => {
    const token = signToken({ userId: 'u1', type: 'refresh' }, { type: 'refresh' });
    const decoded = jwt.decode(token);
    const sevenDaysMs = 7 * 24 * 60 * 60;
    const now = Math.floor(Date.now() / 1000);
    // Allow ±5 s for test execution time
    expect(decoded.exp - now).toBeGreaterThanOrEqual(sevenDaysMs - 5);
    expect(decoded.exp - now).toBeLessThanOrEqual(sevenDaysMs + 5);
  });

  it('refresh token can be verified with the refresh type', () => {
    const token = signToken({ userId: 'u1' }, { type: 'refresh', expiresIn: '7d' });
    expect(() => verifyToken(token, { type: 'refresh' })).not.toThrow();
  });

  it('refresh token cannot be verified as an access token', () => {
    const token = signToken({ userId: 'u1' }, { type: 'refresh', expiresIn: '7d' });
    expect(() => verifyToken(token, { type: 'access' })).toThrow();
  });

  it('refresh token payload round-trip preserves all fields', () => {
    const claims = { userId: 'user-abc', familyId: 'fam-1', tenantId: 'ten-x', type: 'refresh' };
    const token = signToken(claims, { type: 'refresh', expiresIn: '7d' });
    const result = verifyToken(token, { type: 'refresh' });
    expect(result.userId).toBe(claims.userId);
    expect(result.familyId).toBe(claims.familyId);
    expect(result.tenantId).toBe(claims.tenantId);
    expect(result.type).toBe(claims.type);
  });
});
