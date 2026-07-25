import { jest } from '@jest/globals';

const prismaMock = {
  user: {
    update: jest.fn(),
  },
};

const onboardingServiceMock = {
  getChecklist: jest.fn(),
  getProgress: jest.fn(),
  completeStep: jest.fn(),
};

jest.unstable_mockModule('../lib/prisma.js', () => ({ default: prismaMock }));
jest.unstable_mockModule('../services/onboardingService.js', () => ({
  default: onboardingServiceMock,
  ...onboardingServiceMock,
}));

const { default: onboardingController } = await import('../api/controllers/onboardingController.js');

function createMockRes() {
  const res = {
    statusCode: 200,
    body: null,
    status: jest.fn().mockImplementation(function (code) {
      this.statusCode = code;
      return this;
    }),
    json: jest.fn().mockImplementation(function (payload) {
      this.body = payload;
      return this;
    }),
  };
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('onboardingController', () => {
  it('getOnboarding returns the checklist for the authenticated user', async () => {
    const checklist = [{ step: 'verify_email', completed: false }];
    onboardingServiceMock.getChecklist.mockResolvedValue(checklist);
    const req = { user: { userId: 1 } };
    const res = createMockRes();

    await onboardingController.getOnboarding(req, res);

    expect(onboardingServiceMock.getChecklist).toHaveBeenCalledWith(1);
    expect(res.body).toEqual(checklist);
  });

  it('getOnboardingProgress returns progress summary', async () => {
    const progress = { total: 5, completed: 1, percentage: 20 };
    onboardingServiceMock.getProgress.mockResolvedValue(progress);
    const req = { user: { userId: 1 } };
    const res = createMockRes();

    await onboardingController.getOnboardingProgress(req, res);

    expect(res.body).toEqual(progress);
  });

  it('connectWallet rejects an invalid Stellar address', async () => {
    const req = { user: { userId: 1 }, body: { address: 'not-a-valid-address' } };
    const res = createMockRes();

    await onboardingController.connectWallet(req, res);

    expect(res.statusCode).toBe(400);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('connectWallet links the wallet and completes the step', async () => {
    const address = 'G' + 'A'.repeat(55);
    prismaMock.user.update.mockResolvedValue({ id: 1, walletAddress: address });

    const req = { user: { userId: 1 }, body: { address } };
    const res = createMockRes();

    await onboardingController.connectWallet(req, res);

    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { walletAddress: address },
    });
    expect(onboardingServiceMock.completeStep).toHaveBeenCalledWith(1, 'connect_wallet');
    expect(res.body).toEqual({ id: 1, walletAddress: address });
  });
});
