/**
 * Dispute Controller
 *
 * Handles dispute creation, evidence, automated resolution, and appeals.
 * Automated resolution / evidence / appeal logic lives in disputeResolution.js —
 * this controller is a thin HTTP layer over that service.
 *
 * @module controllers/disputeController
 */

import prisma from '../../lib/prisma.js';
import cache from '../../lib/cache.js';
import { buildPaginatedResponse, parsePagination } from '../../lib/pagination.js';
import { log, AuditCategory, AuditAction } from '../../services/auditService.js';
import disputeResolution from '../../services/disputeResolution.js';

// ── Create ─────────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/disputes
 * Raises a dispute against an escrow. Requires categoryId — the dispute is
 * auto-assigned to that category's default arbiter pool.
 *
 * Body: { escrowId, raisedByAddress, categoryId }
 */
const createDispute = async (req, res) => {
  try {
    const { escrowId, raisedByAddress, categoryId } = req.body;

    if (escrowId === undefined || escrowId === null) {
      return res.status(400).json({ error: 'escrowId is required.' });
    }
    if (!raisedByAddress) {
      return res.status(400).json({ error: 'raisedByAddress is required.' });
    }
    if (categoryId === undefined || categoryId === null) {
      return res.status(400).json({ error: 'categoryId is required.' });
    }

    const parsedEscrowId = BigInt(escrowId);
    const parsedCategoryId = parseInt(categoryId, 10);
    if (Number.isNaN(parsedCategoryId)) {
      return res.status(400).json({ error: 'categoryId must be a number.' });
    }

    const category = await prisma.disputeCategory.findUnique({ where: { id: parsedCategoryId } });
    if (!category) {
      return res.status(404).json({ error: 'Dispute category not found.' });
    }

    const escrow = await prisma.escrow.findUnique({ where: { id: parsedEscrowId } });
    if (!escrow) {
      return res.status(404).json({ error: 'Escrow not found.' });
    }

    const existing = await prisma.dispute.findUnique({ where: { escrowId: parsedEscrowId } });
    if (existing) {
      return res.status(409).json({ error: 'A dispute already exists for this escrow.' });
    }

    const dispute = await prisma.dispute.create({
      data: {
        escrowId: parsedEscrowId,
        raisedByAddress,
        raisedAt: new Date(),
        categoryId: parsedCategoryId,
        assignedArbiterPoolId: category.defaultArbiterPoolId,
      },
    });

    await log({
      category: AuditCategory.DISPUTE,
      action: AuditAction.RAISE_DISPUTE,
      actor: raisedByAddress,
      resourceId: String(dispute.id),
      metadata: { escrowId: escrowId.toString(), categoryId: parsedCategoryId },
    });

    res.status(201).json(dispute);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── List / Get ────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/disputes
 * Paginated list of disputes.
 */
const listDisputes = async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const { resolved } = req.query;

    const where =
      resolved === 'true'
        ? { resolvedAt: { not: null } }
        : resolved === 'false'
          ? { resolvedAt: null }
          : {};

    const cacheKey = `disputes:list:${JSON.stringify({ where, page, limit })}`;
    const cached = await cache.get(cacheKey);
    if (cached) return res.json(cached);

    const [disputes, total] = await prisma.$transaction([
      prisma.dispute.findMany({
        where,
        skip,
        take: limit,
        orderBy: { raisedAt: 'desc' },
        include: { category: true },
      }),
      prisma.dispute.count({ where }),
    ]);

    const result = buildPaginatedResponse(disputes, { total, page, limit });
    await cache.set(cacheKey, result, 15);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * GET /api/v1/disputes/history
 * Resolved disputes with resolution metadata.
 */
const getResolutionHistory = async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);

    const cacheKey = `disputes:history:${page}:${limit}`;
    const cached = await cache.get(cacheKey);
    if (cached) return res.json(cached);

    const [disputes, total] = await prisma.$transaction([
      prisma.dispute.findMany({
        where: { resolvedAt: { not: null } },
        skip,
        take: limit,
        orderBy: { resolvedAt: 'desc' },
      }),
      prisma.dispute.count({ where: { resolvedAt: { not: null } } }),
    ]);

    const result = buildPaginatedResponse(disputes, { total, page, limit });
    await cache.set(cacheKey, result, 30);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * GET /api/v1/disputes/:escrowId
 * Dispute detail by escrow id.
 */
const getDispute = async (req, res) => {
  try {
    const escrowId = BigInt(req.params.escrowId);
    const dispute = await prisma.dispute.findUnique({
      where: { escrowId },
      include: { category: true, evidence: true, appeals: true },
    });
    if (!dispute) return res.status(404).json({ error: 'Dispute not found.' });
    res.json(dispute);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── Evidence ──────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/disputes/:id/evidence
 */
const postEvidence = async (req, res) => {
  try {
    const disputeId = parseInt(req.params.id, 10);
    const evidence = await disputeResolution.submitEvidence(disputeId, req.body);
    res.status(201).json(evidence);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

/**
 * GET /api/v1/disputes/:id/evidence
 */
const listEvidence = async (req, res) => {
  try {
    const disputeId = parseInt(req.params.id, 10);
    const evidence = await prisma.disputeEvidence.findMany({
      where: { disputeId },
      orderBy: { submittedAt: 'asc' },
    });
    res.json(evidence);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── Automated Resolution ──────────────────────────────────────────────────────

/**
 * POST /api/v1/disputes/:id/resolve/auto
 */
const autoResolve = async (req, res) => {
  try {
    const disputeId = parseInt(req.params.id, 10);
    const result = await disputeResolution.runAutomatedResolution(disputeId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

/**
 * GET /api/v1/disputes/:id/resolve/recommendation
 */
const getRecommendation = async (req, res) => {
  try {
    const disputeId = parseInt(req.params.id, 10);
    const recommendation = await disputeResolution.getResolutionRecommendation(disputeId);
    res.json(recommendation);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// ── Appeals ───────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/disputes/:id/appeals
 */
const postAppeal = async (req, res) => {
  try {
    const disputeId = parseInt(req.params.id, 10);
    const appeal = await disputeResolution.submitAppeal(disputeId, req.body);
    res.status(201).json(appeal);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

/**
 * PATCH /api/v1/disputes/appeals/:appealId
 */
const patchAppeal = async (req, res) => {
  try {
    const appealId = parseInt(req.params.appealId, 10);
    const appeal = await disputeResolution.reviewAppeal(appealId, req.body);
    res.json(appeal);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

export default {
  createDispute,
  listDisputes,
  getResolutionHistory,
  getDispute,
  postEvidence,
  listEvidence,
  autoResolve,
  getRecommendation,
  postAppeal,
  patchAppeal,
};
