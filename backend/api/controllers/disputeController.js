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
 * Handles dispute resolution, evidence management, and appeals.
 * Evidence files are stored on IPFS with virus scanning and thumbnail generation.
 */

import prisma from '../../lib/prisma.js';
import {
  parseCursorPagination,
  buildPrismaFindArgs,
  buildCursorResponse,
} from '../../lib/pagination.js';
import { logTransition, EscrowAuditAction } from '../../services/escrowAuditService.js';
import { uploadEvidence } from '../middleware/fileUpload.js';
import ipfsService from '../../services/ipfsService.js';
import { broadcastToDispute } from '../websocket/handlers.js';
import { verifyFile, merkleRoot, hashFile } from '../../services/ipfsHashService.js';
import { getDisputeTimeline } from '../../services/disputeTimelineService.js';
import respond from '../../lib/respond.js';

/**
 * List and get handlers assume query/params are already validated by
 * `validate(disputeListQueryRules)` and `validate(disputeEscrowIdParamRules)`.
 */

const VALID_DISPUTE_SORT_FIELDS = new Set(['raisedAt', 'resolvedAt', 'id']);
const VALID_SORT_ORDERS = new Set(['asc', 'desc']);

const DISPUTE_MAX_LIMIT = 50;

const listDisputes = async (req, res) => {
  try {
    const { take, parsedCursor, sortField, sortDir } = parseCursorPagination(
      req.query,
      'raisedAt',
      'desc',
    );
    const limit = Math.min(take, DISPUTE_MAX_LIMIT);

    const { status, raisedBy, dateFrom, dateTo } = req.query;

    const resolvedSortBy = VALID_DISPUTE_SORT_FIELDS.has(sortField) ? sortField : 'raisedAt';
    const resolvedSortOrder = VALID_SORT_ORDERS.has(sortDir) ? sortDir : 'desc';

    if (dateFrom && isNaN(Date.parse(dateFrom))) {
      return res.status(400).json({ error: 'dateFrom must be a valid ISO date string' });
    }
    if (dateTo && isNaN(Date.parse(dateTo))) {
      return res.status(400).json({ error: 'dateTo must be a valid ISO date string' });
    }
    if (dateFrom && dateTo && new Date(dateFrom) > new Date(dateTo)) {
      return res.status(400).json({ error: 'dateFrom must not be after dateTo' });
    }

    const where = {
      tenantId: req.tenant.id,
    };

    if (status === 'resolved') {
      where.resolvedAt = { not: null };
    } else if (status === 'unresolved') {
      where.resolvedAt = null;
    }

    if (raisedBy) where.raisedByAddress = raisedBy;
    if (dateFrom || dateTo) {
      where.raisedAt = {};
      if (dateFrom) where.raisedAt.gte = new Date(dateFrom);
      if (dateTo) where.raisedAt.lte = new Date(dateTo);
    }

    const findArgs = buildPrismaFindArgs({
      parsedCursor: parsedCursor ? { ...parsedCursor, id: parseInt(parsedCursor.id, 10) } : null,
      take: limit,
      sortField: resolvedSortBy,
      sortDir: resolvedSortOrder,
      idField: 'id',
    });

    const disputes = await prisma.dispute.findMany({
      where,
      include: {
        escrow: {
          select: {
            clientAddress: true,
            freelancerAddress: true,
            totalAmount: true,
            status: true,
          },
        },
        evidence: {
          select: {
            id: true,
            evidenceType: true,
            submittedBy: true,
            submittedAt: true,
            filename: true,
            ipfsCid: true,
            thumbnailCid: true,
            scanStatus: true,
          },
          orderBy: { submittedAt: 'desc' },
        },
        _count: {
          select: { evidence: true, appeals: true },
        },
      },
      ...findArgs,
    });

    res.json(buildCursorResponse(disputes, limit, 'id', resolvedSortBy, resolvedSortOrder));
  } catch (error) {
    console.error('Error listing disputes:', error);
    return respond.error(res, 500, 'INTERNAL_ERROR', 'Failed to list disputes');
  }
};

const getDispute = async (req, res) => {
  try {
    const { escrowId } = req.params;
    const escrowIdBigInt = BigInt(escrowId);

    const dispute = await prisma.dispute.findFirst({
      where: {
        escrowId: escrowIdBigInt,
        tenantId: req.tenant.id,
      },
      include: {
        escrow: {
          select: {
            clientAddress: true,
            freelancerAddress: true,
            arbiterAddress: true,
            tokenAddress: true,
            totalAmount: true,
            remainingBalance: true,
            status: true,
            deadline: true,
            createdAt: true,
          },
        },
        evidence: {
          include: {
            _count: true,
          },
          orderBy: { submittedAt: 'desc' },
        },
        appeals: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!dispute) {
      return respond.error(res, 404, 'NOT_FOUND', 'Dispute not found');
    }

    const evidenceWithUrls = await Promise.all(
      dispute.evidence.map(async (evidence) => {
        const evidenceData = { ...evidence };
        if (evidence.ipfsCid) {
          evidenceData.fileUrl = await ipfsService.getFileUrl(evidence.ipfsCid);
        }
        if (evidence.thumbnailCid) {
          evidenceData.thumbnailUrl = await ipfsService.getFileUrl(evidence.thumbnailCid);
        }
        return evidenceData;
      }),
    );

    return respond.success(res, { ...dispute, evidence: evidenceWithUrls });
  } catch (error) {
    console.error('Error getting dispute:', error);
    return respond.error(res, 500, 'INTERNAL_ERROR', 'Failed to get dispute');
  }
};

const postEvidence = async (req, res) => {
  try {
    const { description, role } = req.body;
    const userAddress = req.userAddress; // set by validateDisputeAccess in fileUpload middleware

    if (!userAddress) {
      return respond.error(res, 401, 'UNAUTHENTICATED', 'User not authenticated');
    }

    const dispute = req.dispute;
    const uploadResults = req.ipfsUploadResults || [];
    const scanResults = req.virusScanResults || [];

    if (uploadResults.length === 0 && !description) {
      return respond.error(
        res,
        400,
        'VALIDATION_ERROR',
        'Either files or text description is required',
      );
    }

    const evidenceRecords = [];

    for (const uploadResult of uploadResults) {
      const scanResult = scanResults.find((s) => s.originalname === uploadResult.originalname);

      const evidenceRecord = await prisma.disputeEvidence.create({
        data: {
          tenantId: req.tenant.id,
          disputeId: dispute.id,
          submittedBy: userAddress,
          role: role || determineUserRole(dispute, userAddress),
          evidenceType: uploadResult.metadata.mimeType.startsWith('image/') ? 'image' : 'file',
          content: uploadResult.ipfsCid,
          description: description || null,
          filename: uploadResult.originalname,
          mimeType: uploadResult.mimetype,
          fileSize: uploadResult.size,
          ipfsCid: uploadResult.ipfsCid,
          thumbnailCid: uploadResult.thumbnailCid,
          scanStatus: scanResult?.status || 'pending',
          scanResult: JSON.stringify(scanResult) || null,
        },
      });

      evidenceRecords.push(evidenceRecord);
    }

    if (description && uploadResults.length === 0) {
      const textEvidence = await prisma.disputeEvidence.create({
        data: {
          tenantId: req.tenant.id,
          disputeId: dispute.id,
          submittedBy: userAddress,
          role: role || determineUserRole(dispute, userAddress),
          evidenceType: 'text',
          content: description,
          description: null,
        },
      });

      evidenceRecords.push(textEvidence);
    }

    const evidenceWithUrls = await Promise.all(
      evidenceRecords.map(async (evidence) => {
        const evidenceData = { ...evidence };
        if (evidence.ipfsCid) {
          evidenceData.fileUrl = await ipfsService.getFileUrl(evidence.ipfsCid);
        }
        if (evidence.thumbnailCid) {
          evidenceData.thumbnailUrl = await ipfsService.getFileUrl(evidence.thumbnailCid);
        }
        return evidenceData;
      }),
    );

    broadcastToDispute(dispute.id, {
      type: 'evidence_added',
      disputeId: dispute.id,
      evidence: evidenceWithUrls,
      submittedBy: userAddress,
      timestamp: new Date().toISOString(),
    });

    return respond.success(
      res,
      { evidence: evidenceWithUrls, count: evidenceRecords.length },
      { created: true },
    );
  } catch (error) {
    console.error('Error posting evidence:', error);
    return respond.error(res, 500, 'INTERNAL_ERROR', 'Failed to post evidence');
  }
};

const listEvidence = async (req, res) => {
  try {
    const { id } = req.params;
    const { take, parsedCursor, sortDir } = parseCursorPagination(req.query, 'submittedAt', 'desc');
    const { evidenceType, submittedBy } = req.query;

    const where = {
      tenantId: req.tenant.id,
      disputeId: parseInt(id),
    };

    if (evidenceType) where.evidenceType = evidenceType;
    if (submittedBy) where.submittedBy = submittedBy;

    const findArgs = buildPrismaFindArgs({
      parsedCursor: parsedCursor ? { ...parsedCursor, id: parseInt(parsedCursor.id, 10) } : null,
      take,
      sortField: 'submittedAt',
      sortDir,
      idField: 'id',
    });

    const evidence = await prisma.disputeEvidence.findMany({
      where,
      ...findArgs,
    });

    const evidenceWithUrls = await Promise.all(
      evidence.map(async (evidenceItem) => {
        const evidenceData = { ...evidenceItem };
        if (evidenceItem.ipfsCid) {
          evidenceData.fileUrl = await ipfsService.getFileUrl(evidenceItem.ipfsCid);
        }
        if (evidenceItem.thumbnailCid) {
          evidenceData.thumbnailUrl = await ipfsService.getFileUrl(evidenceItem.thumbnailCid);
        }
        return evidenceData;
      }),
    );

    res.json(buildCursorResponse(evidenceWithUrls, take, 'id', 'submittedAt', sortDir));
  } catch (error) {
    console.error('Error listing evidence:', error);
    return respond.error(res, 500, 'INTERNAL_ERROR', 'Failed to list evidence');
  }
};

const autoResolve = async (req, res) => {
  try {
    const dispute = req.dispute;

    const resolution = await prisma.dispute.update({
      where: { id: dispute.id },
      data: {
        resolvedAt: new Date(),
        resolvedBy: 'system',
        resolutionType: 'AUTO',
        autoResolved: true,
        resolution: 'Automatically resolved based on evidence and contract terms',
      },
    });

    // Log the state transition to the immutable audit trail
    await logTransition({
      escrowId: dispute.escrowId,
      tenantId: req.tenant?.id ?? dispute.tenantId,
      actorId: 'system',
      actorIp: req.ip || null,
      action: EscrowAuditAction.RESOLVE_DISPUTE,
      fromState: 'Disputed',
      toState: 'Completed',
      metadata: {
        disputeId: dispute.id,
        resolutionType: 'AUTO',
        resolvedBy: 'system',
      },
    });

    broadcastToDispute(dispute.id, {
      type: 'dispute_resolved',
      disputeId: dispute.id,
      resolution: resolution,
      timestamp: new Date().toISOString(),
    });

    res.json({
      message: 'Dispute auto-resolved successfully',
      resolution,
    });
  } catch (error) {
    console.error('Error auto-resolving dispute:', error);
    res.status(500).json({ error: 'Failed to auto-resolve dispute' });
  }
};

const getRecommendation = async (req, res) => {
  try {
    const dispute = req.dispute;

    const evidence = await prisma.disputeEvidence.findMany({
      where: {
        disputeId: dispute.id,
        tenantId: req.tenant.id,
      },
      orderBy: { submittedAt: 'desc' },
    });

    const recommendation = generateResolutionRecommendation(dispute, evidence);

    res.json({
      disputeId: dispute.id,
      recommendation,
      evidenceCount: evidence.length,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error getting recommendation:', error);
    res.status(500).json({ error: 'Failed to get recommendation' });
  }
};

const postAppeal = async (req, res) => {
  try {
    const { reason } = req.body;
    const userAddress = req.user?.walletAddress ?? req.userAddress;

    if (!reason || reason.trim().length === 0) {
      return res.status(400).json({ error: 'Appeal reason is required' });
    }

    const dispute = req.dispute;

    const appeal = await prisma.disputeAppeal.create({
      data: {
        tenantId: req.tenant.id,
        disputeId: dispute.id,
        appealedBy: userAddress,
        reason: reason.trim(),
      },
    });

    broadcastToDispute(dispute.id, {
      type: 'appeal_filed',
      disputeId: dispute.id,
      appealId: appeal.id,
      appealedBy: userAddress,
      timestamp: new Date().toISOString(),
    });

    res.status(201).json({
      message: 'Appeal filed successfully',
      appeal,
    });
  } catch (error) {
    console.error('Error posting appeal:', error);
    res.status(500).json({ error: 'Failed to post appeal' });
  }
};

const patchAppeal = async (req, res) => {
  try {
    const { appealId } = req.params;
    const { status, reviewNotes } = req.body;
    const userAddress = req.user?.walletAddress ?? req.userAddress;

    const appeal = await prisma.disputeAppeal.findFirst({
      where: {
        id: parseInt(appealId),
        tenantId: req.tenant.id,
      },
    });

    if (!appeal) {
      return res.status(404).json({ error: 'Appeal not found' });
    }

    const updatedAppeal = await prisma.disputeAppeal.update({
      where: { id: appeal.id },
      data: {
        status,
        reviewNotes,
        reviewedBy: userAddress,
        resolvedAt: status === 'approved' || status === 'rejected' ? new Date() : null,
      },
    });

    res.json({
      message: 'Appeal updated successfully',
      appeal: updatedAppeal,
    });
  } catch (error) {
    console.error('Error updating appeal:', error);
    res.status(500).json({ error: 'Failed to update appeal' });
  }
};

const getResolutionHistory = async (req, res) => {
  try {
    const { take, parsedCursor, sortDir } = parseCursorPagination(req.query, 'resolvedAt', 'desc');

    const where = {
      tenantId: req.tenant.id,
      resolvedAt: { not: null },
    };

    const findArgs = buildPrismaFindArgs({
      parsedCursor: parsedCursor ? { ...parsedCursor, id: parseInt(parsedCursor.id, 10) } : null,
      take,
      sortField: 'resolvedAt',
      sortDir,
      idField: 'id',
    });

    const disputes = await prisma.dispute.findMany({
      where,
      include: {
        escrow: {
          select: {
            clientAddress: true,
            freelancerAddress: true,
            totalAmount: true,
          },
        },
      },
      ...findArgs,
    });

    res.json(buildCursorResponse(disputes, take, 'id', 'resolvedAt', sortDir));
  } catch (error) {
    console.error('Error getting resolution history:', error);
    res.status(500).json({ error: 'Failed to get resolution history' });
  }
};

/**
 * POST /api/disputes/verify-evidence
 * Body: multipart/form-data with files[] + evidenceIds[]
 *
 * Re-uploads files and verifies their SHA-256 hashes against stored values.
 * Also recomputes the Merkle root and compares against the stored root.
 */
const verifyEvidence = async (req, res) => {
  try {
    const { evidenceIds } = req.body;
    const files = req.files ?? [];

    if (!evidenceIds || !files.length) {
      return res.status(400).json({ error: 'evidenceIds and files are required' });
    }

    const ids = (Array.isArray(evidenceIds) ? evidenceIds : [evidenceIds]).map(Number);

    const records = await prisma.disputeEvidence.findMany({
      where: { id: { in: ids } },
      select: { id: true, fileHash: true, merkleRoot: true, filename: true },
    });

    if (records.length !== files.length) {
      return res.status(400).json({ error: 'File count must match evidenceIds count' });
    }

    const fileResults = files.map((file, i) => {
      const record = records[i];
      if (!record?.fileHash) return { id: record?.id, valid: false, reason: 'No stored hash' };
      const { hex } = hashFile(file.buffer);
      return { id: record.id, filename: file.originalname, valid: hex === record.fileHash };
    });

    const storedHashes = records.map((r) => r.fileHash).filter(Boolean);
    const recomputedRoot = merkleRoot(storedHashes);
    const storedRoot = records[0]?.merkleRoot ?? null;
    const rootMatch = storedRoot ? recomputedRoot === storedRoot : null;

    return res.json({
      allValid: fileResults.every((r) => r.valid),
      fileResults,
      merkleRoot: recomputedRoot,
      storedMerkleRoot: storedRoot,
      rootMatch,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

/**
 * GET /api/disputes/:id/timeline
 * Chronological timeline of a dispute's lifecycle, aggregated from the
 * existing dispute/evidence/appeal/escrow tables.
 */
const getTimeline = async (req, res) => {
  try {
    const disputeId = parseInt(req.params.id, 10);
    if (Number.isNaN(disputeId)) {
      return respond.error(res, 400, 'VALIDATION_ERROR', 'Invalid dispute id');
    }

    const events = await getDisputeTimeline(disputeId, req.tenant.id);
    if (!events) {
      return respond.error(res, 404, 'NOT_FOUND', 'Dispute not found');
    }

    return respond.success(res, { events });
  } catch (error) {
    console.error('Error getting dispute timeline:', error);
    return respond.error(res, 500, 'INTERNAL_ERROR', 'Failed to get dispute timeline');
  }
};

function determineUserRole(dispute, userAddress) {
  if (dispute.raisedByAddress === userAddress) {
    return dispute.escrow.clientAddress === userAddress ? 'client' : 'freelancer';
  }
  if (dispute.escrow.clientAddress === userAddress) return 'client';
  if (dispute.escrow.freelancerAddress === userAddress) return 'freelancer';
  return 'arbiter';
}

function generateResolutionRecommendation(dispute, evidence) {
  const clientEvidence = evidence.filter((e) => e.role === 'client').length;
  const freelancerEvidence = evidence.filter((e) => e.role === 'freelancer').length;
  const fileEvidence = evidence.filter(
    (e) => e.evidenceType === 'file' || e.evidenceType === 'image',
  ).length;

  let recommendation = {
    suggestedOutcome: 'manual_review',
    confidence: 0.5,
    reasoning: [],
  };

  if (fileEvidence > 0) {
    recommendation.confidence += 0.2;
    recommendation.reasoning.push('Documentary evidence provided');
  }

  if (clientEvidence > freelancerEvidence + 2) {
    recommendation.suggestedOutcome = 'favor_client';
    recommendation.confidence += 0.1;
    recommendation.reasoning.push('Client provided significantly more evidence');
  } else if (freelancerEvidence > clientEvidence + 2) {
    recommendation.suggestedOutcome = 'favor_freelancer';
    recommendation.confidence += 0.1;
    recommendation.reasoning.push('Freelancer provided significantly more evidence');
  }

  recommendation.confidence = Math.min(recommendation.confidence, 0.9);

  return recommendation;
}

export default {
  listDisputes,
  getDispute,
  postEvidence,
  listEvidence,
  autoResolve,
  getRecommendation,
  postAppeal,
  patchAppeal,
  getResolutionHistory,
  uploadEvidence,
  verifyEvidence,
  getTimeline,
};
