/**
 * Attachment Controller
 *
 * Unified file attachment service for escrow-related entities (dispute
 * evidence, milestone deliverables, etc.), backed by S3.
 *
 * @module controllers/attachmentController
 */

import crypto from 'crypto';
import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import prisma from '../../lib/prisma.js';
import s3Client, { ATTACHMENTS_BUCKET } from '../../lib/s3.js';
import { isAdminRequest } from '../middleware/requireUser.js';

export const MAX_ATTACHMENT_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'video/mp4',
  'application/zip',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // DOCX
];

export const ENTITY_TYPES = ['escrow', 'milestone', 'dispute', 'note'];

const SIGNATURE_MIME = [
  { mime: 'application/pdf', magic: [0x25, 0x50, 0x44, 0x46] },
  { mime: 'image/jpeg', magic: [0xff, 0xd8, 0xff] },
  { mime: 'image/png', magic: [0x89, 0x50, 0x4e, 0x47] },
  { mime: 'application/zip', magic: [0x50, 0x4b, 0x03, 0x04] },
];

export function detectMimeFromBytes(buffer) {
  if (!buffer?.length) return null;
  const hit = SIGNATURE_MIME.find(({ magic }) => magic.every((b, i) => buffer[i] === b));
  return hit?.mime ?? null;
}

export function enforceAttachmentRequestLimits(req, res) {
  const rawLen = req.headers['content-length'];
  if (rawLen && Number(rawLen) > MAX_ATTACHMENT_SIZE_BYTES) {
    res.status(413).json({ error: 'Attachment exceeds maximum upload size.' });
    return false;
  }
  return true;
}

const DOWNLOAD_URL_TTL_SECONDS = 15 * 60;

/** Strips path-traversal and other unsafe characters from an uploaded filename. */
const sanitizeFilename = (filename) => {
  if (!filename) return 'unknown';
  return filename.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 255) || 'unknown';
};

/**
 * POST /api/attachments
 * Multipart upload; stores the file in S3 and records metadata.
 * Body (multipart): file, entityType, entityId
 */
const uploadAttachment = async (req, res) => {
  try {
    if (!enforceAttachmentRequestLimits(req, res)) return;
    if (!req.file) {
      return res.status(400).json({ error: 'A file is required.' });
    }
    if (req.file.size === 0) {
      return res.status(422).json({ error: 'The uploaded file is empty.' });
    }
    if (req.file.size > MAX_ATTACHMENT_SIZE_BYTES) {
      return res.status(413).json({ error: 'Attachment exceeds maximum upload size.' });
    }

    const { entityType, entityId } = req.body;
    if (!entityType || !ENTITY_TYPES.includes(entityType)) {
      return res
        .status(400)
        .json({ error: `entityType must be one of: ${ENTITY_TYPES.join(', ')}.` });
    }
    if (!entityId) {
      return res.status(400).json({ error: 'entityId is required.' });
    }

    const sniffedMime = detectMimeFromBytes(req.file.buffer);
    if (!sniffedMime || !ALLOWED_MIME_TYPES.includes(sniffedMime)) {
      return res.status(415).json({ error: 'Unsupported attachment content type.' });
    }
    if (req.file.mimetype && req.file.mimetype !== sniffedMime) {
      return res.status(415).json({
        error: 'Client MIME header does not match file contents.',
        detectedType: sniffedMime,
      });
    }

    const safeFilename = sanitizeFilename(req.file.originalname);
    const key = `attachments/${entityType}/${entityId}/${crypto.randomUUID()}-${safeFilename}`;

    await s3Client.send(
      new PutObjectCommand({
        Bucket: ATTACHMENTS_BUCKET,
        Key: key,
        Body: req.file.buffer,
        ContentType: sniffedMime,
      }),
    );

    const attachment = await prisma.attachment.create({
      data: {
        entityType,
        entityId: String(entityId),
        filename: safeFilename,
        mimeType: req.file.mimetype,
        sizeBytes: req.file.size,
        s3Key: key,
        uploadedBy: req.userAddress,
      },
    });

    res.status(201).json(attachment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * GET /api/attachments/:id/download
 * Returns a signed S3 URL valid for 15 minutes.
 */
const getDownloadUrl = async (req, res) => {
  try {
    const { id } = req.params;
    const attachment = await prisma.attachment.findUnique({ where: { id: parseInt(id) } });

    if (!attachment || attachment.deletedAt) {
      return res.status(404).json({ error: 'Attachment not found.' });
    }

    const url = await getSignedUrl(
      s3Client,
      new GetObjectCommand({ Bucket: ATTACHMENTS_BUCKET, Key: attachment.s3Key }),
      { expiresIn: DOWNLOAD_URL_TTL_SECONDS },
    );

    res.json({ url, expiresIn: DOWNLOAD_URL_TTL_SECONDS });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * DELETE /api/attachments/:id
 * Soft-deletes an attachment. Only the uploader or an admin may delete.
 */
const deleteAttachment = async (req, res) => {
  try {
    const { id } = req.params;
    const attachment = await prisma.attachment.findUnique({ where: { id: parseInt(id) } });

    if (!attachment || attachment.deletedAt) {
      return res.status(404).json({ error: 'Attachment not found.' });
    }

    const isOwner = attachment.uploadedBy === req.userAddress;
    if (!isOwner && !isAdminRequest(req)) {
      return res
        .status(403)
        .json({ error: 'Only the uploader or an admin may delete this attachment.' });
    }

    const updated = await prisma.attachment.update({
      where: { id: parseInt(id) },
      data: { deletedAt: new Date() },
    });

    res.json({ message: 'Attachment deleted.', attachment: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * GET /api/:entityType/:entityId/attachments
 * Lists all active (non-deleted) attachments for a given entity.
 */
const listAttachments = async (req, res) => {
  try {
    const { entityType, entityId } = req.params;
    if (!ENTITY_TYPES.includes(entityType)) {
      return res
        .status(400)
        .json({ error: `entityType must be one of: ${ENTITY_TYPES.join(', ')}.` });
    }

    const attachments = await prisma.attachment.findMany({
      where: { entityType, entityId: String(entityId), deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ attachments });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export default { uploadAttachment, getDownloadUrl, deleteAttachment, listAttachments };
