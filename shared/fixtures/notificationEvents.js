const now = '2026-09-23T18:30:00.000Z';

export const notificationEventFixtures = {
  escrow: {
    id: 'notif-escrow-funded',
    type: 'escrow_funded',
    escrowId: 'escrow-1001',
    message: 'Escrow funded',
    read: false,
    createdAt: now,
    data: {
      escrowId: 'escrow-1001',
      amount: '2500.00',
      asset: 'USDC',
    },
  },
  dispute: {
    id: 'notif-dispute-raised',
    type: 'dispute_raised',
    escrowId: 'escrow-1002',
    message: 'Dispute raised',
    read: true,
    createdAt: '2026-09-23T18:31:00.000Z',
    data: {
      escrowId: 'escrow-1002',
      disputeId: 'dispute-44',
      reason: 'Milestone evidence rejected',
    },
  },
  ownershipTransfer: {
    id: 'notif-ownership-transfer',
    type: 'ownership_transfer_requested',
    escrowId: 'escrow-1003',
    message: 'Ownership transfer requested',
    read: false,
    createdAt: '2026-09-23T18:32:00.000Z',
    data: {
      escrowId: 'escrow-1003',
      role: 'client',
      fromAddress: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
      toAddress: 'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBXJ',
      status: 'pending',
    },
  },
  announcement: {
    id: 'notif-announcement',
    type: 'announcement_published',
    escrowId: 'platform',
    message: 'Protocol maintenance window scheduled',
    read: false,
    createdAt: '2026-09-23T18:33:00.000Z',
    data: {
      announcementId: 'ann-2026-09-maintenance',
      severity: 'info',
      audience: 'all',
    },
  },
  certificate: {
    id: 'notif-certificate-issued',
    type: 'certificate_issued',
    escrowId: 'escrow-1004',
    message: 'Completion certificate ready',
    read: true,
    createdAt: '2026-09-23T18:34:00.000Z',
    data: {
      escrowId: 'escrow-1004',
      certificateId: 'cert-7788',
      shareUrl: '/certificates/cert-7788',
    },
  },
};

export const notificationEventFixtureList = Object.values(notificationEventFixtures);

export function cloneNotificationFixtures() {
  return notificationEventFixtureList.map((fixture) => ({
    ...fixture,
    data: { ...fixture.data },
  }));
}
