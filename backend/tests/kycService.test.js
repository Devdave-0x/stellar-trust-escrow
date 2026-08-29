import { jest } from '@jest/globals';

const prismaMock = {
  kycVerification: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
  },
};

const auditServiceMock = {
  log: jest.fn(),
};

jest.unstable_mockModule('../lib/prisma.js', () => ({
  default: prismaMock,
}));

jest.unstable_mockModule('../services/auditService.js', () => ({
  AuditAction: {
    KYC_APPROVED: 'KYC_APPROVED',
    KYC_DECLINED: 'KYC_DECLINED',
    KYC_SUBMITTED: 'KYC_SUBMITTED',
  },
  AuditCategory: {
    KYC: 'KYC',
  },
  default: auditServiceMock,
}));

const kycService = (await import('../services/kycService.js')).default;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('kycService.handleWebhook', () => {
  it('returns null for empty input', async () => {
    const result = await kycService.handleWebhook({});
    expect(result).toBeNull();
    expect(prismaMock.kycVerification.upsert).not.toHaveBeenCalled();
  });

  it('returns null for an unrecognized/malformed event type', async () => {
    const result = await kycService.handleWebhook({
      externalUserId: 'GABC123',
      applicantId: 'app_1',
      type: 'someUnknownEventType',
      reviewResult: { reviewAnswer: 'GREEN' },
    });

    expect(result).toBeNull();
    expect(prismaMock.kycVerification.upsert).not.toHaveBeenCalled();
    expect(auditServiceMock.log).not.toHaveBeenCalled();
  });

  it('handles the unhappy path: reviewResult missing on applicantReviewed defaults to Declined', async () => {
    prismaMock.kycVerification.upsert.mockResolvedValue({
      address: 'GABC123',
      applicantId: 'app_1',
      status: 'Declined',
      reviewResult: null,
      rejectLabels: [],
    });

    const result = await kycService.handleWebhook({
      externalUserId: 'GABC123',
      applicantId: 'app_1',
      type: 'applicantReviewed',
      reviewResult: undefined,
    });

    expect(prismaMock.kycVerification.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ status: 'Declined' }),
      }),
    );
    expect(auditServiceMock.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'KYC_DECLINED' }),
    );
    expect(result.status).toBe('Declined');
  });

  it('does not throw when externalUserId is missing (malformed payload)', async () => {
    prismaMock.kycVerification.upsert.mockResolvedValue({
      address: undefined,
      applicantId: 'app_2',
      status: 'Init',
    });

    await expect(
      kycService.handleWebhook({ applicantId: 'app_2', type: 'applicantCreated' }),
    ).resolves.not.toThrow();
  });
});

describe('kycService.getStatus', () => {
  it('returns null when no record exists for the given address', async () => {
    prismaMock.kycVerification.findUnique.mockResolvedValue(null);

    const result = await kycService.getStatus('GDOESNOTEXIST');

    expect(result).toBeNull();
    expect(prismaMock.kycVerification.findUnique).toHaveBeenCalledWith({
      where: { address: 'GDOESNOTEXIST' },
    });
  });
});

describe('kycService.verifyWebhookSignature', () => {
  it('returns false for a malformed/incorrect signature', () => {
    const result = kycService.verifyWebhookSignature(
      'raw-body',
      Buffer.alloc(32).toString('hex'),
    );
    expect(result).toBe(false);
  });
});
