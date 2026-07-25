/**
 * Key Rotation Service
 *
 * Minimal in-memory stand-in for the admin key-rotation endpoints
 * (rotateKeys/listKeys in adminController.js). This file was missing from the
 * repo entirely — importing it threw at module load, so those two endpoints
 * (and anything that imports adminController.js) were unreachable. The rest
 * of the app signs JWTs with a single static HS256 secret from
 * config/secrets.js and never calls this service, so the blast radius of a
 * minimal stub here is limited to the two admin endpoints that reference it.
 */

import crypto from 'crypto';

let currentKid = crypto.randomUUID();
const keys = new Map([[currentKid, { kid: currentKid, algorithm: 'HS256' }]]);

async function rotateKey() {
  currentKid = crypto.randomUUID();
  keys.set(currentKid, { kid: currentKid, algorithm: 'HS256' });
  return { kid: currentKid };
}

async function getValidPublicKeys() {
  return Array.from(keys.values()).map((key) => ({ ...key, publicKey: null }));
}

export default { rotateKey, getValidPublicKeys };
