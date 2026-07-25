/**
 * Key Rotation Service — PLACEHOLDER
 *
 * adminController.js's key-management endpoints (rotateKeys/listKeys) import
 * this module, but no implementation existed in this checkout — the import
 * alone crashed adminRoutes.js (and therefore the whole app) at boot.
 *
 * This is a minimal, in-memory stand-in so the app can start and those
 * endpoints respond; it is NOT wired into JWT signing/verification anywhere
 * (auth.js signs with the shared JWT_SECRET — see config/secrets.js) and
 * keys are lost on restart. Replace with real persistent key storage before
 * relying on this for anything security-sensitive.
 */

import crypto from 'crypto';

let keys = [];

function generateKey() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return {
    kid: crypto.randomUUID(),
    algorithm: 'RS256',
    publicKey,
    privateKey,
    createdAt: new Date().toISOString(),
  };
}

if (keys.length === 0) {
  keys.push(generateKey());
}

/** Rotates in a new key, keeping prior keys valid for verification. */
async function rotateKey() {
  const newKey = generateKey();
  keys.push(newKey);
  return newKey;
}

/** Returns all currently valid keys (includes private material — callers must sanitise before responding). */
async function getValidPublicKeys() {
  return keys;
}

/** Returns the most recently rotated-in key, for signing new tokens. */
async function getCurrentSigningKey() {
  return keys[keys.length - 1];
}

export default { rotateKey, getValidPublicKeys, getCurrentSigningKey };
