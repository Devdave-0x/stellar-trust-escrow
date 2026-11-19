/**
 * JWT Authentication Service
 *
 * Handles challenge-response auth flow with Stellar keypair signing.
 * Stores JWT in SecureStore (encrypted at rest, requires device unlock).
 */

import { Keypair } from '@stellar/stellar-sdk';
import { secureStorage, STORAGE_KEYS } from '../lib/storage';
import { api } from '../lib/api';

const JWT_KEY = 'auth_jwt';
const KEYPAIR_SECRET_KEY = 'stellar_keypair_secret';

export type SessionStatus = 'valid' | 'expired' | 'revoked';

export interface SessionEvaluation {
  status: SessionStatus;
  token: string | null;
}

/**
 * Decode the `exp` claim (seconds since epoch) from a JWT payload without verifying.
 * Returns null if the token is malformed or has no numeric exp claim.
 */
export function getTokenExpiry(token: string): number | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(
      Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'),
    );
    return typeof payload?.exp === 'number' ? payload.exp : null;
  } catch {
    return null;
  }
}

/**
 * Returns true if the token is missing an expiry or its expiry is in the past.
 */
export function isTokenExpired(token: string, nowMs: number = Date.now()): boolean {
  const exp = getTokenExpiry(token);
  if (exp === null) return true;
  return exp * 1000 <= nowMs;
}

export const jwtAuth = {
  /**
   * Store the user's Stellar secret key in encrypted storage (only after explicit user grant).
   * This is a one-time operation during wallet connect flow.
   */
  async setKeypairSecret(secret: string): Promise<void> {
    await secureStorage.set(KEYPAIR_SECRET_KEY, secret);
  },

  /**
   * Request a nonce/challenge from the backend.
   */
  async requestNonce(address: string): Promise<string> {
    try {
      const response = await api.post('/api/auth/nonce', { address });
      return response.data.message;
    } catch (err) {
      throw new Error(`Failed to request nonce: ${err}`);
    }
  },

  /**
   * Sign the challenge message with the Stellar keypair and submit to get JWT.
   */
  async verifyAndGetToken(address: string, message: string): Promise<string> {
    const secret = await secureStorage.get(KEYPAIR_SECRET_KEY);
    if (!secret) {
      throw new Error('Keypair not found in secure storage');
    }

    const keypair = Keypair.fromSecret(secret);
    const signature = keypair.sign(Buffer.from(message, 'utf8')).toString('base64');

    try {
      const response = await api.post('/api/auth/verify', { address, signature });
      const token = response.data.token;

      // Store JWT in SecureStore with ALWAYS accessibility (requires device unlock)
      await secureStorage.setWithAccessibility(JWT_KEY, token, 'ALWAYS');
      return token;
    } catch (err) {
      throw new Error(`Signature verification failed: ${err}`);
    }
  },

  /**
   * Perform the full auth flow: request nonce → sign → verify → store JWT.
   */
  async authenticate(address: string): Promise<string> {
    const message = await this.requestNonce(address);
    const token = await this.verifyAndGetToken(address, message);
    return token;
  },

  /**
   * Retrieve the stored JWT from SecureStore.
   */
  async getToken(): Promise<string | null> {
    return secureStorage.get(JWT_KEY);
  },

  /**
   * Clear the stored JWT (logout).
   */
  async clearToken(): Promise<void> {
    await secureStorage.delete(JWT_KEY);
  },

  /**
   * Silent re-authentication: attempt to get a new token using stored keypair.
   * Returns null if re-auth fails (user should be redirected to connect screen).
   */
  async silentRefresh(address: string): Promise<string | null> {
    try {
      const message = await this.requestNonce(address);
      const token = await this.verifyAndGetToken(address, message);
      return token;
    } catch {
      return null;
    }
  },

  /**
   * Check whether the stored token has been revoked by the server.
   * Returns true when the server explicitly reports the token as revoked.
   * Network/unknown errors are treated as not revoked so transient failures
   * don't force a logout.
   */
  async isTokenRevoked(token: string): Promise<boolean> {
    try {
      const response = await api.get('/api/auth/session', {
        headers: { Authorization: `Bearer ${token}` },
      });
      return response?.data?.revoked === true;
    } catch (err: any) {
      const status = err?.response?.status;
      // 401/403 from the session endpoint indicates the token is no longer accepted.
      if (status === 401 || status === 403) return true;
      return false;
    }
  },

  /**
   * Evaluate the stored session: returns distinct outcomes for valid, expired,
   * and revoked credentials. Does not mutate stored state.
   */
  async evaluateSession(): Promise<SessionEvaluation> {
    const token = await this.getToken();
    if (!token) {
      return { status: 'expired', token: null };
    }

    if (await this.isTokenRevoked(token)) {
      return { status: 'revoked', token };
    }

    if (isTokenExpired(token)) {
      return { status: 'expired', token };
    }

    return { status: 'valid', token };
  },

  /**
   * Restore a session on app launch without losing the user's current screen.
   *
   * - valid:   keep the existing token.
   * - expired: attempt silent re-auth; on success keep the user where they are,
   *            on failure clear the token so the caller can route to connect.
   * - revoked: clear the token so the caller can route to connect.
   *
   * The caller is expected to preserve navigation state; this method never
   * triggers navigation itself.
   */
  async restoreSession(address: string): Promise<SessionEvaluation> {
    const evaluation = await this.evaluateSession();

    if (evaluation.status === 'valid') {
      return evaluation;
    }

    if (evaluation.status === 'revoked') {
      await this.clearToken();
      return { status: 'revoked', token: null };
    }

    // Expired: try silent re-auth while preserving the current screen.
    const refreshed = await this.silentRefresh(address);
    if (refreshed) {
      return { status: 'valid', token: refreshed };
    }

    await this.clearToken();
    return { status: 'expired', token: null };
  },
};
