import { randomBytes } from 'crypto';
import { createId } from '@paralleldrive/cuid2';
import prisma from '../../lib/prisma.js';
import { logControllerError } from '../../config/logger.js';
import {
  shareLinkCreateResponseSchema,
  shareLinkResolveResponseSchema,
} from '../../../shared/schemas/shareLink.js';

const DEFAULT_TTL_DAYS = 30;

/**
 * Send `payload` only if it matches the shared share-link schema, so clients
 * that validate against the same schema never receive a drifted shape.
 * A mismatch is a server bug: log it and return 500 rather than bad data.
 */
function sendValidated(res, schema, payload, status = 200, context = 'shareLink') {
  const result = schema.safeParse(payload);
  if (!result.success) {
    logControllerError(`${context}.responseSchema`, result.error, res.req);
    return res.status(500).json({ error: 'Share link response failed validation' });
  }
  return res.status(status).json(payload);
}

function generateToken() {
  return randomBytes(24).toString('base64url');
}

/**
 * POST /api/escrows/:id/share
 * Generate a public share link for an escrow.
 * Body: { expiresInDays?: number }
 */
export const createShareLink = async (req, res) => {
  try {
    const userAddress = req.user?.address;
    if (!userAddress) return res.status(401).json({ error: 'Authentication required' });

    const escrowId = BigInt(req.params.id);

    const escrow = await prisma.escrow.findUnique({
      where: { id: escrowId },
      select: { id: true, clientAddress: true, freelancerAddress: true },
    });
    if (!escrow) return res.status(404).json({ error: 'Escrow not found' });

    if (escrow.clientAddress !== userAddress && escrow.freelancerAddress !== userAddress) {
      return res.status(403).json({ error: 'Only escrow participants can create share links' });
    }

    const ttlDays = parseInt(req.body?.expiresInDays ?? DEFAULT_TTL_DAYS, 10);
    const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

    const link = await prisma.escrowShareLink.create({
      data: {
        id: createId(),
        token: generateToken(),
        escrowId,
        createdBy: userAddress,
        expiresAt,
      },
    });

    const baseUrl = process.env.API_BASE_URL || 'http://localhost:4000';

    return sendValidated(
      res,
      shareLinkCreateResponseSchema,
      {
        token: link.token,
        shareUrl: `${baseUrl}/api/share/${link.token}`,
        expiresAt: link.expiresAt,
        createdAt: link.createdAt,
      },
      201,
      'shareLink.createShareLink',
    );
  } catch (err) {
    logControllerError('shareLink.createShareLink', err, req);
    res.status(500).json({ error: err.message });
  }
};

/**
 * DELETE /api/escrows/:id/share/:token
 * Revoke a share link (soft-delete by setting revokedAt).
 */
export const revokeShareLink = async (req, res) => {
  try {
    const userAddress = req.user?.address;
    if (!userAddress) return res.status(401).json({ error: 'Authentication required' });

    const { token } = req.params;
    const escrowId = BigInt(req.params.id);

    const link = await prisma.escrowShareLink.findFirst({
      where: { token, escrowId, revokedAt: null },
    });

    if (!link) return res.status(404).json({ error: 'Share link not found or already revoked' });

    if (link.createdBy !== userAddress) {
      return res.status(403).json({ error: 'Only the link creator can revoke it' });
    }

    await prisma.escrowShareLink.update({
      where: { id: link.id },
      data: { revokedAt: new Date() },
    });

    res.json({ revoked: true, token });
  } catch (err) {
    logControllerError('shareLink.revokeShareLink', err, req);
    res.status(500).json({ error: err.message });
  }
};

/**
 * GET /api/share/:token
 * Public endpoint — resolve a share token to a sanitised escrow view.
 * No authentication required.
 */
export const resolveShareLink = async (req, res) => {
  try {
    const { token } = req.params;

    const link = await prisma.escrowShareLink.findUnique({ where: { token } });

    if (!link || link.revokedAt) {
      return res.status(404).json({ error: 'Share link not found or has been revoked' });
    }

    if (link.expiresAt && link.expiresAt < new Date()) {
      return res.status(410).json({ error: 'Share link has expired' });
    }

    const escrow = await prisma.escrow.findUnique({
      where: { id: link.escrowId },
      select: {
        id: true,
        status: true,
        totalAmount: true,
        remainingBalance: true,
        deadline: true,
        createdAt: true,
        milestones: {
          select: { id: true, title: true, amount: true, status: true },
          orderBy: { id: 'asc' },
        },
      },
    });

    if (!escrow) return res.status(404).json({ error: 'Escrow not found' });

    return sendValidated(
      res,
      shareLinkResolveResponseSchema,
      {
        escrow: { ...escrow, id: escrow.id.toString() },
        sharedAt: link.createdAt,
        expiresAt: link.expiresAt,
      },
      200,
      'shareLink.resolveShareLink',
    );
  } catch (err) {
    logControllerError('shareLink.resolveShareLink', err, req);
    res.status(500).json({ error: err.message });
  }
};
