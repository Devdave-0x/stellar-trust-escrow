import prisma from '../../lib/prisma.js';

export async function listActiveAnnouncements(user) {
  const now = new Date();
  const tenantId = user?.tenantId;
  const userId = user?.id;

  const announcements = await prisma.announcement.findMany({
    where: {
      deletedAt: null,
      startsAt: { lte: now },
      endsAt: { gte: now },
      OR: [{ target: 'all' }, { target: 'tenant', tenantId }],
    },
    orderBy: { startsAt: 'desc' },
  });

  if (!userId || announcements.length === 0) return announcements;

  const dismissals = await prisma.announcementDismissal.findMany({
    where: {
      userId,
      announcementId: { in: announcements.map((announcement) => announcement.id) },
    },
  });
  const dismissed = new Set(dismissals.map((dismissal) => dismissal.announcementId));

  return announcements.filter((announcement) => !dismissed.has(announcement.id));
}

export async function dismissAnnouncementForUser({ announcementId, userId }) {
  return prisma.announcementDismissal.upsert({
    where: { userId_announcementId: { userId, announcementId } },
    update: { dismissedAt: new Date() },
    create: { userId, announcementId, dismissedAt: new Date() },
  });
}
