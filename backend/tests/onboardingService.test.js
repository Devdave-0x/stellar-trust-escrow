import { jest } from '@jest/globals';

const prismaMock = {
  onboardingChecklist: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    upsert: jest.fn(),
  },
};

jest.unstable_mockModule('../lib/prisma.js', () => ({ default: prismaMock }));

const onboardingService = await import('../services/onboardingService.js');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('onboardingService.completeStep', () => {
  it('creates a completed row for a step not yet started', async () => {
    prismaMock.onboardingChecklist.findUnique.mockResolvedValue(null);
    const row = { userId: 1, step: 'connect_wallet', completedAt: new Date() };
    prismaMock.onboardingChecklist.upsert.mockResolvedValue(row);

    const result = await onboardingService.completeStep(1, 'connect_wallet');

    expect(prismaMock.onboardingChecklist.upsert).toHaveBeenCalled();
    expect(result).toEqual(row);
  });

  it('is idempotent — an already-completed step is not re-written', async () => {
    const alreadyCompleted = { userId: 1, step: 'connect_wallet', completedAt: new Date('2026-01-01') };
    prismaMock.onboardingChecklist.findUnique.mockResolvedValue(alreadyCompleted);

    const result = await onboardingService.completeStep(1, 'connect_wallet');

    expect(prismaMock.onboardingChecklist.upsert).not.toHaveBeenCalled();
    expect(result).toEqual(alreadyCompleted);
  });

  it('rejects an unknown step', async () => {
    await expect(onboardingService.completeStep(1, 'not_a_real_step')).rejects.toThrow(
      'Invalid onboarding step',
    );
  });
});

describe('onboardingService.getChecklist', () => {
  it('returns all steps, marking completed ones', async () => {
    prismaMock.onboardingChecklist.findMany.mockResolvedValue([
      { step: 'verify_email', completedAt: new Date('2026-01-01') },
    ]);

    const checklist = await onboardingService.getChecklist(1);

    expect(checklist).toHaveLength(5);
    const verifyEmail = checklist.find((c) => c.step === 'verify_email');
    expect(verifyEmail.completed).toBe(true);
    const connectWallet = checklist.find((c) => c.step === 'connect_wallet');
    expect(connectWallet.completed).toBe(false);
    expect(connectWallet.completedAt).toBeNull();
    expect(connectWallet.actionUrl).toBeTruthy();
  });
});

describe('onboardingService.getProgress', () => {
  it('computes total/completed/percentage', async () => {
    prismaMock.onboardingChecklist.findMany.mockResolvedValue([
      { step: 'verify_email', completedAt: new Date() },
      { step: 'connect_wallet', completedAt: new Date() },
    ]);

    const progress = await onboardingService.getProgress(1);

    expect(progress).toEqual({ total: 5, completed: 2, percentage: 40 });
  });

  it('returns 0% when nothing is complete', async () => {
    prismaMock.onboardingChecklist.findMany.mockResolvedValue([]);

    const progress = await onboardingService.getProgress(1);

    expect(progress).toEqual({ total: 5, completed: 0, percentage: 0 });
  });
});
