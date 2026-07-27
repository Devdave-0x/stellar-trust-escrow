import { jest } from '@jest/globals';
import referralService from '../services/referralService.js';

describe('referralService.generateReferralCode', () => {
  it('produces an 8-char uppercase alphanumeric code', () => {
    const code = referralService.generateReferralCode();
    expect(code).toMatch(/^[A-Z0-9]{8}$/);
  });
});

describe('referralService.createUniqueReferralCode', () => {
  it('returns a code that does not collide with an existing one', async () => {
    const tx = { userProfile: { findUnique: jest.fn().mockResolvedValue(null) } };

    const code = await referralService.createUniqueReferralCode(tx);

    expect(code).toMatch(/^[A-Z0-9]{8}$/);
    expect(tx.userProfile.findUnique).toHaveBeenCalledWith({
      where: { referralCode: code },
      select: { address: true },
    });
  });

  it('retries when a generated code already exists', async () => {
    const tx = {
      userProfile: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({ address: 'G'.repeat(56) }) // first attempt collides
          .mockResolvedValueOnce(null), // second attempt is unique
      },
    };

    const code = await referralService.createUniqueReferralCode(tx);

    expect(code).toMatch(/^[A-Z0-9]{8}$/);
    expect(tx.userProfile.findUnique).toHaveBeenCalledTimes(2);
  });

  it('throws if it cannot find a unique code within the retry budget', async () => {
    const tx = {
      userProfile: { findUnique: jest.fn().mockResolvedValue({ address: 'G'.repeat(56) }) },
    };

    await expect(referralService.createUniqueReferralCode(tx)).rejects.toThrow(
      'Failed to generate a unique referral code',
    );
  });
});
