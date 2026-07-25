import express from 'express';
import emailService from '../../services/emailService.js';
import notificationPreferenceService from '../../services/notificationPreferenceService.js';
import prisma from '../../lib/prisma.js';
import authMiddleware from '../middleware/auth.js';
import adminAuth from '../middleware/adminAuth.js';

const router = express.Router();

// ── Helper ────────────────────────────────────────────────────────────────────

function getBaseUrl() {
  return process.env.EMAIL_BASE_URL || 'http://localhost:4000';
}

function getDashboardUrl(eventType, data) {
  if (data.dashboardUrl) return data.dashboardUrl;
  if (eventType === 'dispute.raised') return `${getBaseUrl()}/disputes/${data.escrowId}`;
  return `${getBaseUrl()}/escrows/${data.escrowId}`;
}

async function enqueueNotification(eventType, data) {
  const payload = { ...data, dashboardUrl: getDashboardUrl(eventType, data) };
  switch (eventType) {
    case 'escrow.status_changed': return emailService.notifyEscrowStatusChange(payload);
    case 'milestone.completed':   return emailService.notifyMilestoneCompleted(payload);
    case 'dispute.raised':        return emailService.notifyDisputeRaised(payload);
    default: throw new Error('Unsupported notification event type');
  }
}

// ── In-app notification center ────────────────────────────────────────────────

/**
 * GET /api/notifications
 * Returns in-app notifications for the authenticated user.
 * Query params: unreadOnly (bool), limit (int, default 20), cursor (string)
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { email: req.user.address }, select: { id: true, tenantId: true } })
      || await prisma.user.findFirst({ where: { walletAddress: req.user.address }, select: { id: true, tenantId: true } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const limit = Math.min(parseInt(req.query.limit || '20', 10), 100);
    const unreadOnly = req.query.unreadOnly === 'true';
    const cursor = req.query.cursor;

    const where = {
      userId: user.id,
      ...(unreadOnly ? { read: false } : {}),
      ...(cursor ? { id: { lt: cursor } } : {}),
    };

    const notifications = await prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    const unreadCount = await prisma.notification.count({ where: { userId: user.id, read: false } });
    const nextCursor = notifications.length === limit ? notifications[notifications.length - 1].id : null;

    return res.json({ notifications, unreadCount, nextCursor });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /api/notifications/:id/read
 * Mark a single notification as read.
 */
router.patch('/:id/read', authMiddleware, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { email: req.user.address }, select: { id: true } })
      || await prisma.user.findFirst({ where: { walletAddress: req.user.address }, select: { id: true } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const notification = await prisma.notification.findUnique({ where: { id: req.params.id } });
    if (!notification || notification.userId !== user.id) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    const updated = await prisma.notification.update({ where: { id: req.params.id }, data: { read: true } });
    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/notifications/read-all
 * Mark all unread notifications as read for the authenticated user.
 */
router.post('/read-all', authMiddleware, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { email: req.user.address }, select: { id: true } })
      || await prisma.user.findFirst({ where: { walletAddress: req.user.address }, select: { id: true } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const result = await prisma.notification.updateMany({
      where: { userId: user.id, read: false },
      data: { read: true },
    });
    return res.json({ updated: result.count });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── Notification preferences ──────────────────────────────────────────────────

/**
 * GET /api/notifications/preferences
 * Returns the user's notification preferences.
 */
router.get('/preferences', authMiddleware, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { email: req.user.address }, select: { id: true } })
      || await prisma.user.findFirst({ where: { walletAddress: req.user.address }, select: { id: true } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const preferences = await notificationPreferenceService.getPreferences(user.id);
    return res.json({ preferences });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /api/notifications/preferences
 * Update notification preferences.
 * Body: { event: { email?: bool, inApp?: bool }, ... }
 */
router.patch('/preferences', authMiddleware, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { email: req.user.address }, select: { id: true, tenantId: true } })
      || await prisma.user.findFirst({ where: { walletAddress: req.user.address }, select: { id: true, tenantId: true } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const updates = req.body;
    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({ error: 'Request body must be an object of event preferences' });
    }

    const preferences = await notificationPreferenceService.updatePreferences(user.id, user.tenantId, updates);
    return res.json({ preferences });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── Email subscription management (existing) ──────────────────────────────────

router.get('/unsubscribe', async (req, res) => {
  try {
    const { email, token, reason } = req.query;
    if (!email || !token) return res.status(400).send('<h1>Missing email or token</h1>');
    await emailService.unsubscribe(email, token, reason);
    return res.status(200).send('<h1>You have been unsubscribed from escrow notification emails.</h1>');
  } catch (error) {
    return res.status(400).send(`<h1>${error.message}</h1>`);
  }
});

router.post('/unsubscribe', async (req, res) => {
  try {
    const { email, token, reason } = req.body || {};
    if (!email || !token) return res.status(400).json({ error: 'email and token are required' });
    const preference = await emailService.unsubscribe(email, token, reason);
    return res.json({ email: preference.email, unsubscribedAt: preference.unsubscribedAt });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

router.post('/subscribe', async (req, res) => {
  try {
    const { email, token } = req.body || {};
    if (!email || !token) return res.status(400).json({ error: 'email and token are required' });
    const existingPreference = await emailService.getPreference(email);
    if (existingPreference.unsubscribeToken !== token) {
      return res.status(403).json({ error: 'Invalid resubscribe token' });
    }
    const updatedPreference = await emailService.resubscribe(email);
    return res.json({ email: updatedPreference.email, unsubscribedAt: updatedPreference.unsubscribedAt });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

// ── Admin: trigger notification email ─────────────────────────────────────────

router.post('/events', adminAuth, async (req, res) => {
  try {
    const { eventType, data } = req.body || {};
    if (!eventType || !data || !Array.isArray(data.recipients) || data.recipients.length === 0) {
      return res.status(400).json({ error: 'eventType and data.recipients are required' });
    }
    const result = await enqueueNotification(eventType, data);
    return res.status(202).json(result);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

router.get('/queue', adminAuth, async (_req, res) => {
  const snapshot = await emailService.getQueueSnapshot();
  res.json(snapshot);
});

export default router;
