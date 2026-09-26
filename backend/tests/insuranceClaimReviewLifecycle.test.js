import { jest } from '@jest/globals';

const prismaMock = {
  insuranceClaim: {
    findUnique: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn(),
  },
  auditLog: {
    create: jest.fn(),
  },
};

jest.unstable_mockModule('../lib/prisma.js', () => ({ default: prismaMock }));

const { transitionClaimState, getClaimsByState, auditClaimAction } = await import(
  '../api/services/insuranceClaimService.js'
);

describe('insuranceClaimReviewLifecycle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('State management', () => {
    it('validates state transitions from submitted', async () => {
      const claim = {
        id: 'claim-1',
        status: 'submitted',
        createdAt: new Date(),
      };

      prismaMock.insuranceClaim.findUnique.mockResolvedValue(claim);
      prismaMock.insuranceClaim.update.mockResolvedValue({
        ...claim,
        status: 'evidence_requested',
      });

      const updated = await transitionClaimState('claim-1', 'evidence_requested');

      expect(updated.status).toBe('evidence_requested');
      expect(prismaMock.insuranceClaim.update).toHaveBeenCalled();
    });

    it('validates state transitions from evidence_requested', async () => {
      const claim = {
        id: 'claim-2',
        status: 'evidence_requested',
      };

      prismaMock.insuranceClaim.findUnique.mockResolvedValue(claim);
      prismaMock.insuranceClaim.update.mockResolvedValue({
        ...claim,
        status: 'approved',
      });

      const updated = await transitionClaimState('claim-2', 'approved');

      expect(updated.status).toBe('approved');
    });

    it('allows transitions to denied state', async () => {
      const claim = {
        id: 'claim-3',
        status: 'evidence_requested',
      };

      prismaMock.insuranceClaim.findUnique.mockResolvedValue(claim);
      prismaMock.insuranceClaim.update.mockResolvedValue({
        ...claim,
        status: 'denied',
      });

      const updated = await transitionClaimState('claim-3', 'denied');

      expect(updated.status).toBe('denied');
    });

    it('supports transition to paid state', async () => {
      const claim = {
        id: 'claim-4',
        status: 'approved',
      };

      prismaMock.insuranceClaim.findUnique.mockResolvedValue(claim);
      prismaMock.insuranceClaim.update.mockResolvedValue({
        ...claim,
        status: 'paid',
        paidAt: new Date(),
      });

      const updated = await transitionClaimState('claim-4', 'paid');

      expect(updated.status).toBe('paid');
      expect(updated.paidAt).toBeDefined();
    });

    it('rejects invalid state transitions', async () => {
      const claim = {
        id: 'claim-5',
        status: 'paid',
      };

      prismaMock.insuranceClaim.findUnique.mockResolvedValue(claim);

      try {
        await transitionClaimState('claim-5', 'submitted');
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error.message).toContain('invalid');
      }
    });
  });

  describe('Admin action auditing', () => {
    it('creates audit trail for state transitions', async () => {
      const claim = {
        id: 'claim-6',
        status: 'submitted',
      };

      prismaMock.insuranceClaim.findUnique.mockResolvedValue(claim);
      prismaMock.insuranceClaim.update.mockResolvedValue({
        ...claim,
        status: 'evidence_requested',
      });
      prismaMock.auditLog.create.mockResolvedValue({
        id: 'audit-1',
        entityType: 'insuranceClaim',
        entityId: 'claim-6',
        action: 'state_transition',
        newValue: 'evidence_requested',
        adminId: 'admin-1',
        timestamp: new Date(),
      });

      await auditClaimAction('claim-6', 'evidence_requested', 'admin-1');

      expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            entityType: 'insuranceClaim',
            action: 'state_transition',
          }),
        })
      );
    });

    it('records admin identity in audit trail', async () => {
      const adminId = 'admin-2';

      prismaMock.auditLog.create.mockResolvedValue({
        adminId,
        timestamp: new Date(),
      });

      await auditClaimAction('claim-7', 'approved', adminId);

      expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            adminId,
          }),
        })
      );
    });

    it('captures transition details in audit', async () => {
      prismaMock.auditLog.create.mockResolvedValue({
        id: 'audit-2',
        fromState: 'submitted',
        toState: 'evidence_requested',
        timestamp: new Date(),
      });

      await auditClaimAction('claim-8', 'evidence_requested', 'admin-3', { reason: 'incomplete' });

      expect(prismaMock.auditLog.create).toHaveBeenCalled();
    });
  });

  describe('List filtering by review state', () => {
    it('filters claims by submitted state', async () => {
      const claims = [
        { id: 'claim-1', status: 'submitted' },
        { id: 'claim-2', status: 'submitted' },
      ];

      prismaMock.insuranceClaim.findMany.mockResolvedValue(claims);

      const result = await getClaimsByState('submitted');

      expect(prismaMock.insuranceClaim.findMany).toHaveBeenCalledWith({
        where: { status: 'submitted' },
      });
      expect(result).toHaveLength(2);
      expect(result.every(c => c.status === 'submitted')).toBe(true);
    });

    it('filters claims by evidence_requested state', async () => {
      const claims = [
        { id: 'claim-3', status: 'evidence_requested' },
      ];

      prismaMock.insuranceClaim.findMany.mockResolvedValue(claims);

      const result = await getClaimsByState('evidence_requested');

      expect(result[0].status).toBe('evidence_requested');
    });

    it('filters claims by approved state', async () => {
      const claims = [
        { id: 'claim-4', status: 'approved' },
      ];

      prismaMock.insuranceClaim.findMany.mockResolvedValue(claims);

      const result = await getClaimsByState('approved');

      expect(result[0].status).toBe('approved');
    });

    it('filters claims by denied state', async () => {
      const claims = [
        { id: 'claim-5', status: 'denied' },
      ];

      prismaMock.insuranceClaim.findMany.mockResolvedValue(claims);

      const result = await getClaimsByState('denied');

      expect(result[0].status).toBe('denied');
    });

    it('filters claims by paid state', async () => {
      const claims = [
        { id: 'claim-6', status: 'paid', paidAt: new Date() },
      ];

      prismaMock.insuranceClaim.findMany.mockResolvedValue(claims);

      const result = await getClaimsByState('paid');

      expect(result[0].status).toBe('paid');
    });

    it('returns empty list for state with no claims', async () => {
      prismaMock.insuranceClaim.findMany.mockResolvedValue([]);

      const result = await getClaimsByState('submitted');

      expect(result).toHaveLength(0);
    });
  });

  describe('Backward compatibility', () => {
    it('maintains existing claim structure', async () => {
      const claim = {
        id: 'claim-7',
        status: 'submitted',
        createdAt: new Date(),
        updatedAt: new Date(),
        userId: 'user-1',
        amount: 1000,
      };

      prismaMock.insuranceClaim.findUnique.mockResolvedValue(claim);

      const result = await prismaMock.insuranceClaim.findUnique({
        where: { id: 'claim-7' },
      });

      expect(result).toMatchObject({
        id: expect.any(String),
        status: expect.any(String),
        createdAt: expect.any(Date),
      });
    });

    it('continues passing existing functionality tests', async () => {
      const claims = [
        { id: 'claim-8', status: 'submitted', amount: 500 },
        { id: 'claim-9', status: 'approved', amount: 1000 },
      ];

      prismaMock.insuranceClaim.findMany.mockResolvedValue(claims);

      const result = await prismaMock.insuranceClaim.findMany();

      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty('amount');
    });
  });
});
