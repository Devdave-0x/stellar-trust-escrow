import { jest } from '@jest/globals';

const prismaMock = {
  userProfile: { findUnique: jest.fn(), upsert: jest.fn() },
  referral: { count: jest.fn(), findMany: jest.fn() },
  $transaction: jest.fn(),
};

jest.unstable_mockModule('../lib/prisma.js', () => ({ default: prismaMock }));

const { default: referralController } = await import('../api/controllers/referralController.js');

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

const ADDRESS = 'G'.repeat(56);

beforeEach(() => {
  jest.clearAllMocks();
  prismaMock.$transaction.mockImplementation(async (ops) => Promise.all(ops));
});

describe('referralController.getMyReferral', () => {
  it('returns the referral code, total referrals, and pending rewards', async () => {
    prismaMock.userProfile.findUnique.mockResolvedValue({ referralCode: 'ABCD1234' });
    prismaMock.referral.count.mockResolvedValueOnce(5).mockResolvedValueOnce(2);

    const req = { user: { address: ADDRESS }, tenant: { id: 'tenant_default' } };
    const res = createMockRes();

    await referralController.getMyReferral(req, res);

    expect(res.body).toEqual({
      referralCode: 'ABCD1234',
      totalReferrals: 5,
      pendingRewards: 2,
    });
  });

  it('returns 401 when unauthenticated', async () => {
    const req = { user: null, tenant: { id: 'tenant_default' } };
    const res = createMockRes();

    await referralController.getMyReferral(req, res);

    expect(res.statusCode).toBe(401);
  });

  it('generates and persists a referral code on first request if the profile does not have one', async () => {
    prismaMock.userProfile.findUnique
      .mockResolvedValueOnce(null) // no profile yet
      .mockResolvedValueOnce(null); // uniqueness check inside createUniqueReferralCode
    prismaMock.userProfile.upsert.mockResolvedValue({ referralCode: 'NEWCODE1' });
    prismaMock.referral.count.mockResolvedValue(0);

    const req = { user: { address: ADDRESS }, tenant: { id: 'tenant_default' } };
    const res = createMockRes();

    await referralController.getMyReferral(req, res);

    expect(prismaMock.userProfile.upsert).toHaveBeenCalledWith({
      where: { address: ADDRESS },
      create: {
        address: ADDRESS,
        tenantId: 'tenant_default',
        referralCode: expect.stringMatching(/^[A-Z0-9]{8}$/),
      },
      update: { referralCode: expect.stringMatching(/^[A-Z0-9]{8}$/) },
      select: { referralCode: true },
    });
    expect(res.body.referralCode).toBe('NEWCODE1');
  });
});

describe('referralController.getMyReferrals', () => {
  it('returns an anonymised list with only the referral date, no PII', async () => {
    prismaMock.referral.findMany.mockResolvedValue([
      { createdAt: new Date('2026-01-01'), rewardedAt: null },
      { createdAt: new Date('2026-02-01'), rewardedAt: new Date('2026-02-05') },
    ]);
    prismaMock.referral.count.mockResolvedValue(2);

    const req = { user: { address: ADDRESS }, query: {} };
    const res = createMockRes();

    await referralController.getMyReferrals(req, res);

    expect(res.body.total).toBe(2);
    expect(res.body.data).toEqual([
      { joinedAt: new Date('2026-01-01'), rewarded: false },
      { joinedAt: new Date('2026-02-01'), rewarded: true },
    ]);
    for (const entry of res.body.data) {
      expect(Object.keys(entry).sort()).toEqual(['joinedAt', 'rewarded']);
    }
  });

  it('returns 401 when unauthenticated', async () => {
    const req = { user: null, query: {} };
    const res = createMockRes();

    await referralController.getMyReferrals(req, res);

    expect(res.statusCode).toBe(401);
  });
});
