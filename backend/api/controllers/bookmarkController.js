import { createId } from '@paralleldrive/cuid2';
import prisma from '../../lib/prisma.js';
import { logControllerError } from '../../config/logger.js';

/**
 * POST /api/escrows/:id/bookmark
 * Add the authenticated user's bookmark on an escrow.
 */
export const addBookmark = async (req, res) => {
  try {
    const userAddress = req.user?.address;
    if (!userAddress) return res.status(401).json({ error: 'Authentication required' });

    const escrowId = BigInt(req.params.id);

    const bookmark = await prisma.escrowBookmark.upsert({
      where: { userAddress_escrowId: { userAddress, escrowId } },
      update: {},
      create: { id: createId(), userAddress, escrowId },
    });

    res.status(201).json({
      isBookmarked: true,
      bookmark: { ...bookmark, escrowId: bookmark.escrowId.toString() },
    });
  } catch (err) {
    logControllerError('bookmark.addBookmark', err, req);
    res.status(500).json({ error: err.message });
  }
};

/**
 * DELETE /api/escrows/:id/bookmark
 * Remove the authenticated user's bookmark from an escrow.
 */
export const removeBookmark = async (req, res) => {
  try {
    const userAddress = req.user?.address;
    if (!userAddress) return res.status(401).json({ error: 'Authentication required' });

    const escrowId = BigInt(req.params.id);

    await prisma.escrowBookmark.deleteMany({
      where: { userAddress, escrowId },
    });

    res.json({ isBookmarked: false });
  } catch (err) {
    logControllerError('bookmark.removeBookmark', err, req);
    res.status(500).json({ error: err.message });
  }
};

/**
 * GET /api/users/:address/bookmarks
 * List all escrows bookmarked by the user (paginated), with is_bookmarked flag.
 */
export const listBookmarks = async (req, res) => {
  try {
    const { address } = req.params;
    const page = parseInt(req.query.page || '1', 10);
    const limit = Math.min(parseInt(req.query.limit || '20', 10), 100);
    const skip = (page - 1) * limit;

    const [bookmarks, total] = await Promise.all([
      prisma.escrowBookmark.findMany({
        where: { userAddress: address },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: { escrowId: true, createdAt: true },
      }),
      prisma.escrowBookmark.count({ where: { userAddress: address } }),
    ]);

    const escrowIds = bookmarks.map((b) => b.escrowId);

    const escrows = escrowIds.length
      ? await prisma.escrow.findMany({
          where: { id: { in: escrowIds } },
          select: {
            id: true,
            status: true,
            totalAmount: true,
            remainingBalance: true,
            clientAddress: true,
            freelancerAddress: true,
            deadline: true,
            createdAt: true,
          },
        })
      : [];

    const escrowMap = new Map(escrows.map((e) => [e.id.toString(), e]));

    const items = bookmarks.map((b) => ({
      ...escrowMap.get(b.escrowId.toString()),
      id: b.escrowId.toString(),
      isBookmarked: true,
      bookmarkedAt: b.createdAt,
    }));

    res.json({ data: items, total, page, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    logControllerError('bookmark.listBookmarks', err, req);
    res.status(500).json({ error: err.message });
  }
};
