/**
 * Expiry Controller
 *
 * API endpoints for managing the escrow auto-expiry background job.
 * All endpoints require authentication and live under /api/v1/expiry.
 */

import { logControllerError } from '../../config/logger.js';
import {
  processExpiredEscrows,
  getExpiryStatus,
  findExpiredEscrows,
} from '../../services/expiryService.js';

/**
 * GET /api/v1/expiry/status
 * Returns the current status of the expiry background job.
 */
const getStatus = async (req, res) => {
  try {
    const status = getExpiryStatus();
    res.json({ data: status });
  } catch (err) {
    logControllerError('expiry.getStatus', err, req);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
  }
};

/**
 * POST /api/v1/expiry/run
 * Manually trigger a single run of the expiry job.
 * Admin-only endpoint.
 */
const triggerRun = async (req, res) => {
  try {
    const actor = req.user?.address || req.adminId || 'admin';
    const batchSize = parseInt(req.query.batchSize || req.body?.batchSize || '50', 10);
    const clampedBatch = Math.min(Math.max(1, batchSize), 500);

    const results = await processExpiredEscrows({ batchSize: clampedBatch, actor });

    res.json({
      data: {
        ...results,
        triggeredBy: actor,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    logControllerError('expiry.triggerRun', err, req);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
  }
};

/**
 * GET /api/v1/expiry/pending
 * List escrows that are currently past their deadline but not yet expired.
 * Useful for auditing and manual review.
 */
const listPendingExpirations = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '20', 10)));
    const skip = (page - 1) * limit;

    const now = new Date();
    const [data, total] = await prisma.$transaction([
      prisma.escrow.findMany({
        where: {
          status: 'Active',
          deadline: { lt: now },
        },
        select: {
          id: true,
          clientAddress: true,
          freelancerAddress: true,
          totalAmount: true,
          remainingBalance: true,
          deadline: true,
          createdAt: true,
        },
        orderBy: { deadline: 'asc' },
        skip,
        take: limit,
      }),
      prisma.escrow.count({
        where: {
          status: 'Active',
          deadline: { lt: now },
        },
      }),
    ]);

    res.json({
      data,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page * limit < total,
      hasPreviousPage: page > 1,
    });
  } catch (err) {
    logControllerError('expiry.listPendingExpirations', err, req);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
  }
};

import prisma from '../../lib/prisma.js';

export default {
  getStatus,
  triggerRun,
  listPendingExpirations,
};
