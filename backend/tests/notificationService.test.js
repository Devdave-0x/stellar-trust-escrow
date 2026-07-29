/**
 * Unit tests for NotificationService
 *
 * Issue #1: Verify correct dispatch behaviour for every event type,
 * preference-gated delivery, graceful email-provider failures, and
 * correct template selection.
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const prismaMock = {
  user: { findUnique: jest.fn() },
  notification: { create: jest.fn() },
  notificationPreference: { findUnique: jest.fn() },
};

// Spy-able in-memory notification queue
const notificationQueueMock = {
  add: jest.fn(),
  jobs: [],
};

jest.unstable_mockModule('../lib/prisma.js', () => ({ default: prismaMock }));
jest.unstable_mockModule('../queues/notificationQueue.js', () => ({
  notificationQueue: notificationQueueMock,
}));

// ── Import SUT after mocks are registered ────────────────────────────────────

const { default: NotificationService, NotificationEvent } =
  await import('../services/notificationService.js');

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockUser(overrides = {}) {
  return {
    tenantId: 'tenant-1',
    email: 'user@example.com',
    ...overrides,
  };
}

/** Return a preferences row with both channels enabled for every event. */
function allEnabledPrefs() {
  const prefs = {};
  for (const event of Object.values(NotificationEvent)) {
    prefs[event] = { email: true, inApp: true };
  }
  return { preferences: prefs };
}

/** Return a preferences row with email disabled for the given event. */
function emailDisabledPrefs(event) {
  const prefs = {};
  for (const ev of Object.values(NotificationEvent)) {
    prefs[ev] = { email: ev === event ? false : true, inApp: true };
  }
  return { preferences: prefs };
}

/** Return a preferences row with inApp disabled for the given event. */
function inAppDisabledPrefs(event) {
  const prefs = {};
  for (const ev of Object.values(NotificationEvent)) {
    prefs[ev] = { email: true, inApp: ev === event ? false : true };
  }
  return { preferences: prefs };
}

/** Return a preferences row with BOTH channels disabled for the given event. */
function bothDisabledPrefs(event) {
  const prefs = {};
  for (const ev of Object.values(NotificationEvent)) {
    prefs[ev] = { email: ev === event ? false : true, inApp: ev === event ? false : true };
  }
  return { preferences: prefs };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('NotificationService.send', () => {
  const USER_ID = 42;
  const ESCROW_ID = 99;

  beforeEach(() => {
    jest.clearAllMocks();

    // Default: user exists, all preferences enabled
    prismaMock.user.findUnique.mockResolvedValue(mockUser());
    prismaMock.notificationPreference.findUnique.mockResolvedValue(allEnabledPrefs());
    prismaMock.notification.create.mockResolvedValue({ id: 'notif-1' });
    notificationQueueMock.add.mockResolvedValue({ id: 'job-1' });
  });

  // ── User not found ───────────────────────────────────────────────────────────

  it('throws when the user does not exist', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    await expect(
      NotificationService.send(USER_ID, NotificationEvent.ESCROW_FUNDED, { escrowId: ESCROW_ID }),
    ).rejects.toThrow(`User ${USER_ID} not found`);
  });

  // ── Template selection per event type ────────────────────────────────────────

  it.each(Object.values(NotificationEvent))(
    'enqueues a job with event "%s" and the correct payload shape',
    async (event) => {
      const data = { escrowId: ESCROW_ID, event };

      await NotificationService.send(USER_ID, event, data);

      expect(notificationQueueMock.add).toHaveBeenCalledTimes(1);
      const [jobName, jobData] = notificationQueueMock.add.mock.calls[0];

      // Job name should encode the event type
      expect(jobName).toBe(`notify.${event}`);

      // Job payload must carry userId, tenantId, event type, email and data
      expect(jobData).toMatchObject({
        userId: USER_ID,
        tenantId: 'tenant-1',
        event,
        email: 'user@example.com',
        data,
      });
    },
  );

  it.each(Object.values(NotificationEvent))(
    'stores an in-app notification for event "%s"',
    async (event) => {
      await NotificationService.send(USER_ID, event, { escrowId: ESCROW_ID });

      expect(prismaMock.notification.create).toHaveBeenCalledTimes(1);
      const { data: created } = prismaMock.notification.create.mock.calls[0][0];
      expect(created.event).toBe(event);
      expect(created.userId).toBe(USER_ID);
      expect(created.tenantId).toBe('tenant-1');
    },
  );

  // ── Preference: email disabled ───────────────────────────────────────────────

  it('does not enqueue an email job when email is disabled for the event', async () => {
    const event = NotificationEvent.DISPUTE_RAISED;
    prismaMock.notificationPreference.findUnique.mockResolvedValue(emailDisabledPrefs(event));

    await NotificationService.send(USER_ID, event, { escrowId: ESCROW_ID });

    expect(notificationQueueMock.add).not.toHaveBeenCalled();
    // In-app should still be created
    expect(prismaMock.notification.create).toHaveBeenCalledTimes(1);
  });

  // ── Preference: in-app disabled ──────────────────────────────────────────────

  it('does not create an in-app notification when inApp is disabled for the event', async () => {
    const event = NotificationEvent.MILESTONE_COMPLETED;
    prismaMock.notificationPreference.findUnique.mockResolvedValue(inAppDisabledPrefs(event));

    await NotificationService.send(USER_ID, event, { escrowId: ESCROW_ID });

    expect(prismaMock.notification.create).not.toHaveBeenCalled();
    // Email should still be enqueued
    expect(notificationQueueMock.add).toHaveBeenCalledTimes(1);
  });

  // ── Preference: both channels disabled ───────────────────────────────────────

  it('sends nothing when both email and in-app are disabled for the event', async () => {
    const event = NotificationEvent.ESCROW_EXPIRING;
    prismaMock.notificationPreference.findUnique.mockResolvedValue(bothDisabledPrefs(event));

    const result = await NotificationService.send(USER_ID, event, { escrowId: ESCROW_ID });

    expect(prismaMock.notification.create).not.toHaveBeenCalled();
    expect(notificationQueueMock.add).not.toHaveBeenCalled();
    expect(result.inApp).toBeNull();
    expect(result.email).toBeNull();
  });

  // ── Default preferences (no preference row) ──────────────────────────────────

  it('sends both channels when no preference row exists (default on)', async () => {
    prismaMock.notificationPreference.findUnique.mockResolvedValue(null);

    await NotificationService.send(USER_ID, NotificationEvent.ESCROW_FUNDED, {});

    expect(prismaMock.notification.create).toHaveBeenCalledTimes(1);
    expect(notificationQueueMock.add).toHaveBeenCalledTimes(1);
  });

  // ── User has no email address ─────────────────────────────────────────────────

  it('skips email enqueue when the user has no email address', async () => {
    prismaMock.user.findUnique.mockResolvedValue(mockUser({ email: null }));

    await NotificationService.send(USER_ID, NotificationEvent.RELEASE_REQUESTED, {});

    expect(notificationQueueMock.add).not.toHaveBeenCalled();
    // In-app should still be stored
    expect(prismaMock.notification.create).toHaveBeenCalledTimes(1);
  });

  // ── Graceful failure: email provider throws ───────────────────────────────────

  it(
    'still creates the in-app notification even when the email queue throws',
    async () => {
      notificationQueueMock.add.mockRejectedValue(new Error('SMTP connection refused'));

      // The service does NOT silently swallow this — it surfaces the queue error
      // but the in-app record is already written before the queue call.
      // We verify that in-app persistence happened before the error propagates.
      let inAppCreated = false;
      prismaMock.notification.create.mockImplementation(async () => {
        inAppCreated = true;
        return { id: 'notif-2' };
      });

      await expect(
        NotificationService.send(USER_ID, NotificationEvent.DISPUTE_RESOLVED, { escrowId: ESCROW_ID }),
      ).rejects.toThrow('SMTP connection refused');

      // In-app was persisted before the queue failure
      expect(inAppCreated).toBe(true);
    },
  );

  // ── storeInApp helper ─────────────────────────────────────────────────────────

  describe('storeInApp', () => {
    it('persists a notification row with the correct shape', async () => {
      const returnValue = { id: 'notif-abc', userId: USER_ID };
      prismaMock.notification.create.mockResolvedValue(returnValue);

      const result = await NotificationService.storeInApp(
        USER_ID,
        'tenant-1',
        NotificationEvent.ESCROW_STATUS_CHANGED,
        { escrowId: 1 },
      );

      expect(prismaMock.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: USER_ID,
          tenantId: 'tenant-1',
          event: NotificationEvent.ESCROW_STATUS_CHANGED,
          data: { escrowId: 1 },
        }),
      });
      expect(result).toBe(returnValue);
    });
  });

  // ── isEnabled helper ──────────────────────────────────────────────────────────

  describe('isEnabled', () => {
    it('returns true when no preference row exists', async () => {
      prismaMock.notificationPreference.findUnique.mockResolvedValue(null);
      const enabled = await NotificationService.isEnabled(USER_ID, NotificationEvent.ESCROW_FUNDED, 'email');
      expect(enabled).toBe(true);
    });

    it('returns true when preference row has no entry for this event', async () => {
      prismaMock.notificationPreference.findUnique.mockResolvedValue({ preferences: {} });
      const enabled = await NotificationService.isEnabled(USER_ID, NotificationEvent.DISPUTE_RAISED, 'inApp');
      expect(enabled).toBe(true);
    });

    it('returns false when channel is explicitly set to false', async () => {
      prismaMock.notificationPreference.findUnique.mockResolvedValue({
        preferences: {
          [NotificationEvent.MILESTONE_COMPLETED]: { email: false, inApp: true },
        },
      });
      const enabled = await NotificationService.isEnabled(
        USER_ID,
        NotificationEvent.MILESTONE_COMPLETED,
        'email',
      );
      expect(enabled).toBe(false);
    });

    it('returns true when channel is explicitly set to true', async () => {
      prismaMock.notificationPreference.findUnique.mockResolvedValue({
        preferences: {
          [NotificationEvent.MILESTONE_COMPLETED]: { email: true, inApp: true },
        },
      });
      const enabled = await NotificationService.isEnabled(
        USER_ID,
        NotificationEvent.MILESTONE_COMPLETED,
        'inApp',
      );
      expect(enabled).toBe(true);
    });
  });
});
