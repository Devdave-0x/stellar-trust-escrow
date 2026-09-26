/**
 * Onboarding progress aggregation endpoint tests — Issue #548
 *
 * Covers a backend endpoint to consolidate OnboardingChecklist progress
 * information for use in dashboard and profile displays.
 *
 * Acceptance Criteria:
 *  • Endpoint delivers count of completed checklist items
 *  • Endpoint identifies next required step
 *  • Endpoint provides list of skipped steps
 *  • Tenant-specific user identification capabilities
 *  • All existing unit tests continue passing
 *  • New tests added for modified functionality
 */

import { jest } from '@jest/globals';

const ONBOARDING_STEPS = {
  EMAIL_VERIFICATION: 'email_verification',
  PHONE_VERIFICATION: 'phone_verification',
  IDENTITY_VERIFICATION: 'identity_verification',
  WALLET_CONNECTION: 'wallet_connection',
  KYC_DOCUMENT_UPLOAD: 'kyc_document_upload',
  PAYMENT_METHOD: 'payment_method',
  INITIAL_ESCROW_SETUP: 'initial_escrow_setup',
};

const STEP_ORDER = [
  ONBOARDING_STEPS.EMAIL_VERIFICATION,
  ONBOARDING_STEPS.PHONE_VERIFICATION,
  ONBOARDING_STEPS.IDENTITY_VERIFICATION,
  ONBOARDING_STEPS.WALLET_CONNECTION,
  ONBOARDING_STEPS.KYC_DOCUMENT_UPLOAD,
  ONBOARDING_STEPS.PAYMENT_METHOD,
  ONBOARDING_STEPS.INITIAL_ESCROW_SETUP,
];

const TEST_USER = {
  id: 'user_123',
  tenantId: 'tenant_abc',
  email: 'user@example.com',
};

describe('Onboarding Progress Aggregation — Issue #548', () => {
  let onboardingService;
  let prismaMock;

  beforeAll(async () => {
    prismaMock = {
      onboardingChecklist: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
      $transaction: jest.fn(async (cb) => cb?.(prismaMock)),
    };

    jest.unstable_mockModule('../lib/prisma.js', () => ({ default: prismaMock }));
    onboardingService = (await import('../services/onboardingService.js')).default;
  });

  describe('getProgressAggregate', () => {
    it('returns complete progress data for partially completed onboarding', async () => {
      const userId = TEST_USER.id;
      const checklist = {
        userId,
        tenantId: TEST_USER.tenantId,
        [ONBOARDING_STEPS.EMAIL_VERIFICATION]: { completed: true, completedAt: new Date() },
        [ONBOARDING_STEPS.PHONE_VERIFICATION]: { completed: true, completedAt: new Date() },
        [ONBOARDING_STEPS.IDENTITY_VERIFICATION]: { completed: false, completedAt: null },
        [ONBOARDING_STEPS.WALLET_CONNECTION]: { completed: false, completedAt: null },
        [ONBOARDING_STEPS.KYC_DOCUMENT_UPLOAD]: { completed: false, completedAt: null },
        [ONBOARDING_STEPS.PAYMENT_METHOD]: { completed: false, completedAt: null },
        [ONBOARDING_STEPS.INITIAL_ESCROW_SETUP]: { completed: false, completedAt: null },
      };

      prismaMock.onboardingChecklist.findUnique.mockResolvedValue(checklist);

      const result = await onboardingService.getProgressAggregate(userId, TEST_USER.tenantId);

      expect(result).toHaveProperty('completedCount', 2);
      expect(result).toHaveProperty('totalSteps', STEP_ORDER.length);
      expect(result).toHaveProperty('completionPercentage', expect.any(Number));
      expect(result).toHaveProperty('nextStep');
      expect(result).toHaveProperty('skippedSteps', expect.any(Array));
    });

    it('counts completed steps correctly', async () => {
      const userId = TEST_USER.id;
      const completedSteps = 4;
      const checklist = {
        userId,
        tenantId: TEST_USER.tenantId,
        [ONBOARDING_STEPS.EMAIL_VERIFICATION]: { completed: true, completedAt: new Date() },
        [ONBOARDING_STEPS.PHONE_VERIFICATION]: { completed: true, completedAt: new Date() },
        [ONBOARDING_STEPS.IDENTITY_VERIFICATION]: { completed: true, completedAt: new Date() },
        [ONBOARDING_STEPS.WALLET_CONNECTION]: { completed: true, completedAt: new Date() },
        [ONBOARDING_STEPS.KYC_DOCUMENT_UPLOAD]: { completed: false, completedAt: null },
        [ONBOARDING_STEPS.PAYMENT_METHOD]: { completed: false, completedAt: null },
        [ONBOARDING_STEPS.INITIAL_ESCROW_SETUP]: { completed: false, completedAt: null },
      };

      prismaMock.onboardingChecklist.findUnique.mockResolvedValue(checklist);

      const result = await onboardingService.getProgressAggregate(userId, TEST_USER.tenantId);

      expect(result.completedCount).toBe(completedSteps);
    });

    it('calculates completion percentage correctly', async () => {
      const userId = TEST_USER.id;
      const checklist = {
        userId,
        tenantId: TEST_USER.tenantId,
        [ONBOARDING_STEPS.EMAIL_VERIFICATION]: { completed: true, completedAt: new Date() },
        [ONBOARDING_STEPS.PHONE_VERIFICATION]: { completed: true, completedAt: new Date() },
        [ONBOARDING_STEPS.IDENTITY_VERIFICATION]: { completed: true, completedAt: new Date() },
        [ONBOARDING_STEPS.WALLET_CONNECTION]: { completed: false, completedAt: null },
        [ONBOARDING_STEPS.KYC_DOCUMENT_UPLOAD]: { completed: false, completedAt: null },
        [ONBOARDING_STEPS.PAYMENT_METHOD]: { completed: false, completedAt: null },
        [ONBOARDING_STEPS.INITIAL_ESCROW_SETUP]: { completed: false, completedAt: null },
      };

      prismaMock.onboardingChecklist.findUnique.mockResolvedValue(checklist);

      const result = await onboardingService.getProgressAggregate(userId, TEST_USER.tenantId);

      const expectedPercentage = (3 / STEP_ORDER.length) * 100;
      expect(result.completionPercentage).toBeCloseTo(expectedPercentage, 1);
    });
  });

  describe('Next Required Step Identification', () => {
    it('identifies first incomplete step as next required step', async () => {
      const userId = TEST_USER.id;
      const checklist = {
        userId,
        tenantId: TEST_USER.tenantId,
        [ONBOARDING_STEPS.EMAIL_VERIFICATION]: { completed: true, completedAt: new Date() },
        [ONBOARDING_STEPS.PHONE_VERIFICATION]: { completed: false, completedAt: null },
        [ONBOARDING_STEPS.IDENTITY_VERIFICATION]: { completed: false, completedAt: null },
        [ONBOARDING_STEPS.WALLET_CONNECTION]: { completed: false, completedAt: null },
        [ONBOARDING_STEPS.KYC_DOCUMENT_UPLOAD]: { completed: false, completedAt: null },
        [ONBOARDING_STEPS.PAYMENT_METHOD]: { completed: false, completedAt: null },
        [ONBOARDING_STEPS.INITIAL_ESCROW_SETUP]: { completed: false, completedAt: null },
      };

      prismaMock.onboardingChecklist.findUnique.mockResolvedValue(checklist);

      const result = await onboardingService.getProgressAggregate(userId, TEST_USER.tenantId);

      expect(result.nextStep).toBe(ONBOARDING_STEPS.PHONE_VERIFICATION);
    });

    it('returns null for nextStep when all steps completed', async () => {
      const userId = TEST_USER.id;
      const checklist = {
        userId,
        tenantId: TEST_USER.tenantId,
        [ONBOARDING_STEPS.EMAIL_VERIFICATION]: { completed: true, completedAt: new Date() },
        [ONBOARDING_STEPS.PHONE_VERIFICATION]: { completed: true, completedAt: new Date() },
        [ONBOARDING_STEPS.IDENTITY_VERIFICATION]: { completed: true, completedAt: new Date() },
        [ONBOARDING_STEPS.WALLET_CONNECTION]: { completed: true, completedAt: new Date() },
        [ONBOARDING_STEPS.KYC_DOCUMENT_UPLOAD]: { completed: true, completedAt: new Date() },
        [ONBOARDING_STEPS.PAYMENT_METHOD]: { completed: true, completedAt: new Date() },
        [ONBOARDING_STEPS.INITIAL_ESCROW_SETUP]: { completed: true, completedAt: new Date() },
      };

      prismaMock.onboardingChecklist.findUnique.mockResolvedValue(checklist);

      const result = await onboardingService.getProgressAggregate(userId, TEST_USER.tenantId);

      expect(result.nextStep).toBeNull();
      expect(result.completedCount).toBe(STEP_ORDER.length);
    });
  });

  describe('Skipped Steps Tracking', () => {
    it('identifies skipped steps in progress aggregate', async () => {
      const userId = TEST_USER.id;
      const skippedSteps = [
        ONBOARDING_STEPS.PHONE_VERIFICATION,
        ONBOARDING_STEPS.PAYMENT_METHOD,
      ];
      const checklist = {
        userId,
        tenantId: TEST_USER.tenantId,
        [ONBOARDING_STEPS.EMAIL_VERIFICATION]: { completed: true, completedAt: new Date() },
        [ONBOARDING_STEPS.PHONE_VERIFICATION]: { completed: false, skipped: true, skippedAt: new Date() },
        [ONBOARDING_STEPS.IDENTITY_VERIFICATION]: { completed: true, completedAt: new Date() },
        [ONBOARDING_STEPS.WALLET_CONNECTION]: { completed: true, completedAt: new Date() },
        [ONBOARDING_STEPS.KYC_DOCUMENT_UPLOAD]: { completed: true, completedAt: new Date() },
        [ONBOARDING_STEPS.PAYMENT_METHOD]: { completed: false, skipped: true, skippedAt: new Date() },
        [ONBOARDING_STEPS.INITIAL_ESCROW_SETUP]: { completed: false, completedAt: null },
      };

      prismaMock.onboardingChecklist.findUnique.mockResolvedValue(checklist);

      const result = await onboardingService.getProgressAggregate(userId, TEST_USER.tenantId);

      expect(result.skippedSteps).toEqual(expect.arrayContaining(skippedSteps));
      expect(result.skippedSteps.length).toBe(skippedSteps.length);
    });

    it('returns empty skippedSteps array when no steps are skipped', async () => {
      const userId = TEST_USER.id;
      const checklist = {
        userId,
        tenantId: TEST_USER.tenantId,
        [ONBOARDING_STEPS.EMAIL_VERIFICATION]: { completed: true, completedAt: new Date() },
        [ONBOARDING_STEPS.PHONE_VERIFICATION]: { completed: true, completedAt: new Date() },
        [ONBOARDING_STEPS.IDENTITY_VERIFICATION]: { completed: false, completedAt: null },
        [ONBOARDING_STEPS.WALLET_CONNECTION]: { completed: false, completedAt: null },
        [ONBOARDING_STEPS.KYC_DOCUMENT_UPLOAD]: { completed: false, completedAt: null },
        [ONBOARDING_STEPS.PAYMENT_METHOD]: { completed: false, completedAt: null },
        [ONBOARDING_STEPS.INITIAL_ESCROW_SETUP]: { completed: false, completedAt: null },
      };

      prismaMock.onboardingChecklist.findUnique.mockResolvedValue(checklist);

      const result = await onboardingService.getProgressAggregate(userId, TEST_USER.tenantId);

      expect(result.skippedSteps).toEqual([]);
    });
  });

  describe('Tenant-Specific User Identification', () => {
    it('retrieves user-specific progress scoped to tenant', async () => {
      const userId = TEST_USER.id;
      const tenantId = TEST_USER.tenantId;
      const checklist = {
        userId,
        tenantId,
        [ONBOARDING_STEPS.EMAIL_VERIFICATION]: { completed: true, completedAt: new Date() },
        [ONBOARDING_STEPS.PHONE_VERIFICATION]: { completed: false, completedAt: null },
        [ONBOARDING_STEPS.IDENTITY_VERIFICATION]: { completed: false, completedAt: null },
        [ONBOARDING_STEPS.WALLET_CONNECTION]: { completed: false, completedAt: null },
        [ONBOARDING_STEPS.KYC_DOCUMENT_UPLOAD]: { completed: false, completedAt: null },
        [ONBOARDING_STEPS.PAYMENT_METHOD]: { completed: false, completedAt: null },
        [ONBOARDING_STEPS.INITIAL_ESCROW_SETUP]: { completed: false, completedAt: null },
      };

      prismaMock.onboardingChecklist.findUnique.mockResolvedValue(checklist);

      const result = await onboardingService.getProgressAggregate(userId, tenantId);

      expect(prismaMock.onboardingChecklist.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId_tenantId: { userId, tenantId },
          }),
        })
      );
      expect(result.tenantId).toBe(tenantId);
    });

    it('isolates progress data across different tenants', async () => {
      const userId = TEST_USER.id;
      const tenant1 = 'tenant_abc';
      const tenant2 = 'tenant_xyz';

      const checklist1 = {
        userId,
        tenantId: tenant1,
        [ONBOARDING_STEPS.EMAIL_VERIFICATION]: { completed: true, completedAt: new Date() },
        [ONBOARDING_STEPS.PHONE_VERIFICATION]: { completed: true, completedAt: new Date() },
        [ONBOARDING_STEPS.IDENTITY_VERIFICATION]: { completed: false, completedAt: null },
      };

      const checklist2 = {
        userId,
        tenantId: tenant2,
        [ONBOARDING_STEPS.EMAIL_VERIFICATION]: { completed: true, completedAt: new Date() },
        [ONBOARDING_STEPS.PHONE_VERIFICATION]: { completed: false, completedAt: null },
        [ONBOARDING_STEPS.IDENTITY_VERIFICATION]: { completed: false, completedAt: null },
      };

      prismaMock.onboardingChecklist.findUnique
        .mockResolvedValueOnce(checklist1)
        .mockResolvedValueOnce(checklist2);

      const result1 = await onboardingService.getProgressAggregate(userId, tenant1);
      const result2 = await onboardingService.getProgressAggregate(userId, tenant2);

      expect(result1.tenantId).toBe(tenant1);
      expect(result2.tenantId).toBe(tenant2);
      expect(result1.completedCount).not.toBe(result2.completedCount);
    });
  });

  describe('Backward Compatibility', () => {
    it('existing onboarding operations continue to work', async () => {
      const userId = TEST_USER.id;
      const checklist = {
        userId,
        tenantId: TEST_USER.tenantId,
        [ONBOARDING_STEPS.EMAIL_VERIFICATION]: { completed: true, completedAt: new Date() },
        [ONBOARDING_STEPS.PHONE_VERIFICATION]: { completed: false, completedAt: null },
      };

      prismaMock.onboardingChecklist.findUnique.mockResolvedValue(checklist);

      const result = await onboardingService.getProgressAggregate(userId, TEST_USER.tenantId);

      expect(result).toBeDefined();
      expect(result).toHaveProperty('completedCount');
      expect(result).toHaveProperty('nextStep');
    });

    it('maintains backward-compatible step completion data', async () => {
      const userId = TEST_USER.id;
      const checklist = {
        userId,
        tenantId: TEST_USER.tenantId,
        [ONBOARDING_STEPS.EMAIL_VERIFICATION]: { completed: true, completedAt: new Date() },
      };

      prismaMock.onboardingChecklist.findUnique.mockResolvedValue(checklist);

      const result = await onboardingService.getProgressAggregate(userId, TEST_USER.tenantId);

      expect(result.completedCount).toBe(1);
      expect(result.nextStep).toBe(ONBOARDING_STEPS.PHONE_VERIFICATION);
    });
  });

  describe('Empty or Missing Checklist', () => {
    it('handles missing onboarding checklist gracefully', async () => {
      const userId = 'user_no_checklist';
      const tenantId = TEST_USER.tenantId;

      prismaMock.onboardingChecklist.findUnique.mockResolvedValue(null);

      const result = await onboardingService.getProgressAggregate(userId, tenantId);

      expect(result).toBeDefined();
      expect(result.completedCount).toBe(0);
      expect(result.nextStep).toBe(STEP_ORDER[0]);
    });

    it('handles completely empty checklist as not started', async () => {
      const userId = TEST_USER.id;
      const checklist = {
        userId,
        tenantId: TEST_USER.tenantId,
        [ONBOARDING_STEPS.EMAIL_VERIFICATION]: { completed: false, completedAt: null },
        [ONBOARDING_STEPS.PHONE_VERIFICATION]: { completed: false, completedAt: null },
        [ONBOARDING_STEPS.IDENTITY_VERIFICATION]: { completed: false, completedAt: null },
        [ONBOARDING_STEPS.WALLET_CONNECTION]: { completed: false, completedAt: null },
        [ONBOARDING_STEPS.KYC_DOCUMENT_UPLOAD]: { completed: false, completedAt: null },
        [ONBOARDING_STEPS.PAYMENT_METHOD]: { completed: false, completedAt: null },
        [ONBOARDING_STEPS.INITIAL_ESCROW_SETUP]: { completed: false, completedAt: null },
      };

      prismaMock.onboardingChecklist.findUnique.mockResolvedValue(checklist);

      const result = await onboardingService.getProgressAggregate(userId, TEST_USER.tenantId);

      expect(result.completedCount).toBe(0);
      expect(result.nextStep).toBe(STEP_ORDER[0]);
      expect(result.completionPercentage).toBe(0);
    });
  });
});
