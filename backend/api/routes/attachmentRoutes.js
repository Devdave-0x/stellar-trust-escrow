/**
 * Attachment Routes
 *
 * @module routes/attachmentRoutes
 */

import express from 'express';
import multer from 'multer';
import attachmentController, {
  MAX_ATTACHMENT_SIZE_BYTES,
  ALLOWED_MIME_TYPES,
} from '../controllers/attachmentController.js';
import requireUser from '../middleware/requireUser.js';

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_ATTACHMENT_SIZE_BYTES },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      return cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
    cb(null, true);
  },
});

/** Wraps multer so upload errors (size/type) return a clean 400 JSON response. */
function handleUpload(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
}

/**
 * @route  POST /api/attachments
 * @desc   Multipart upload; max 25 MB; allowed types: PDF, JPEG, PNG, MP4, ZIP, DOCX
 * @header x-user-address
 * @body   file, entityType, entityId
 */
router.post('/attachments', requireUser, handleUpload, attachmentController.uploadAttachment);

/**
 * @route  GET /api/attachments/:id/download
 * @desc   Returns a signed S3 URL valid for 15 minutes
 */
router.get('/attachments/:id/download', requireUser, attachmentController.getDownloadUrl);

/**
 * @route  DELETE /api/attachments/:id
 * @desc   Soft-delete; only the uploader or an admin may delete
 */
router.delete('/attachments/:id', requireUser, attachmentController.deleteAttachment);

/**
 * @route  GET /api/:entityType/:entityId/attachments
 * @desc   List all active attachments for a given entity
 * @param  entityType - escrow | milestone | dispute | note
 */
router.get('/:entityType/:entityId/attachments', attachmentController.listAttachments);

export default router;
