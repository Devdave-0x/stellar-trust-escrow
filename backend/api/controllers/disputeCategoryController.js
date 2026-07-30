/**
 * Dispute Category Controller
 *
 * Public read access to dispute categories plus admin CRUD. Categories are
 * platform-wide (not tenant scoped) so every tenant routes disputes through
 * the same arbiter pools.
 *
 * @module controllers/disputeCategoryController
 */

import prisma from '../../lib/prisma.js';
import { logControllerError } from '../../config/logger.js';
import respond from '../../lib/respond.js';

const CATEGORY_SELECT = {
  id: true,
  name: true,
  description: true,
  defaultArbiterPoolId: true,
  active: true,
};

// === Public

const listCategories = async (_req, res) => {
  try {
    const categories = await prisma.disputeCategory.findMany({
      where: { active: true },
      select: CATEGORY_SELECT,
      orderBy: { id: 'asc' },
    });
    return respond.success(res, categories);
  } catch (error) {
    logControllerError('listCategories', error);
    return respond.error(res, 500, 'INTERNAL_ERROR', 'Failed to list dispute categories');
  }
};

// === Admin

const adminListCategories = async (_req, res) => {
  try {
    const categories = await prisma.disputeCategory.findMany({
      select: CATEGORY_SELECT,
      orderBy: { id: 'asc' },
    });
    return res.json({ categories });
  } catch (error) {
    logControllerError('adminListCategories', error);
    return res.status(500).json({ error: 'Failed to list dispute categories' });
  }
};

const createCategory = async (req, res) => {
  try {
    const { name, description, defaultArbiterPoolId } = req.body || {};

    if (!name?.trim()) {
      return res.status(400).json({ error: 'name is required' });
    }

    const existing = await prisma.disputeCategory.findUnique({ where: { name: name.trim() } });
    if (existing) {
      return res.status(409).json({ error: 'A category with that name already exists' });
    }

    const category = await prisma.disputeCategory.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        defaultArbiterPoolId: defaultArbiterPoolId?.trim() || null,
      },
      select: CATEGORY_SELECT,
    });

    return res.status(201).json(category);
  } catch (error) {
    logControllerError('createCategory', error);
    return res.status(500).json({ error: 'Failed to create dispute category' });
  }
};

const updateCategory = async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'id must be an integer' });
    }

    const existing = await prisma.disputeCategory.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Dispute category not found' });
    }

    const { name, description, defaultArbiterPoolId, active } = req.body || {};
    const data = {};
    if (name !== undefined) {
      if (!name?.trim()) return res.status(400).json({ error: 'name must not be empty' });
      data.name = name.trim();
    }
    if (description !== undefined) data.description = description?.trim() || null;
    if (defaultArbiterPoolId !== undefined) {
      data.defaultArbiterPoolId = defaultArbiterPoolId?.trim() || null;
    }
    if (active !== undefined) data.active = Boolean(active);

    const category = await prisma.disputeCategory.update({
      where: { id },
      data,
      select: CATEGORY_SELECT,
    });

    return res.json(category);
  } catch (error) {
    logControllerError('updateCategory', error);
    return res.status(500).json({ error: 'Failed to update dispute category' });
  }
};

const deleteCategory = async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'id must be an integer' });
    }

    const existing = await prisma.disputeCategory.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Dispute category not found' });
    }

    const inUse = await prisma.dispute.count({ where: { categoryId: id } });
    if (inUse > 0) {
      // Existing disputes keep their category_id, so deactivate instead of deleting.
      await prisma.disputeCategory.update({ where: { id }, data: { active: false } });
      return res.json({ deactivated: true, disputes: inUse });
    }

    await prisma.disputeCategory.delete({ where: { id } });
    return res.status(204).send();
  } catch (error) {
    logControllerError('deleteCategory', error);
    return res.status(500).json({ error: 'Failed to delete dispute category' });
  }
};

export default {
  listCategories,
  adminListCategories,
  createCategory,
  updateCategory,
  deleteCategory,
};
