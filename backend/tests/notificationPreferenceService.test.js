import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const prismaMock = {
  notificationPreference: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
  },
};

jest.unstable_mockModule('../lib/prisma.js', () => ({ default: prismaMock }));

const notificationPreferenceService = await import('../services/notificationPreferenceService.js');

const ALL_EVENTS = ['ESCROW_CREATED', 'ESCROW_COMPLETED', 'PAYMENT_RECEIVED', 'DISPUTE_OPENED'];

describe('notificationPreferenceService.getPreferences', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns default preferences when user has no stored preferences', async () => {
    prismaMock.notificationPreference.findUnique.mockResolvedValue(null);

    const prefs = await notificationPreferenceService.default.getPreferences(42);

    expect(prefs).toMatchObject({
      ESCROW_CREATED: { email: true, inApp: true },
      ESCROW_COMPLETED: { email: true, inApp: true },
      PAYMENT_RECEIVED: { email: true, inApp: true },
      DISPUTE_OPENED: { email: true, inApp: true },
    });
  });

  it('merges stored preferences with defaults for missing events', async () => {
    prismaMock.notificationPreference.findUnique.mockResolvedValue({
      preferences: {
        ESCROW_CREATED: { email: false, inApp: true },
      },
    });

    const prefs = await notificationPreferenceService.default.getPreferences(42);

    expect(prefs.ESCROW_CREATED).toEqual({ email: false, inApp: true });
    expect(prefs.ESCROW_COMPLETED).toEqual({ email: true, inApp: true });
    expect(prefs.PAYMENT_RECEIVED).toEqual({ email: true, inApp: true });
  });

  it('provides deterministic defaults for new event types', async () => {
    prismaMock.notificationPreference.findUnique.mockResolvedValue({
      preferences: {
        ESCROW_CREATED: { email: true, inApp: false },
      },
    });

    const prefs1 = await notificationPreferenceService.default.getPreferences(42);
    const prefs2 = await notificationPreferenceService.default.getPreferences(42);

    expect(prefs1.ESCROW_COMPLETED).toEqual(prefs2.ESCROW_COMPLETED);
    expect(prefs1.PAYMENT_RECEIVED).toEqual(prefs2.PAYMENT_RECEIVED);
  });

  it('falls back to enable all channels by default', async () => {
    prismaMock.notificationPreference.findUnique.mockResolvedValue({
      preferences: {},
    });

    const prefs = await notificationPreferenceService.default.getPreferences(42);

    Object.values(prefs).forEach((channels) => {
      expect(channels.email).toBe(true);
      expect(channels.inApp).toBe(true);
    });
  });
});

describe('notificationPreferenceService.updatePreferences', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('updates existing preferences while preserving unmodified events', async () => {
    const existing = {
      ESCROW_CREATED: { email: true, inApp: true },
      ESCROW_COMPLETED: { email: false, inApp: true },
    };

    prismaMock.notificationPreference.findUnique.mockResolvedValue({
      preferences: existing,
    });

    prismaMock.notificationPreference.upsert.mockResolvedValue({
      preferences: {
        ESCROW_CREATED: { email: false, inApp: true },
        ESCROW_COMPLETED: { email: false, inApp: true },
      },
    });

    const result = await notificationPreferenceService.default.updatePreferences(42, 'tenant-1', {
      ESCROW_CREATED: { email: false },
    });

    expect(prismaMock.notificationPreference.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 42 },
      }),
    );
  });

  it('ignores invalid event names silently', async () => {
    prismaMock.notificationPreference.findUnique.mockResolvedValue({
      preferences: {
        ESCROW_CREATED: { email: true, inApp: true },
      },
    });

    prismaMock.notificationPreference.upsert.mockResolvedValue({
      preferences: {
        ESCROW_CREATED: { email: true, inApp: true },
      },
    });

    const result = await notificationPreferenceService.default.updatePreferences(42, 'tenant-1', {
      INVALID_EVENT: { email: false },
    });

    const callArgs = prismaMock.notificationPreference.upsert.mock.calls[0][0];
    expect(callArgs.update.preferences).not.toHaveProperty('INVALID_EVENT');
  });

  it('creates new preference record when user has none', async () => {
    prismaMock.notificationPreference.findUnique.mockResolvedValue(null);

    prismaMock.notificationPreference.upsert.mockResolvedValue({
      userId: 42,
      tenantId: 'tenant-1',
      preferences: {
        ESCROW_CREATED: { email: true, inApp: true },
      },
    });

    await notificationPreferenceService.default.updatePreferences(42, 'tenant-1', {
      ESCROW_CREATED: { email: false },
    });

    expect(prismaMock.notificationPreference.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          userId: 42,
          tenantId: 'tenant-1',
        }),
      }),
    );
  });
});

describe('notificationPreferenceService.optOut', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('disables a specific channel for an event', async () => {
    prismaMock.notificationPreference.findUnique.mockResolvedValue({
      preferences: {
        ESCROW_CREATED: { email: true, inApp: true },
      },
    });

    prismaMock.notificationPreference.upsert.mockResolvedValue({
      preferences: {
        ESCROW_CREATED: { email: false, inApp: true },
      },
    });

    const result = await notificationPreferenceService.default.optOut(42, 'tenant-1', 'ESCROW_CREATED', 'email');

    expect(result.ESCROW_CREATED).toEqual({ email: false, inApp: true });
  });

  it('disables all channels when channel is not specified', async () => {
    prismaMock.notificationPreference.findUnique.mockResolvedValue({
      preferences: {
        ESCROW_CREATED: { email: true, inApp: true },
      },
    });

    prismaMock.notificationPreference.upsert.mockResolvedValue({
      preferences: {
        ESCROW_CREATED: { email: false, inApp: false },
      },
    });

    const result = await notificationPreferenceService.default.optOut(42, 'tenant-1', 'ESCROW_CREATED');

    expect(result.ESCROW_CREATED).toEqual({ email: false, inApp: false });
  });
});

describe('notificationPreferenceService.optIn', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('enables a specific channel for an event', async () => {
    prismaMock.notificationPreference.findUnique.mockResolvedValue({
      preferences: {
        ESCROW_CREATED: { email: false, inApp: true },
      },
    });

    prismaMock.notificationPreference.upsert.mockResolvedValue({
      preferences: {
        ESCROW_CREATED: { email: true, inApp: true },
      },
    });

    const result = await notificationPreferenceService.default.optIn(42, 'tenant-1', 'ESCROW_CREATED', 'email');

    expect(result.ESCROW_CREATED).toEqual({ email: true, inApp: true });
  });

  it('enables all channels when channel is not specified', async () => {
    prismaMock.notificationPreference.findUnique.mockResolvedValue({
      preferences: {
        ESCROW_CREATED: { email: false, inApp: false },
      },
    });

    prismaMock.notificationPreference.upsert.mockResolvedValue({
      preferences: {
        ESCROW_CREATED: { email: true, inApp: true },
      },
    });

    const result = await notificationPreferenceService.default.optIn(42, 'tenant-1', 'ESCROW_CREATED');

    expect(result.ESCROW_CREATED).toEqual({ email: true, inApp: true });
  });
});

describe('notificationPreferenceService fallback behavior', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('consistently returns the same defaults across multiple calls', async () => {
    prismaMock.notificationPreference.findUnique.mockResolvedValue(null);

    const prefs1 = await notificationPreferenceService.default.getPreferences(42);
    const prefs2 = await notificationPreferenceService.default.getPreferences(42);
    const prefs3 = await notificationPreferenceService.default.getPreferences(42);

    expect(prefs1).toEqual(prefs2);
    expect(prefs2).toEqual(prefs3);
  });

  it('provides defaults when user preference row is empty', async () => {
    prismaMock.notificationPreference.findUnique.mockResolvedValue({
      userId: 42,
      preferences: {},
    });

    const prefs = await notificationPreferenceService.default.getPreferences(42);

    expect(Object.keys(prefs).length).toBeGreaterThan(0);
    Object.values(prefs).forEach((channels) => {
      expect(channels).toHaveProperty('email');
      expect(channels).toHaveProperty('inApp');
    });
  });

  it('does not lose preferences for events not in the update payload', async () => {
    prismaMock.notificationPreference.findUnique.mockResolvedValue({
      preferences: {
        ESCROW_CREATED: { email: true, inApp: false },
        ESCROW_COMPLETED: { email: false, inApp: true },
        PAYMENT_RECEIVED: { email: true, inApp: true },
      },
    });

    prismaMock.notificationPreference.upsert.mockResolvedValue({
      preferences: {
        ESCROW_CREATED: { email: false, inApp: false },
        ESCROW_COMPLETED: { email: false, inApp: true },
        PAYMENT_RECEIVED: { email: true, inApp: true },
      },
    });

    await notificationPreferenceService.default.updatePreferences(42, 'tenant-1', {
      ESCROW_CREATED: { email: false, inApp: false },
    });

    const callArgs = prismaMock.notificationPreference.upsert.mock.calls[0][0];
    expect(callArgs.update.preferences.ESCROW_COMPLETED).toEqual({ email: false, inApp: true });
    expect(callArgs.update.preferences.PAYMENT_RECEIVED).toEqual({ email: true, inApp: true });
  });
});
