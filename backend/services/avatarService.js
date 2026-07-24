/**
 * Avatar service — resizes uploaded images with sharp and stores them.
 *
 * Storage backend is selected by environment:
 *   AVATAR_STORAGE=s3   → AWS S3 (requires AWS_REGION, AWS_ACCESS_KEY_ID,
 *                          AWS_SECRET_ACCESS_KEY, AVATAR_S3_BUCKET)
 *   AVATAR_STORAGE=local (default) → writes to process.cwd()/uploads/avatars/
 *
 * Resize spec: 256×256 px, cropped to fill (cover), converted to WebP.
 */

import path from 'path';
import fs from 'fs/promises';
import { createHash } from 'crypto';
import sharp from 'sharp';
import { createModuleLogger } from '../config/logger.js';

const logger = createModuleLogger('avatarService');

const AVATAR_SIZE = 256;
const AVATAR_FORMAT = 'webp';
const AVATAR_QUALITY = 85;

const STORAGE = process.env.AVATAR_STORAGE || 'local';

// ── Sharp resize ──────────────────────────────────────────────────────────────

/**
 * Resize and convert a buffer to a 256×256 WebP avatar.
 * @param {Buffer} inputBuffer
 * @returns {Promise<Buffer>}
 */
export async function resizeAvatar(inputBuffer) {
  return sharp(inputBuffer)
    .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: 'cover', position: 'center' })
    .toFormat(AVATAR_FORMAT, { quality: AVATAR_QUALITY })
    .toBuffer();
}

// ── Local storage ─────────────────────────────────────────────────────────────

const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'avatars');

async function ensureUploadDir() {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
}

async function storeLocal(buffer, filename) {
  await ensureUploadDir();
  const dest = path.join(UPLOAD_DIR, filename);
  await fs.writeFile(dest, buffer);
  return `/uploads/avatars/${filename}`;
}

// ── S3 storage ────────────────────────────────────────────────────────────────

async function storeS3(buffer, filename) {
  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3').catch(() => {
    throw new Error('@aws-sdk/client-s3 is not installed. Add it or use AVATAR_STORAGE=local.');
  });

  const bucket = process.env.AVATAR_S3_BUCKET;
  if (!bucket) throw new Error('AVATAR_S3_BUCKET env var is required for S3 avatar storage.');

  const client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: `avatars/${filename}`,
      Body: buffer,
      ContentType: `image/${AVATAR_FORMAT}`,
      CacheControl: 'public, max-age=31536000, immutable',
    }),
  );

  const cdnBase = process.env.AVATAR_CDN_BASE || `https://${bucket}.s3.amazonaws.com`;
  return `${cdnBase}/avatars/${filename}`;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Resize an uploaded avatar buffer and persist it.
 *
 * @param {Buffer} inputBuffer — raw upload buffer
 * @param {string} address — user's Stellar address (used to derive filename)
 * @returns {Promise<string>} Public URL of the stored avatar
 */
export async function processAndStoreAvatar(inputBuffer, address) {
  const resized = await resizeAvatar(inputBuffer);

  // Deterministic filename: sha1(address) avoids directory traversal and
  // ensures old avatars are implicitly replaced on re-upload.
  const hash = createHash('sha1').update(address).digest('hex').slice(0, 16);
  const filename = `${hash}.${AVATAR_FORMAT}`;

  logger.info({ address, storage: STORAGE, filename }, 'Storing avatar');

  if (STORAGE === 's3') {
    return storeS3(resized, filename);
  }
  return storeLocal(resized, filename);
}
