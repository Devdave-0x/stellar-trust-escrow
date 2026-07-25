/**
 * Escrow Message Controller
 *
 * In-context messaging between escrow participants (client, freelancer, arbiter).
 * Participation is determined by matching the requesting user's wallet address
 * against the escrow's on-chain addresses — there is no join table.
 */

import { body } from 'express-validator';
import prisma from '../../lib/prisma.js';
import { buildPaginatedResponse, parsePagination } from '../../lib/pagination.js';
import { logControllerError } from '../../config/logger.js';
import { handleValidationErrors } from '../../middleware/validation.js';
import emailService from '../../services/emailService.js';

const MAX_BODY_LENGTH = 5000;

// ── Helpers ───────────────────────────────────────────────────────────────────

async function loadEscrow(id) {
  return prisma.escrow.findUnique({ where: { id } });
}

async function resolveParticipant(escrow, userId) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const address = user?.walletAddress;
  if (!address) return null;

  if (escrow.clientAddress === address) return { role: 'client', address, user };
  if (escrow.freelancerAddress === address) return { role: 'freelancer', address, user };
  if (escrow.arbiterAddress === address) return { role: 'arbiter', address, user };
  return null;
}

function parseEscrowId(req) {
  return BigInt(req.params.id);
}

async function notifyOtherParticipants({ escrow, sender, body: messageBody }) {
  const otherAddresses = [escrow.clientAddress, escrow.freelancerAddress, escrow.arbiterAddress]
    .filter(Boolean)
    .filter((address) => address !== sender.address);

  if (otherAddresses.length === 0) return;

  const recipients = (
    await prisma.user.findMany({ where: { walletAddress: { in: otherAddresses } } })
  )
    .filter((user) => Boolean(user.email))
    .map((user) => ({ email: user.email, address: user.walletAddress }));

  if (recipients.length === 0) return;

  const baseUrl = process.env.EMAIL_BASE_URL || `http://localhost:${process.env.PORT || 4000}`;

  await emailService.notifyNewMessage({
    escrowId: escrow.id.toString(),
    senderAddress: sender.address,
    preview: messageBody.slice(0, 140),
    dashboardUrl: `${baseUrl}/escrows/${escrow.id}`,
    recipients,
  });
}

function serializeMessage(message) {
  return {
    ...message,
    id: message.id,
    escrowId: message.escrowId.toString(),
  };
}

// ── Handlers ──────────────────────────────────────────────────────────────────

const sendMessage = async (req, res) => {
  try {
    const id = parseEscrowId(req);
    const escrow = await loadEscrow(id);
    if (!escrow) return res.status(404).json({ error: 'Escrow not found' });

    const participant = await resolveParticipant(escrow, req.user.userId);
    if (!participant) {
      return res.status(403).json({ error: 'Forbidden: not a participant in this escrow.' });
    }

    const messageBody = req.body.body.trim();

    const message = await prisma.escrowMessage.create({
      data: {
        tenantId: req.tenant.id,
        escrowId: id,
        senderId: req.user.userId,
        body: messageBody,
        readBy: [req.user.userId],
      },
    });

    try {
      await notifyOtherParticipants({ escrow, sender: participant, body: messageBody });
    } catch (err) {
      console.error('[EscrowMessage] Failed to notify participants:', err.message);
    }

    res.status(201).json(serializeMessage(message));
  } catch (err) {
    if (err.message?.includes('Cannot convert')) {
      return res.status(400).json({ error: 'Invalid escrow id' });
    }
    logControllerError('escrowMessage.sendMessage', err, req);
    res.status(500).json({ error: err.message });
  }
};

const listMessages = async (req, res) => {
  try {
    const id = parseEscrowId(req);
    const escrow = await loadEscrow(id);
    if (!escrow) return res.status(404).json({ error: 'Escrow not found' });

    const participant = await resolveParticipant(escrow, req.user.userId);
    if (!participant) {
      return res.status(403).json({ error: 'Forbidden: not a participant in this escrow.' });
    }

    const { page, limit, skip } = parsePagination(req.query);

    const [data, total] = await prisma.$transaction([
      prisma.escrowMessage.findMany({
        where: { escrowId: id },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          sender: { select: { id: true, email: true, walletAddress: true } },
        },
      }),
      prisma.escrowMessage.count({ where: { escrowId: id } }),
    ]);

    res.json(buildPaginatedResponse(data.map(serializeMessage), { total, page, limit }));
  } catch (err) {
    if (err.message?.includes('Cannot convert')) {
      return res.status(400).json({ error: 'Invalid escrow id' });
    }
    logControllerError('escrowMessage.listMessages', err, req);
    res.status(500).json({ error: err.message });
  }
};

const markRead = async (req, res) => {
  try {
    const id = parseEscrowId(req);
    const escrow = await loadEscrow(id);
    if (!escrow) return res.status(404).json({ error: 'Escrow not found' });

    const participant = await resolveParticipant(escrow, req.user.userId);
    if (!participant) {
      return res.status(403).json({ error: 'Forbidden: not a participant in this escrow.' });
    }

    const unread = await prisma.escrowMessage.findMany({
      where: { escrowId: id, NOT: { readBy: { array_contains: req.user.userId } } },
      select: { id: true, readBy: true },
    });

    if (unread.length === 0) {
      return res.json({ marked: 0 });
    }

    await prisma.$transaction(
      unread.map((message) =>
        prisma.escrowMessage.update({
          where: { id: message.id },
          data: {
            readBy: [...(Array.isArray(message.readBy) ? message.readBy : []), req.user.userId],
          },
        }),
      ),
    );

    res.json({ marked: unread.length });
  } catch (err) {
    if (err.message?.includes('Cannot convert')) {
      return res.status(400).json({ error: 'Invalid escrow id' });
    }
    logControllerError('escrowMessage.markRead', err, req);
    res.status(500).json({ error: err.message });
  }
};

/** GET /api/v1/users/me/unread-messages */
const getUnreadCount = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
    const address = user?.walletAddress;
    if (!address) return res.json({ count: 0 });

    const escrows = await prisma.escrow.findMany({
      where: {
        OR: [
          { clientAddress: address },
          { freelancerAddress: address },
          { arbiterAddress: address },
        ],
      },
      select: { id: true },
    });

    if (escrows.length === 0) return res.json({ count: 0 });

    const count = await prisma.escrowMessage.count({
      where: {
        escrowId: { in: escrows.map((escrow) => escrow.id) },
        NOT: { readBy: { array_contains: req.user.userId } },
      },
    });

    res.json({ count });
  } catch (err) {
    logControllerError('escrowMessage.getUnreadCount', err, req);
    res.status(500).json({ error: err.message });
  }
};

export default { sendMessage, listMessages, markRead, getUnreadCount };

// ── Validation ───────────────────────────────────────────────────────────────
export const validateSendMessage = [
  body('body')
    .trim()
    .notEmpty()
    .withMessage('body is required')
    .isLength({ max: MAX_BODY_LENGTH })
    .withMessage(`body must be ${MAX_BODY_LENGTH} characters or fewer`),
  handleValidationErrors,
];
