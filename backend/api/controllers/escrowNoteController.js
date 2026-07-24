import { createId } from '@paralleldrive/cuid2';
import prisma from '../../lib/prisma.js';
import { createModuleLogger } from '../../config/logger.js';

const logger = createModuleLogger('escrowNoteController');

const EDIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_BODY_LENGTH = 5000;
const DEFAULT_PAGE_SIZE = 20;

function parseEscrowId(raw) {
  try {
    return BigInt(raw);
  } catch {
    return null;
  }
}

async function requireParticipant(escrowId, address) {
  const escrow = await prisma.escrow.findUnique({
    where: { id: escrowId },
    select: { clientAddress: true, freelancerAddress: true, arbiterAddress: true },
  });
  if (!escrow) return null;
  const allowed =
    escrow.clientAddress === address ||
    escrow.freelancerAddress === address ||
    escrow.arbiterAddress === address;
  return allowed ? escrow : false;
}

/**
 * POST /api/escrows/:id/notes
 */
export async function createNote(req, res) {
  try {
    const escrowId = parseEscrowId(req.params.id);
    if (!escrowId) return res.status(400).json({ error: 'Invalid escrow id' });

    const { body } = req.body;
    if (!body || typeof body !== 'string' || body.trim().length === 0)
      return res.status(400).json({ error: 'body is required' });
    if (body.length > MAX_BODY_LENGTH)
      return res.status(400).json({ error: `body must be at most ${MAX_BODY_LENGTH} characters` });

    const authorAddress = req.user.address;
    const participant = await requireParticipant(escrowId, authorAddress);
    if (participant === null) return res.status(404).json({ error: 'Escrow not found' });
    if (participant === false)
      return res.status(403).json({ error: 'Only escrow participants can add notes' });

    const note = await prisma.escrowNote.create({
      data: {
        id: createId(),
        escrowId,
        tenantId: req.tenantId || 'default',
        authorAddress,
        body: body.trim(),
      },
      select: {
        id: true,
        escrowId: true,
        authorAddress: true,
        body: true,
        editedAt: true,
        createdAt: true,
      },
    });

    logger.info({ noteId: note.id, escrowId: String(escrowId) }, 'Note created');
    res.status(201).json({ note: { ...note, escrowId: String(note.escrowId) } });
  } catch (err) {
    logger.error({ err }, 'createNote failed');
    res.status(500).json({ error: err.message });
  }
}

/**
 * GET /api/escrows/:id/notes
 */
export async function listNotes(req, res) {
  try {
    const escrowId = parseEscrowId(req.params.id);
    if (!escrowId) return res.status(400).json({ error: 'Invalid escrow id' });

    const participant = await requireParticipant(escrowId, req.user.address);
    if (participant === null) return res.status(404).json({ error: 'Escrow not found' });
    if (participant === false)
      return res.status(403).json({ error: 'Only escrow participants can view notes' });

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || DEFAULT_PAGE_SIZE));
    const skip = (page - 1) * limit;

    const [notes, total] = await Promise.all([
      prisma.escrowNote.findMany({
        where: { escrowId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          escrowId: true,
          authorAddress: true,
          body: true,
          editedAt: true,
          createdAt: true,
        },
      }),
      prisma.escrowNote.count({ where: { escrowId, deletedAt: null } }),
    ]);

    res.json({
      notes: notes.map((n) => ({ ...n, escrowId: String(n.escrowId) })),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    logger.error({ err }, 'listNotes failed');
    res.status(500).json({ error: err.message });
  }
}

/**
 * PATCH /api/escrows/:id/notes/:noteId
 */
export async function updateNote(req, res) {
  try {
    const escrowId = parseEscrowId(req.params.id);
    if (!escrowId) return res.status(400).json({ error: 'Invalid escrow id' });

    const { noteId } = req.params;
    const { body } = req.body;
    if (!body || typeof body !== 'string' || body.trim().length === 0)
      return res.status(400).json({ error: 'body is required' });
    if (body.length > MAX_BODY_LENGTH)
      return res.status(400).json({ error: `body must be at most ${MAX_BODY_LENGTH} characters` });

    const note = await prisma.escrowNote.findUnique({
      where: { id: noteId },
      select: { id: true, escrowId: true, authorAddress: true, deletedAt: true, createdAt: true },
    });

    if (!note || note.escrowId !== escrowId)
      return res.status(404).json({ error: 'Note not found' });
    if (note.deletedAt) return res.status(410).json({ error: 'Note has been deleted' });
    if (note.authorAddress !== req.user.address)
      return res.status(403).json({ error: 'Only the note author can edit it' });

    const ageMs = Date.now() - note.createdAt.getTime();
    if (ageMs > EDIT_WINDOW_MS)
      return res.status(403).json({ error: 'Edit window has closed (15 minutes after creation)' });

    const updated = await prisma.escrowNote.update({
      where: { id: noteId },
      data: { body: body.trim(), editedAt: new Date() },
      select: {
        id: true,
        escrowId: true,
        authorAddress: true,
        body: true,
        editedAt: true,
        createdAt: true,
      },
    });

    res.json({ note: { ...updated, escrowId: String(updated.escrowId) } });
  } catch (err) {
    logger.error({ err }, 'updateNote failed');
    res.status(500).json({ error: err.message });
  }
}

/**
 * DELETE /api/escrows/:id/notes/:noteId
 * Soft-delete: author or admin only
 */
export async function deleteNote(req, res) {
  try {
    const escrowId = parseEscrowId(req.params.id);
    if (!escrowId) return res.status(400).json({ error: 'Invalid escrow id' });

    const { noteId } = req.params;
    const note = await prisma.escrowNote.findUnique({
      where: { id: noteId },
      select: { id: true, escrowId: true, authorAddress: true, deletedAt: true },
    });

    if (!note || note.escrowId !== escrowId)
      return res.status(404).json({ error: 'Note not found' });
    if (note.deletedAt) return res.status(410).json({ error: 'Note is already deleted' });

    const isAuthor = note.authorAddress === req.user.address;
    const isAdmin = req.user.role === 'admin' || req.user.role === 'superadmin';
    if (!isAuthor && !isAdmin)
      return res.status(403).json({ error: 'Only the note author or an admin can delete notes' });

    await prisma.escrowNote.update({
      where: { id: noteId },
      data: { deletedAt: new Date() },
    });

    res.json({ message: 'Note deleted' });
  } catch (err) {
    logger.error({ err }, 'deleteNote failed');
    res.status(500).json({ error: err.message });
  }
}
