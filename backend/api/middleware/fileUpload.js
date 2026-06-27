import multer from 'multer';
import prisma from '../../lib/prisma.js';
import ipfsService from '../../services/ipfsService.js';
import { broadcastToDispute } from '../websocket/handlers.js';
import virusScanMiddleware from '../../middleware/virusScanner.js';
import { createModuleLogger } from '../../config/logger.js';

const log = createModuleLogger('fileUpload');

const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE || String(10 * 1024 * 1024), 10);
const MAX_FILES = parseInt(process.env.MAX_FILES || '5', 10);

const storage = multer.memoryStorage();

// Only these four MIME types are accepted for dispute evidence
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'application/pdf',
  'video/mp4',
]);

// Magic byte signatures for each allowed MIME type.
// Validation is done against file content, not the Content-Type header.
const MAGIC_BYTES = [
  { mime: 'image/jpeg', offset: 0, bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/png', offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: 'application/pdf', offset: 0, bytes: [0x25, 0x50, 0x44, 0x46] },
  // MP4: ISO base media — 'ftyp' box starts at byte 4
  { mime: 'video/mp4', offset: 4, bytes: [0x66, 0x74, 0x79, 0x70] },
];

function detectMimeFromBuffer(buf) {
  for (const { mime, offset, bytes } of MAGIC_BYTES) {
    if (buf.length < offset + bytes.length) continue;
    if (bytes.every((b, i) => buf[offset + i] === b)) return mime;
  }
  return null;
}

const fileFilter = (req, file, cb) => {
  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    log.warn({
      event: 'upload_validation_failure',
      reason: 'disallowed_content_type',
      mimetype: file.mimetype,
      filename: file.originalname,
      userId: req.user?.userId,
    });
    return cb(
      Object.assign(new Error(`File type ${file.mimetype} is not allowed`), {
        code: 'LIMIT_FILE_TYPE',
      }),
      false,
    );
  }
  cb(null, true);
};

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES },
  fileFilter,
});

/**
 * Express error handler for multer errors.
 * Must be used as the last middleware in the upload chain.
 */
export function handleUploadError(err, _req, res, next) {
  if (!err) return next();
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res
      .status(400)
      .json({ error: `File size exceeds ${MAX_FILE_SIZE / (1024 * 1024)}MB limit` });
  }
  if (err.code === 'LIMIT_FILE_COUNT') {
    return res.status(400).json({ error: `Too many files. Maximum is ${MAX_FILES}` });
  }
  if (err.code === 'LIMIT_FILE_TYPE') {
    return res.status(400).json({ error: err.message });
  }
  next(err);
}

/**
 * Validates uploaded file buffers against known magic byte signatures.
 * Rejects files whose content does not match the declared MIME type.
 */
export function validateMagicBytes(req, res, next) {
  if (!req.files || req.files.length === 0) return next();

  for (const file of req.files) {
    const detectedMime = detectMimeFromBuffer(file.buffer);

    if (!detectedMime) {
      log.warn({
        event: 'upload_validation_failure',
        reason: 'unrecognized_magic_bytes',
        filename: file.originalname,
        declaredMimetype: file.mimetype,
        userId: req.user?.userId,
      });
      return res.status(400).json({
        error: `File "${file.originalname}" has an unrecognized or unsupported format`,
      });
    }

    if (detectedMime !== file.mimetype) {
      log.warn({
        event: 'upload_validation_failure',
        reason: 'mimetype_mismatch',
        filename: file.originalname,
        declaredMimetype: file.mimetype,
        detectedMimetype: detectedMime,
        userId: req.user?.userId,
      });
      return res.status(400).json({
        error: `File "${file.originalname}" content does not match declared type ${file.mimetype}`,
      });
    }
  }

  next();
}

const ipfsUploadMiddleware = async (req, res, next) => {
  if (!req.files || req.files.length === 0) return next();

  const disputeId = req.dispute?.id;

  try {
    const uploadResults = await Promise.all(
      req.files.map(async (file, index) => {
        // Broadcast per-file progress via WebSocket
        if (disputeId) {
          broadcastToDispute(disputeId, {
            type: 'upload_progress',
            filename: file.originalname,
            index,
            total: req.files.length,
          });
        }

        const ipfsResult = await ipfsService.pinFile(file.buffer);

        let thumbnailCid = null;
        if (ipfsService.isImage(file.mimetype)) {
          const thumbnailBuffer = await ipfsService.generateThumbnail(file.buffer, file.mimetype);
          if (thumbnailBuffer) {
            const thumbResult = await ipfsService.pinFile(thumbnailBuffer);
            thumbnailCid = thumbResult.cid;
          }
        }

        const metadata = await ipfsService.getFileMetadata(
          file.buffer,
          file.originalname,
          file.mimetype,
        );

        return {
          fieldname: file.fieldname,
          originalname: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
          ipfsCid: ipfsResult.cid,
          thumbnailCid,
          metadata,
        };
      }),
    );

    req.ipfsUploadResults = uploadResults;
    next();
  } catch (error) {
    console.error('IPFS upload error:', error);
    res
      .status(500)
      .json({ error: 'IPFS upload failed', message: 'Unable to upload files to IPFS' });
  }
};

const validateDisputeAccess = async (req, res, next) => {
  const { id } = req.params;
  const userId = req.user?.userId;

  if (!userId) return res.status(401).json({ error: 'User not authenticated' });

  try {
    // Resolve wallet address from DB — JWT payload only carries userId
    const userProfile = await prisma.userProfile.findFirst({
      where: { userId },
      select: { walletAddress: true },
    });
    const userAddress = userProfile?.walletAddress ?? null;

    const dispute = await prisma.dispute.findFirst({
      where: { id: parseInt(id), tenantId: req.tenant.id },
      include: { escrow: true },
    });

    if (!dispute) return res.status(404).json({ error: 'Dispute not found' });

    const isParticipant =
      userAddress &&
      (dispute.raisedByAddress === userAddress ||
        dispute.escrow.clientAddress === userAddress ||
        dispute.escrow.freelancerAddress === userAddress);
    const isAdmin = req.user?.role === 'admin' || req.user?.role === 'arbiter';

    if (!isParticipant && !isAdmin) return res.status(403).json({ error: 'Access denied' });

    req.dispute = dispute;
    req.userAddress = userAddress;
    next();
  } catch (error) {
    console.error('Dispute access validation error:', error);
    res.status(500).json({ error: 'Validation failed' });
  }
};

export const uploadEvidence = [
  upload.array('files', MAX_FILES),
  handleUploadError,
  validateMagicBytes,
  validateDisputeAccess,
  virusScanMiddleware,
  ipfsUploadMiddleware,
];

export const uploadSingleFile = upload.single('file');
export const uploadMultipleFiles = upload.array('files', MAX_FILES);
