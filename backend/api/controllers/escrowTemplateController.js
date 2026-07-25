/**
 * Escrow Template Controller
 *
 * Lets a user save a reusable escrow configuration (title prefix, amount,
 * currency, milestone structure, tags) and apply it later to pre-fill a new
 * escrow. Escrow creation itself is an on-chain action (see escrowController
 * broadcastCreateEscrow, Issue #20) — "apply" returns the merged config the
 * client uses to build that transaction, it does not write an escrows row.
 *
 * @module controllers/escrowTemplateController
 */

import prisma from '../../lib/prisma.js';

const CONFIG_FIELDS = ['titlePrefix', 'amount', 'currency', 'milestones', 'tags'];

function pickConfig(source = {}) {
  const config = {};
  for (const field of CONFIG_FIELDS) {
    if (source[field] !== undefined) config[field] = source[field];
  }
  return config;
}

async function buildConfigFromEscrow(escrowId) {
  const escrow = await prisma.escrow.findUnique({
    where: { id: BigInt(escrowId) },
    include: { milestones: { orderBy: { milestoneIndex: 'asc' } } },
  });
  if (!escrow) throw new Error('Source escrow not found.');

  return {
    titlePrefix: '',
    amount: escrow.totalAmount,
    currency: escrow.tokenAddress,
    milestones: escrow.milestones.map((m) => ({ title: m.title, amount: m.amount })),
    tags: [],
  };
}

/**
 * POST /api/v1/escrow-templates
 * Body: { name, config } or { name, fromEscrowId }
 */
const createTemplate = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { name, config, fromEscrowId } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({ error: 'name is required.' });
    }
    if (!config && !fromEscrowId) {
      return res.status(400).json({ error: 'Either config or fromEscrowId is required.' });
    }

    const resolvedConfig = fromEscrowId ? await buildConfigFromEscrow(fromEscrowId) : pickConfig(config);

    const template = await prisma.escrowTemplate.create({
      data: { userId, name: name.trim(), config: resolvedConfig },
    });

    res.status(201).json(template);
  } catch (err) {
    if (err.message === 'Source escrow not found.') {
      return res.status(404).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
};

/**
 * GET /api/v1/escrow-templates
 * List the authenticated user's templates.
 */
const listTemplates = async (req, res) => {
  try {
    const userId = req.user.userId;
    const templates = await prisma.escrowTemplate.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    res.json(templates);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * POST /api/v1/escrow-templates/:id/apply
 * Merges the template's saved config with any override fields in the body
 * and returns the pre-filled escrow draft ready for on-chain submission.
 */
const applyTemplate = async (req, res) => {
  try {
    const userId = req.user.userId;
    const id = parseInt(req.params.id, 10);

    const template = await prisma.escrowTemplate.findUnique({ where: { id } });
    if (!template || template.userId !== userId) {
      return res.status(404).json({ error: 'Template not found.' });
    }

    const overrides = pickConfig(req.body);
    const config = { ...template.config, ...overrides };

    res.status(201).json({ template, config });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * DELETE /api/v1/escrow-templates/:id
 */
const deleteTemplate = async (req, res) => {
  try {
    const userId = req.user.userId;
    const id = parseInt(req.params.id, 10);

    const template = await prisma.escrowTemplate.findUnique({ where: { id } });
    if (!template || template.userId !== userId) {
      return res.status(404).json({ error: 'Template not found.' });
    }

    await prisma.escrowTemplate.delete({ where: { id } });
    res.json({ message: 'Template deleted.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export default { createTemplate, listTemplates, applyTemplate, deleteTemplate };
