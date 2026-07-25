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

const DOWNLOAD_URL_TTL_SECONDS = 15 * 60;

/**
 * POST /api/attachments
 * Multipart upload; stores the file in S3 and records metadata.
 * Body (multipart): file, entityType, entityId
 */
const uploadAttachment = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'A file is required.' });
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

    const key = `attachments/${entityType}/${entityId}/${crypto.randomUUID()}-${req.file.originalname}`;

    await s3Client.send(
      new PutObjectCommand({
        Bucket: ATTACHMENTS_BUCKET,
        Key: key,
        Body: req.file.buffer,
        ContentType: req.file.mimetype,
      }),
    );

    const attachment = await prisma.attachment.create({
      data: {
        entityType,
        entityId: String(entityId),
        filename: req.file.originalname,
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
