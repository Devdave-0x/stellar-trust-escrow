/**
 * Dispute Category Controller
 *
 * Public read access for category selection at dispute-creation time,
 * plus admin CRUD for managing the category list.
 *
 * @module controllers/disputeCategoryController
 */

import prisma from '../../lib/prisma.js';
import cache from '../../lib/cache.js';

const CACHE_KEY = 'dispute-categories:list';

/**
 * GET /api/v1/dispute-categories
 * Public list of dispute categories.
 */
const listCategories = async (_req, res) => {
  try {
    const cached = await cache.get(CACHE_KEY);
    if (cached) return res.json(cached);

    const categories = await prisma.disputeCategory.findMany({ orderBy: { id: 'asc' } });
    await cache.set(CACHE_KEY, categories, 60);
    res.json(categories);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * GET /api/v1/admin/dispute-categories
 */
const adminListCategories = async (_req, res) => {
  try {
    const categories = await prisma.disputeCategory.findMany({ orderBy: { id: 'asc' } });
    res.json(categories);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * POST /api/v1/admin/dispute-categories
 * Body: { name, description?, defaultArbiterPoolId? }
 */
const adminCreateCategory = async (req, res) => {
  try {
    const { name, description, defaultArbiterPoolId } = req.body;
    if (!name?.trim()) {
      return res.status(400).json({ error: 'name is required.' });
    }

    const category = await prisma.disputeCategory.create({
      data: { name: name.trim(), description: description ?? null, defaultArbiterPoolId: defaultArbiterPoolId ?? null },
    });

    await cache.invalidate(CACHE_KEY);
    res.status(201).json(category);
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'A category with that name already exists.' });
    }
    res.status(500).json({ error: err.message });
  }
};

/**
 * PATCH /api/v1/admin/dispute-categories/:id
 * Body: { name?, description?, defaultArbiterPoolId? }
 */
const adminUpdateCategory = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { name, description, defaultArbiterPoolId } = req.body;

    const existing = await prisma.disputeCategory.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Category not found.' });

    const category = await prisma.disputeCategory.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(defaultArbiterPoolId !== undefined && { defaultArbiterPoolId }),
      },
    });

    await cache.invalidate(CACHE_KEY);
    res.json(category);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * DELETE /api/v1/admin/dispute-categories/:id
 */
const adminDeleteCategory = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);

    const existing = await prisma.disputeCategory.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Category not found.' });

    await prisma.disputeCategory.delete({ where: { id } });
    await cache.invalidate(CACHE_KEY);
    res.json({ message: 'Category deleted.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export default {
  listCategories,
  adminListCategories,
  adminCreateCategory,
  adminUpdateCategory,
  adminDeleteCategory,
};
