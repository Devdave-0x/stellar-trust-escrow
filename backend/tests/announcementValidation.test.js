/**
 * Tests for announcement validation (Issue #543)
 * Tests validation rules for announcements: date ordering, overlap detection, stale dates
 */

import { jest } from '@jest/globals';

const prismaMock = {
  announcement: {
    create: jest.fn(),
    findMany: jest.fn(),
  },
  tenant: {
    findUnique: jest.fn(),
  },
};

jest.unstable_mockModule('../lib/prisma.js', () => ({ default: prismaMock }));

const { default: announcementValidator } = await import(
  '../services/announcementValidator.js'
);

describe('announcementValidation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('validateAnnouncementDates', () => {
    it('rejects announcement when startDate >= endDate', async () => {
      const startDate = new Date('2024-03-01T10:00:00Z');
      const endDate = new Date('2024-02-28T10:00:00Z');

      const result = await announcementValidator.validateDates(startDate, endDate);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Start date must be before end date');
    });

    it('rejects announcement when startDate equals endDate', async () => {
      const sameDate = new Date('2024-03-01T10:00:00Z');

      const result = await announcementValidator.validateDates(sameDate, sameDate);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Start date must be before end date');
    });

    it('accepts valid date range', async () => {
      const startDate = new Date('2024-03-01T10:00:00Z');
      const endDate = new Date('2024-03-02T10:00:00Z');

      const result = await announcementValidator.validateDates(startDate, endDate);

      expect(result.valid).toBe(true);
    });
  });

  describe('validateNoStaleDates', () => {
    it('rejects announcement when endDate has already passed', async () => {
      const now = new Date();
      const pastDate = new Date(now.getTime() - 1000 * 60 * 60); // 1 hour ago
      const startDate = new Date(now.getTime() - 1000 * 60 * 120); // 2 hours ago

      const result = await announcementValidator.validateNotStale(startDate, pastDate);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('End date must be in the future');
    });

    it('accepts announcement with future endDate', async () => {
      const now = new Date();
      const futureDate = new Date(now.getTime() + 1000 * 60 * 60); // 1 hour from now
      const startDate = new Date(now.getTime() - 1000 * 60 * 60); // 1 hour ago

      const result = await announcementValidator.validateNotStale(startDate, futureDate);

      expect(result.valid).toBe(true);
    });
  });

  describe('validateNoOverlap', () => {
    it('rejects announcement when it overlaps with active global banner', async () => {
      const newStartDate = new Date('2024-03-05T10:00:00Z');
      const newEndDate = new Date('2024-03-10T10:00:00Z');

      prismaMock.announcement.findMany.mockResolvedValue([
        {
          id: 1,
          target: 'all',
          startsAt: new Date('2024-03-01T10:00:00Z'),
          endsAt: new Date('2024-03-08T10:00:00Z'),
          active: true,
        },
      ]);

      const result = await announcementValidator.validateNoOverlap(
        newStartDate,
        newEndDate,
        'all',
        null,
      );

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Announcement overlaps with existing active banner');
    });

    it('allows announcement that does not overlap with existing ones', async () => {
      const newStartDate = new Date('2024-03-15T10:00:00Z');
      const newEndDate = new Date('2024-03-20T10:00:00Z');

      prismaMock.announcement.findMany.mockResolvedValue([
        {
          id: 1,
          target: 'all',
          startsAt: new Date('2024-03-01T10:00:00Z'),
          endsAt: new Date('2024-03-08T10:00:00Z'),
          active: true,
        },
      ]);

      const result = await announcementValidator.validateNoOverlap(
        newStartDate,
        newEndDate,
        'all',
        null,
      );

      expect(result.valid).toBe(true);
    });

    it('ignores expired banners when checking for overlap', async () => {
      const newStartDate = new Date('2024-03-05T10:00:00Z');
      const newEndDate = new Date('2024-03-10T10:00:00Z');

      prismaMock.announcement.findMany.mockResolvedValue([
        {
          id: 1,
          target: 'all',
          startsAt: new Date('2024-02-01T10:00:00Z'),
          endsAt: new Date('2024-02-28T10:00:00Z'),
          active: false,
        },
      ]);

      const result = await announcementValidator.validateNoOverlap(
        newStartDate,
        newEndDate,
        'all',
        null,
      );

      expect(result.valid).toBe(true);
    });

    it('detects overlap with announcement ending on same time as new one starting', async () => {
      const newStartDate = new Date('2024-03-10T10:00:00Z');
      const newEndDate = new Date('2024-03-15T10:00:00Z');

      prismaMock.announcement.findMany.mockResolvedValue([
        {
          id: 1,
          target: 'all',
          startsAt: new Date('2024-03-01T10:00:00Z'),
          endsAt: new Date('2024-03-10T10:00:00Z'),
          active: true,
        },
      ]);

      const result = await announcementValidator.validateNoOverlap(
        newStartDate,
        newEndDate,
        'all',
        null,
      );

      // This should be treated as an overlap (or touching is not allowed)
      expect(result.valid).toBe(false);
    });
  });

  describe('comprehensive announcement creation', () => {
    it('rejects announcement with multiple validation errors', async () => {
      const now = new Date();
      const invalidStartDate = new Date(now.getTime() + 1000 * 60 * 60);
      const invalidEndDate = new Date(now.getTime() - 1000 * 60 * 60);

      const result = await announcementValidator.validateAnnouncement({
        startsAt: invalidStartDate,
        endsAt: invalidEndDate,
        target: 'all',
      });

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('returns field-level errors as specified', async () => {
      const now = new Date();
      const invalidStartDate = new Date(now.getTime() + 1000 * 60 * 60);
      const invalidEndDate = new Date(now.getTime() - 1000 * 60 * 60);

      const result = await announcementValidator.validateAnnouncement({
        startsAt: invalidStartDate,
        endsAt: invalidEndDate,
        target: 'all',
      });

      expect(result.fieldErrors).toBeDefined();
      expect(result.fieldErrors.endsAt || result.fieldErrors.startsAt).toBeDefined();
    });

    it('creates announcement when all validations pass', async () => {
      const now = new Date();
      const startDate = new Date(now.getTime() + 1000 * 60 * 60);
      const endDate = new Date(now.getTime() + 2 * 1000 * 60 * 60);

      prismaMock.announcement.findMany.mockResolvedValue([]);
      prismaMock.announcement.create.mockResolvedValue({
        id: 1,
        startsAt: startDate,
        endsAt: endDate,
        target: 'all',
      });

      const result = await announcementValidator.validateAnnouncement({
        startsAt: startDate,
        endsAt: endDate,
        target: 'all',
        title: 'Test',
        body: 'Test announcement',
      });

      expect(result.valid).toBe(true);
    });
  });

  describe('tenant-specific announcements', () => {
    it('checks overlap within same tenant scope only', async () => {
      const newStartDate = new Date('2024-03-05T10:00:00Z');
      const newEndDate = new Date('2024-03-10T10:00:00Z');

      prismaMock.announcement.findMany.mockResolvedValue([
        {
          id: 1,
          target: 'tenant',
          tenantId: 'other-tenant',
          startsAt: new Date('2024-03-01T10:00:00Z'),
          endsAt: new Date('2024-03-08T10:00:00Z'),
          active: true,
        },
      ]);

      const result = await announcementValidator.validateNoOverlap(
        newStartDate,
        newEndDate,
        'tenant',
        'my-tenant',
      );

      expect(result.valid).toBe(true);
    });
  });
});
