/**
 * Audit Routes
 *
 * Provides search and export endpoints for the audit log.
 * All routes require admin authentication.
 *
 * @module routes/auditRoutes
 */

import express from 'express';
import adminAuth from '../middleware/adminAuth.js';
import auditService from '../../services/auditService.js';
import { parseCursorPagination, buildPrismaFindArgs, buildCursorResponse } from '../../lib/pagination.js';
import prisma from '../../lib/prisma.js';

const router = express.Router();
router.use(adminAuth);

/**
 * @route  GET /api/audit
 * @desc   Search audit logs with cursor-based pagination.
 * @query  category, action, actor, resourceId, from (ISO), to (ISO), limit, cursor
 */
router.get('/', async (req, res) => {
  try {
    const { take, parsedCursor, sortDir } = parseCursorPagination(req.query, 'createdAt', 'desc');
    const { category, action, actor, resourceId, from, to } = req.query;

    const where = {};
    if (category) where.category = category;
    if (action) where.action = action;
    if (actor) where.actor = { contains: actor, mode: 'insensitive' };
    if (resourceId) where.resourceId = { contains: resourceId, mode: 'insensitive' };
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    const findArgs = buildPrismaFindArgs({
      parsedCursor: parsedCursor
        ? { ...parsedCursor, id: BigInt(parsedCursor.id) }
        : null,
      take,
      sortField: 'createdAt',
      sortDir,
      idField: 'id',
    });

    const data = await prisma.auditLog.findMany({ where, ...findArgs });

    res.json(buildCursorResponse(data, take, 'id', 'createdAt', sortDir));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @route  GET /api/audit/export
 * @desc   Export audit logs as a CSV file (max 10 000 rows).
 * @query  category, action, actor, resourceId, from (ISO), to (ISO)
 */
router.get('/export', async (req, res) => {
  try {
    const csv = await auditService.exportCsv(req.query);
    const filename = `audit-export-${Date.now()}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
