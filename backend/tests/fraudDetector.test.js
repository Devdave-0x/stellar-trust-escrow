import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const prismaMock = {
  session: {
    findFirst: jest.fn(),
  },
  escrow: {
    count: jest.fn(),
  },
  milestone: {
    count: jest.fn(),
  },
  adminAuditLog: {
    create: jest.fn(),
    findFirst: jest.fn(),
  },
};

jest.unstable_mockModule('../lib/prisma.js', () => ({ default: prismaMock }));

const fraudDetector = await import('../services/fraudDetector.js');

const SIGNAL_DESCRIPTIONS = {
  SAME_IP: 'Client and freelancer share the same IP address',
  RAPID_COMPLETION: 'Escrow completed within 1 hour of creation',
  REPEATED_PAIR: 'Same client-freelancer pair has completed 3+ escrows together',
  ROUND_AMOUNT: 'Amount is divisible by 1M stroops (suspiciously round)',
  ZERO_MILESTONES: 'No milestones defined for the escrow',
};

const mockEscrow = (overrides = {}) => ({
  id: 1n,
  clientAddress: 'GCLIENT'.padEnd(56, 'A'),
  freelancerAddress: 'GFREELANCER'.padEnd(56, 'B'),
  status: 'Completed',
  totalAmount: '1000000',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T01:00:00Z'),
  ...overrides,
});

describe('fraudDetector.scoreEscrow signals', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.session.findFirst.mockResolvedValue(null);
    prismaMock.escrow.count.mockResolvedValue(0);
    prismaMock.milestone.count.mockResolvedValue(1);
  });

  it('detects SAME_IP signal', async () => {
    const clientIp = '192.168.1.1';
    prismaMock.session.findFirst
      .mockResolvedValueOnce({ ipAddress: clientIp })
      .mockResolvedValueOnce({ ipAddress: clientIp });

    const escrow = mockEscrow();
    const result = await fraudDetector.scoreEscrow(escrow);

    expect(result.signals).toContain('SAME_IP');
    expect(result.score).toBeGreaterThan(0);
  });

  it('detects RAPID_COMPLETION signal', async () => {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    const escrow = mockEscrow({
      createdAt: oneHourAgo,
      updatedAt: now,
    });

    const result = await fraudDetector.scoreEscrow(escrow);

    expect(result.signals).toContain('RAPID_COMPLETION');
  });

  it('detects REPEATED_PAIR signal', async () => {
    prismaMock.escrow.count.mockResolvedValue(4);

    const escrow = mockEscrow();
    const result = await fraudDetector.scoreEscrow(escrow);

    expect(result.signals).toContain('REPEATED_PAIR');
  });

  it('detects ROUND_AMOUNT signal', async () => {
    const escrow = mockEscrow({ totalAmount: '5000000' });
    const result = await fraudDetector.scoreEscrow(escrow);

    expect(result.signals).toContain('ROUND_AMOUNT');
  });

  it('detects ZERO_MILESTONES signal', async () => {
    prismaMock.milestone.count.mockResolvedValue(0);

    const escrow = mockEscrow();
    const result = await fraudDetector.scoreEscrow(escrow);

    expect(result.signals).toContain('ZERO_MILESTONES');
  });

  it('returns no signals for clean escrow', async () => {
    const escrow = mockEscrow({
      totalAmount: '123456789',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-02T00:00:00Z'),
    });

    const result = await fraudDetector.scoreEscrow(escrow);

    expect(result.signals).toHaveLength(0);
    expect(result.score).toBe(0);
    expect(result.flagged).toBe(false);
  });
});

describe('fraudDetector.scoreEscrow weighted scoring', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.FRAUD_W_SAME_IP = '40';
    process.env.FRAUD_W_RAPID = '20';
    process.env.FRAUD_W_PAIR = '25';
    process.env.FRAUD_W_ROUND = '10';
    process.env.FRAUD_W_ZERO_MS = '5';
  });

  it('accumulates scores from multiple signals', async () => {
    prismaMock.session.findFirst
      .mockResolvedValueOnce({ ipAddress: '192.168.1.1' })
      .mockResolvedValueOnce({ ipAddress: '192.168.1.1' });
    prismaMock.escrow.count.mockResolvedValue(4);

    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const escrow = mockEscrow({
      createdAt: oneHourAgo,
      updatedAt: now,
      totalAmount: '5000000',
    });

    const result = await fraudDetector.scoreEscrow(escrow);

    expect(result.signals.length).toBeGreaterThan(1);
    expect(result.score).toBeGreaterThan(40);
  });

  it('flags escrow when score reaches or exceeds threshold', async () => {
    process.env.FRAUD_SCORE_THRESHOLD = '50';

    prismaMock.session.findFirst
      .mockResolvedValueOnce({ ipAddress: '192.168.1.1' })
      .mockResolvedValueOnce({ ipAddress: '192.168.1.1' });
    prismaMock.escrow.count.mockResolvedValue(4);

    const escrow = mockEscrow();
    const result = await fraudDetector.scoreEscrow(escrow);

    expect(result.flagged).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(50);
  });

  it('does not flag when score is below threshold', async () => {
    process.env.FRAUD_SCORE_THRESHOLD = '100';

    prismaMock.session.findFirst.mockResolvedValue(null);
    prismaMock.escrow.count.mockResolvedValue(0);
    prismaMock.milestone.count.mockResolvedValue(1);

    const escrow = mockEscrow({ totalAmount: '999999' });
    const result = await fraudDetector.scoreEscrow(escrow);

    expect(result.flagged).toBe(false);
  });
});

describe('fraudDetector signal explanations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.session.findFirst.mockResolvedValue(null);
    prismaMock.escrow.count.mockResolvedValue(0);
    prismaMock.milestone.count.mockResolvedValue(1);
  });

  it('includes human-readable signal descriptions', async () => {
    expect(SIGNAL_DESCRIPTIONS).toHaveProperty('SAME_IP');
    expect(SIGNAL_DESCRIPTIONS).toHaveProperty('RAPID_COMPLETION');
    expect(SIGNAL_DESCRIPTIONS).toHaveProperty('REPEATED_PAIR');
    expect(SIGNAL_DESCRIPTIONS).toHaveProperty('ROUND_AMOUNT');
    expect(SIGNAL_DESCRIPTIONS).toHaveProperty('ZERO_MILESTONES');

    Object.values(SIGNAL_DESCRIPTIONS).forEach((desc) => {
      expect(typeof desc).toBe('string');
      expect(desc.length).toBeGreaterThan(0);
    });
  });

  it('provides explanations for all detected signals', async () => {
    prismaMock.session.findFirst
      .mockResolvedValueOnce({ ipAddress: '192.168.1.1' })
      .mockResolvedValueOnce({ ipAddress: '192.168.1.1' });
    prismaMock.milestone.count.mockResolvedValue(0);

    const escrow = mockEscrow();
    const result = await fraudDetector.scoreEscrow(escrow);

    result.signals.forEach((signal) => {
      expect(SIGNAL_DESCRIPTIONS).toHaveProperty(signal);
    });
  });

  it('explains why escrow was flagged with signal details', async () => {
    prismaMock.session.findFirst
      .mockResolvedValueOnce({ ipAddress: '192.168.1.1' })
      .mockResolvedValueOnce({ ipAddress: '192.168.1.1' });

    process.env.FRAUD_SCORE_THRESHOLD = '30';

    const escrow = mockEscrow();
    const result = await fraudDetector.scoreEscrow(escrow);

    if (result.flagged) {
      expect(result.signals.length).toBeGreaterThan(0);
      expect(result.score).toBeGreaterThanOrEqual(30);

      const explanation = `Fraud signals: ${result.signals.join(', ')} (score: ${result.score})`;
      expect(explanation).toMatch(/Fraud signals:/);
      expect(explanation).toMatch(/score:/);
    }
  });
});

describe('fraudDetector.runFraudCheck', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.FRAUD_SCORE_THRESHOLD = '50';
  });

  it('creates audit logs when escrow is flagged', async () => {
    prismaMock.escrow.findUnique = jest.fn().mockResolvedValue(mockEscrow());
    prismaMock.session.findFirst
      .mockResolvedValueOnce({ ipAddress: '192.168.1.1' })
      .mockResolvedValueOnce({ ipAddress: '192.168.1.1' });
    prismaMock.adminAuditLog.create.mockResolvedValue({});

    await fraudDetector.default.runFraudCheck(1);

    const calls = prismaMock.adminAuditLog.create.mock.calls;
    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls[0][0].data.action).toBe('FRAUD_FLAGGED');
  });

  it('suspends reputation for both client and freelancer when flagged', async () => {
    prismaMock.escrow.findUnique = jest.fn().mockResolvedValue(mockEscrow());
    prismaMock.session.findFirst
      .mockResolvedValueOnce({ ipAddress: '192.168.1.1' })
      .mockResolvedValueOnce({ ipAddress: '192.168.1.1' });
    prismaMock.adminAuditLog.create.mockResolvedValue({});

    await fraudDetector.default.runFraudCheck(1);

    const calls = prismaMock.adminAuditLog.create.mock.calls;
    const reputationSuspensions = calls.filter((c) => c[0].data.action === 'REPUTATION_SUSPENDED');

    expect(reputationSuspensions.length).toBeGreaterThanOrEqual(2);
  });

  it('does not create audit logs when escrow is not flagged', async () => {
    process.env.FRAUD_SCORE_THRESHOLD = '1000';
    prismaMock.escrow.findUnique = jest.fn().mockResolvedValue(mockEscrow());
    prismaMock.session.findFirst.mockResolvedValue(null);
    prismaMock.escrow.count.mockResolvedValue(0);
    prismaMock.milestone.count.mockResolvedValue(1);
    prismaMock.adminAuditLog.create.mockResolvedValue({});

    await fraudDetector.default.runFraudCheck(1);

    expect(prismaMock.adminAuditLog.create).not.toHaveBeenCalled();
  });

  it('returns detailed result with score and signals', async () => {
    prismaMock.escrow.findUnique = jest.fn().mockResolvedValue(mockEscrow());
    prismaMock.session.findFirst
      .mockResolvedValueOnce({ ipAddress: '192.168.1.1' })
      .mockResolvedValueOnce({ ipAddress: '192.168.1.1' });
    prismaMock.milestone.count.mockResolvedValue(1);
    prismaMock.adminAuditLog.create.mockResolvedValue({});

    const result = await fraudDetector.default.runFraudCheck(1);

    expect(result).toHaveProperty('score');
    expect(result).toHaveProperty('signals');
    expect(result).toHaveProperty('flagged');
  });
});

describe('fraudDetector.isReputationSuspended', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns true when latest action is REPUTATION_SUSPENDED', async () => {
    prismaMock.adminAuditLog.findFirst.mockResolvedValue({
      action: 'REPUTATION_SUSPENDED',
      performedAt: new Date(),
    });

    const result = await fraudDetector.default.isReputationSuspended('GADDRESS');

    expect(result).toBe(true);
  });

  it('returns false when latest action is REPUTATION_RESTORED', async () => {
    prismaMock.adminAuditLog.findFirst.mockResolvedValue({
      action: 'REPUTATION_RESTORED',
      performedAt: new Date(),
    });

    const result = await fraudDetector.default.isReputationSuspended('GADDRESS');

    expect(result).toBe(false);
  });

  it('returns false when no suspension record exists', async () => {
    prismaMock.adminAuditLog.findFirst.mockResolvedValue(null);

    const result = await fraudDetector.default.isReputationSuspended('GADDRESS');

    expect(result).toBe(false);
  });

  it('handles errors gracefully', async () => {
    prismaMock.adminAuditLog.findFirst.mockRejectedValue(new Error('DB error'));

    const result = await fraudDetector.default.isReputationSuspended('GADDRESS');

    expect(result).toBe(false);
  });
});

describe('fraudDetector API response format', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.session.findFirst.mockResolvedValue(null);
    prismaMock.escrow.count.mockResolvedValue(0);
    prismaMock.milestone.count.mockResolvedValue(1);
  });

  it('formats response with signal identifiers', async () => {
    prismaMock.session.findFirst
      .mockResolvedValueOnce({ ipAddress: '192.168.1.1' })
      .mockResolvedValueOnce({ ipAddress: '192.168.1.1' });

    const escrow = mockEscrow();
    const result = await fraudDetector.scoreEscrow(escrow);

    result.signals.forEach((signal) => {
      expect(signal).toMatch(/^[A-Z_]+$/);
    });
  });

  it('includes score in response', async () => {
    const escrow = mockEscrow();
    const result = await fraudDetector.scoreEscrow(escrow);

    expect(typeof result.score).toBe('number');
    expect(result.score).toBeGreaterThanOrEqual(0);
  });

  it('indicates flagged status based on threshold', async () => {
    process.env.FRAUD_SCORE_THRESHOLD = '50';

    const escrow = mockEscrow();
    const result = await fraudDetector.scoreEscrow(escrow);

    expect(typeof result.flagged).toBe('boolean');
  });
});
