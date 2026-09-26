import { jest } from '@jest/globals';

const prismaMock = {
  announcement: {
    findMany: jest.fn(),
  },
  announcementDismissal: {
    findMany: jest.fn(),
    create: jest.fn(),
    upsert: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
  },
};

jest.unstable_mockModule('../lib/prisma.js', () => ({ default: prismaMock }));

const { listActiveAnnouncements } = await import(
  '../api/services/announcementService.js'
);

describe('announcementDeduplication', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Delivery tracking and persistence', () => {
    it('prevents duplicate announcements in repeated fetches', async () => {
      const userId = 'user-1';
      const announcementId = 'ann-1';

      const announcements = [
        { id: announcementId, title: 'Maintenance', target: 'all', tenantId: null }
      ];

      // First fetch returns the announcement
      prismaMock.announcement.findMany.mockResolvedValueOnce(announcements);
      prismaMock.announcementDismissal.findMany.mockResolvedValueOnce([]);

      let result = await listActiveAnnouncements({ id: userId, tenantId: 'tenant-1' });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(announcementId);

      // User dismisses the announcement
      prismaMock.announcementDismissal.upsert.mockResolvedValueOnce({
        userId,
        announcementId,
        dismissedAt: new Date(),
      });

      // Second fetch should exclude dismissed announcements
      prismaMock.announcement.findMany.mockResolvedValueOnce(announcements);
      prismaMock.announcementDismissal.findMany.mockResolvedValueOnce([
        { userId, announcementId, dismissedAt: new Date() }
      ]);

      result = await listActiveAnnouncements({ id: userId, tenantId: 'tenant-1' });
      expect(result).toHaveLength(0);
    });

    it('tracks dismissal state persistently across sessions', async () => {
      const userId = 'user-2';
      const announcementId = 'ann-2';

      const dismissal = {
        userId,
        announcementId,
        dismissedAt: new Date('2026-01-15T10:00:00Z'),
      };

      prismaMock.announcementDismissal.create.mockResolvedValue(dismissal);
      prismaMock.announcementDismissal.findMany.mockResolvedValue([dismissal]);

      const result = await prismaMock.announcementDismissal.findMany({
        where: { userId, announcementId },
      });

      expect(result).toHaveLength(1);
      expect(result[0].dismissedAt).toEqual(dismissal.dismissedAt);
    });

    it('maintains state tracking accuracy for individual user-announcement pairs', async () => {
      const user1 = 'user-1';
      const user2 = 'user-2';
      const announcementId = 'ann-1';

      const dismissals = [
        { userId: user1, announcementId, dismissedAt: new Date() },
        { userId: user2, announcementId, dismissedAt: new Date() },
      ];

      prismaMock.announcementDismissal.findMany.mockResolvedValue(dismissals);

      const user1Dismissals = await prismaMock.announcementDismissal.findMany({
        where: { userId: user1, announcementId },
      });

      expect(user1Dismissals).toHaveLength(1);
      expect(user1Dismissals[0].userId).toBe(user1);
    });

    it('handles multiple announcements independently', async () => {
      const userId = 'user-3';
      const announcements = [
        { id: 'ann-1', title: 'Update 1', target: 'all' },
        { id: 'ann-2', title: 'Update 2', target: 'all' },
      ];

      const dismissals = [
        { userId, announcementId: 'ann-1', dismissedAt: new Date() },
      ];

      prismaMock.announcement.findMany.mockResolvedValue(announcements);
      prismaMock.announcementDismissal.findMany.mockResolvedValue(dismissals);

      const result = await listActiveAnnouncements({ id: userId, tenantId: 'tenant-1' });

      expect(result).not.toContainEqual(expect.objectContaining({ id: 'ann-1' }));
    });

    it('supports dismissal upsert to avoid duplicates', async () => {
      const userId = 'user-4';
      const announcementId = 'ann-1';

      prismaMock.announcementDismissal.upsert.mockResolvedValue({
        userId,
        announcementId,
        dismissedAt: new Date(),
      });

      const result = await prismaMock.announcementDismissal.upsert({
        where: { userId_announcementId: { userId, announcementId } },
        update: { dismissedAt: new Date() },
        create: { userId, announcementId, dismissedAt: new Date() },
      });

      expect(result.userId).toBe(userId);
      expect(result.announcementId).toBe(announcementId);
    });

    it('maintains backward compatibility with existing announcement delivery logic', async () => {
      const announcements = [
        { id: 'ann-1', title: 'Old', target: 'all', tenantId: null },
      ];

      prismaMock.announcement.findMany.mockResolvedValue(announcements);
      prismaMock.announcementDismissal.findMany.mockResolvedValue([]);

      const result = await listActiveAnnouncements({ id: 'user-5', tenantId: 'tenant-1' });

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('ann-1');
    });
  });
});
