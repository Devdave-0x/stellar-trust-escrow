/**
 * Admin review of insurance claims.
 *
 * The claim decision of record is the governor vote on the insurance
 * contract; this screen is the off-chain review workflow in front of it.
 * Decisions (approve / deny / request evidence) update the mirrored
 * insurance_claims status and are written to the audit log, which also
 * serves as the decision history.
 *
 * Pool impact is an estimate from the mirrored tables: premiums collected
 * from active opt-ins minus claims already paid, less other approved but
 * unpaid claims. The contract's get_fund_info remains authoritative.
 */

import prisma from '../../lib/prisma.js';
import { buildPaginatedResponse, parsePagination } from '../../lib/pagination.js';
import auditService, { AuditCategory } from '../../services/auditService.js';
import { logControllerError } from '../../config/logger.js';

const DECISIONS = {
  approve: { status: 'Approved', action: 'INSURANCE_CLAIM_APPROVED' },
  deny: { status: 'Rejected', action: 'INSURANCE_CLAIM_DENIED' },
  request_evidence: { status: 'EvidenceRequested', action: 'INSURANCE_CLAIM_EVIDENCE_REQUESTED' },
};
const REVIEWABLE = new Set(['Pending', 'EvidenceRequested']);

const toBig = (v) => {
  try {
    return BigInt(String(v ?? '0').split('.')[0] || '0');
  } catch {
    return 0n;
  }
};

/** Estimated pool position before and after paying `claimAmount`. */
async function poolImpact(claim) {
  const [optIns, paid, approved] = await Promise.all([
    prisma.insuranceOptIn.findMany({ where: { active: true }, select: { premiumPaid: true } }),
    prisma.insuranceClaim.findMany({ where: { status: 'Paid' }, select: { amount: true } }),
    prisma.insuranceClaim.findMany({ where: { status: 'Approved', NOT: { claimId: claim.claimId } }, select: { amount: true } }),
  ]);
  const sum = (rows, key) => rows.reduce((acc, r) => acc + toBig(r[key]), 0n);
  const balance = sum(optIns, 'premiumPaid') - sum(paid, 'amount');
  const committed = sum(approved, 'amount');
  const available = balance - committed;
  const afterPayout = available - toBig(claim.amount);
  return {
    estimatedBalance: balance.toString(),
    approvedUnpaid: committed.toString(),
    available: available.toString(),
    afterPayout: afterPayout.toString(),
    solvent: afterPayout >= 0n,
    source: 'mirrored tables (estimate; on-chain get_fund_info is authoritative)',
  };
}

/** GET /api/admin/insurance/claims?status= */
const listClaims = async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const where = typeof req.query.status === 'string' && req.query.status ? { status: req.query.status } : {};
    const [claims, total] = await Promise.all([
      prisma.insuranceClaim.findMany({ where, orderBy: { submittedAt: 'desc' }, skip, take: limit }),
      prisma.insuranceClaim.count({ where }),
    ]);
    res.json(buildPaginatedResponse(claims, { total, page, limit }));
  } catch (err) {
    logControllerError('insuranceReview.listClaims', err, req);
    res.status(500).json({ error: err.message });
  }
};

/** GET /api/admin/insurance/claims/:claimId — claim, evidence, pool impact, decision history. */
const getClaim = async (req, res) => {
  try {
    const claimId = parseInt(req.params.claimId, 10);
    if (!Number.isInteger(claimId)) return res.status(400).json({ error: 'Invalid claim id' });
    const claim = await prisma.insuranceClaim.findUnique({ where: { claimId } });
    if (!claim) return res.status(404).json({ error: 'Claim not found' });

    const history = await prisma.auditLog.findMany({
      where: { category: AuditCategory.ADMIN, resourceId: `insurance-claim:${claimId}` },
      orderBy: { createdAt: 'desc' },
      select: { action: true, actor: true, metadata: true, createdAt: true },
    });

    // description holds the evidence summary or an IPFS CID.
    const evidence = {
      description: claim.description,
      ipfsCid: /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{50,})$/.test(claim.description) ? claim.description : null,
    };

    res.json({ claim, evidence, poolImpact: await poolImpact(claim), history });
  } catch (err) {
    logControllerError('insuranceReview.getClaim', err, req);
    res.status(500).json({ error: err.message });
  }
};

/** POST /api/admin/insurance/claims/:claimId/decision { decision, note } */
const decideClaim = async (req, res) => {
  try {
    const claimId = parseInt(req.params.claimId, 10);
    const { decision, note } = req.body ?? {};
    const rule = DECISIONS[decision];
    if (!Number.isInteger(claimId) || !rule) {
      return res.status(400).json({ error: 'decision must be approve, deny or request_evidence' });
    }
    if (note !== undefined && (typeof note !== 'string' || note.length > 2000)) {
      return res.status(400).json({ error: 'note must be a string of at most 2000 characters' });
    }
    const claim = await prisma.insuranceClaim.findUnique({ where: { claimId } });
    if (!claim) return res.status(404).json({ error: 'Claim not found' });
    if (!REVIEWABLE.has(claim.status)) {
      return res.status(409).json({ error: `Claim is ${claim.status} and can no longer be reviewed` });
    }
    if (decision === 'approve' && !(await poolImpact(claim)).solvent) {
      return res.status(409).json({ error: 'Approving this claim would exceed the estimated pool balance' });
    }

    const updated = await prisma.insuranceClaim.update({ where: { claimId }, data: { status: rule.status } });
    await auditService.log({
      category: AuditCategory.ADMIN,
      action: rule.action,
      actor: req.admin?.adminId ? `admin:${req.admin.adminId}` : 'admin',
      resourceId: `insurance-claim:${claimId}`,
      metadata: { from: claim.status, to: rule.status, note: note ?? null },
      ipAddress: req.ip,
    });
    res.json({ claim: updated });
  } catch (err) {
    logControllerError('insuranceReview.decideClaim', err, req);
    res.status(500).json({ error: err.message });
  }
};

export default { listClaims, getClaim, decideClaim };
