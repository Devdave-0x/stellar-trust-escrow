/**
 * Announcement Controller
 *
 * Admin broadcast announcements, optionally targeted at a single tenant.
 * `target: 'all'` announcements are visible to every tenant; `target: 'tenant'`
 * announcements require a `tenantId` and are only visible to that tenant.
 */

import prisma from '../../lib/prisma.js';
import { withTenantScopeBypassed } from '../../lib/tenantContext.js';
import { logControllerError } from '../../config/logger.js';

const VALID_TARGETS = ['all', 'tenant'];

function parseDate(value, field, errors) {
  if (value === undefined) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    errors.push(`${field} must be a valid date`);
    return undefined;
  }
  return parsed;
}

// ── Admin handlers ───────────────────────────────────────────────────────────

const createAnnouncement = async (req, res) => {
  try {
    const { title, body, target = 'all', tenantId, createdBy } = req.body || {};
    const errors = [];

    if (!title?.trim()) errors.push('title is required');
    if (!body?.trim()) errors.push('body is required');
    if (!VALID_TARGETS.includes(target)) errors.push(`target must be one of: ${VALID_TARGETS.join(', ')}`);
    if (target === 'tenant' && !tenantId) errors.push('tenantId is required when target is "tenant"');

    const startsAt = parseDate(req.body?.startsAt, 'startsAt', errors) ?? new Date();
    const endsAt = parseDate(req.body?.endsAt, 'endsAt', errors);
    if (!req.body?.endsAt) errors.push('endsAt is required');
    if (startsAt && endsAt && endsAt <= startsAt) errors.push('endsAt must be after startsAt');

    if (errors.length > 0) {
      return res.status(400).json({ error: 'Validation failed', details: errors });
    }

    let resolvedTenantId = null;
    if (target === 'tenant') {
      const tenant = await withTenantScopeBypassed(() =>
        prisma.tenant.findUnique({ where: { id: tenantId } }),
      );
      if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
      resolvedTenantId = tenant.id;
    }

    const announcement = await withTenantScopeBypassed(() =>
      prisma.announcement.create({
        data: {
          title: title.trim(),
          body: body.trim(),
          target,
          tenantId: resolvedTenantId,
          startsAt,
          endsAt,
          createdBy: createdBy?.trim() || 'admin',
        },
      }),
    );

    res.status(201).json(announcement);
  } catch (err) {
    logControllerError('announcement.createAnnouncement', err, req);
    res.status(500).json({ error: err.message });
  }
};

const updateAnnouncement = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid announcement id' });

    const existing = await withTenantScopeBypassed(() =>
      prisma.announcement.findFirst({ where: { id, deletedAt: null } }),
    );
    if (!existing) return res.status(404).json({ error: 'Announcement not found' });

    const errors = [];
    const updates = {};
    const { title, body, target, tenantId, createdBy } = req.body || {};

    if (title !== undefined) {
      if (!title.trim()) errors.push('title cannot be empty');
      else updates.title = title.trim();
    }
    if (body !== undefined) {
      if (!body.trim()) errors.push('body cannot be empty');
      else updates.body = body.trim();
    }
    if (target !== undefined) {
      if (!VALID_TARGETS.includes(target)) errors.push(`target must be one of: ${VALID_TARGETS.join(', ')}`);
      else updates.target = target;
    }
    if (createdBy !== undefined) updates.createdBy = createdBy?.trim() || existing.createdBy;

    const resolvedTarget = updates.target ?? existing.target;
    if (resolvedTarget === 'tenant') {
      const nextTenantId = tenantId !== undefined ? tenantId : existing.tenantId;
      if (!nextTenantId) {
        errors.push('tenantId is required when target is "tenant"');
      } else {
        const tenant = await withTenantScopeBypassed(() =>
          prisma.tenant.findUnique({ where: { id: nextTenantId } }),
        );
        if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
        updates.tenantId = tenant.id;
      }
    } else if (target !== undefined) {
      updates.tenantId = null;
    }

    if (req.body?.startsAt !== undefined) {
      const startsAt = parseDate(req.body.startsAt, 'startsAt', errors);
      if (startsAt) updates.startsAt = startsAt;
    }
    if (req.body?.endsAt !== undefined) {
      const endsAt = parseDate(req.body.endsAt, 'endsAt', errors);
      if (endsAt) updates.endsAt = endsAt;
    }

    const nextStartsAt = updates.startsAt ?? existing.startsAt;
    const nextEndsAt = updates.endsAt ?? existing.endsAt;
    if (nextEndsAt <= nextStartsAt) errors.push('endsAt must be after startsAt');

    if (errors.length > 0) {
      return res.status(400).json({ error: 'Validation failed', details: errors });
    }

    const announcement = await withTenantScopeBypassed(() =>
      prisma.announcement.update({ where: { id }, data: updates }),
    );

    res.json(announcement);
  } catch (err) {
    logControllerError('announcement.updateAnnouncement', err, req);
    res.status(500).json({ error: err.message });
  }
};

const deleteAnnouncement = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid announcement id' });

    const existing = await withTenantScopeBypassed(() =>
      prisma.announcement.findFirst({ where: { id, deletedAt: null } }),
    );
    if (!existing) return res.status(404).json({ error: 'Announcement not found' });

    await withTenantScopeBypassed(() =>
      prisma.announcement.update({ where: { id }, data: { deletedAt: new Date() } }),
    );

    res.json({ ok: true });
  } catch (err) {
    logControllerError('announcement.deleteAnnouncement', err, req);
    res.status(500).json({ error: err.message });
  }
};

// ── Public handler ───────────────────────────────────────────────────────────

/** GET /api/v1/announcements/active */
const listActive = async (req, res) => {
  try {
    const now = new Date();
    const tenantId = req.tenant?.id;

    const announcements = await withTenantScopeBypassed(() =>
      prisma.announcement.findMany({
        where: {
          deletedAt: null,
          startsAt: { lte: now },
          endsAt: { gte: now },
          OR: [{ target: 'all' }, { target: 'tenant', tenantId }],
        },
        orderBy: { startsAt: 'desc' },
      }),
    );

    res.json({ data: announcements });
  } catch (err) {
    logControllerError('announcement.listActive', err, req);
    res.status(500).json({ error: err.message });
  }
};

export default { createAnnouncement, updateAnnouncement, deleteAnnouncement, listActive };
