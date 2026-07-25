import express from 'express';
import authMiddleware from '../middleware/auth.js';
import escrowTemplateController from '../controllers/escrowTemplateController.js';

const router = express.Router();

router.use(authMiddleware);

/**
 * @route  POST /api/v1/escrow-templates
 * @desc   Save a template from a JSON config or an existing escrow
 * @body   { name: string, config?: object } | { name: string, fromEscrowId: string }
 */
router.post('/', escrowTemplateController.createTemplate);

/**
 * @route  GET /api/v1/escrow-templates
 * @desc   List the authenticated user's templates
 */
router.get('/', escrowTemplateController.listTemplates);

/**
 * @route  POST /api/v1/escrow-templates/:id/apply
 * @desc   Merge the template config with override fields; returns a pre-filled escrow draft
 * @body   { titlePrefix?, amount?, currency?, milestones?, tags? }
 */
router.post('/:id/apply', escrowTemplateController.applyTemplate);

/**
 * @route  DELETE /api/v1/escrow-templates/:id
 * @desc   Delete a template
 */
router.delete('/:id', escrowTemplateController.deleteTemplate);

export default router;
