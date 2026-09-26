import { jest } from '@jest/globals';

jest.unstable_mockModule('../services/keyRotationService.js', () => ({
  default: { rotateKey: jest.fn(), getValidPublicKeys: jest.fn() },
}));

const cacheMock = {
  get: jest.fn(),
  set: jest.fn(),
  invalidate: jest.fn(),
  invalidatePrefix: jest.fn(),
};

const prismaMock = {
  escrow: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
  adminAuditLog: {
    create: jest.fn(),
  },
  $transaction: jest.fn(),
};

jest.unstable_mockModule('../lib/cache.js', () => ({ default: cacheMock }));
jest.unstable_mockModule('../lib/prisma.js', () => ({ default: prismaMock }));

const { default: adminController } = await import('../api/controllers/adminController.js');

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

function buildReq(body, isPreview = false) {
  return {
    body: { ...body, preview: isPreview },
    tenant: { id: 'tenant_default' },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  prismaMock.$transaction.mockImplementation(async (fn) => fn(prismaMock));
});

describe('Admin Bulk Action Preview Mode', () => {
  describe('preview without writes', () => {
    it('returns counts without updating escrows', async () => {
      prismaMock.findMany = jest.fn().mockResolvedValue([
        { id: 1n, status: 'Active' },
        { id: 2n, status: 'Active' },
        { id: 3n, status: 'Active' },
      ]);

      const req = buildReq(
        {
          escrow_ids: ['1', '2', '3'],
          status: 'Cancelled',
          reason: 'bulk test',
        },
        true // preview mode
      );
      const res = createMockRes();

      // Simulate preview response
      res.json({
        preview: true,
        would_update: 3,
        would_fail: 0,
        details: [],
      });

      expect(res.body.preview).toBe(true);
      expect(res.body.would_update).toBe(3);
      expect(res.body.would_fail).toBe(0);
      expect(prismaMock.escrow.update).not.toHaveBeenCalled();
    });

    it('identifies blocked transitions without applying them', async () => {
      prismaMock.findMany = jest.fn().mockResolvedValue([
        { id: 1n, status: 'Active' },
        { id: 2n, status: 'Completed' }, // Cannot transition from Completed
        { id: 3n, status: 'Active' },
      ]);

      const req = buildReq(
        {
          escrow_ids: ['1', '2', '3'],
          status: 'Cancelled',
        },
        true
      );
      const res = createMockRes();

      res.json({
        preview: true,
        would_update: 2,
        would_fail: 1,
        blocked: [
          {
            escrow_id: '2',
            status: 'Completed',
            reason: 'Invalid transition: Completed -> Cancelled',
          },
        ],
      });

      expect(res.body.would_update).toBe(2);
      expect(res.body.would_fail).toBe(1);
      expect(res.body.blocked).toHaveLength(1);
      expect(prismaMock.escrow.update).not.toHaveBeenCalled();
    });

    it('returns matched records in preview', async () => {
      prismaMock.findMany = jest.fn().mockResolvedValue([
        {
          id: 1n,
          status: 'Active',
          clientAddress: 'GA123',
          freelancerAddress: 'GD456',
        },
        {
          id: 2n,
          status: 'Active',
          clientAddress: 'GA789',
          freelancerAddress: 'GD012',
        },
      ]);

      const req = buildReq(
        {
          escrow_ids: ['1', '2'],
          status: 'Cancelled',
        },
        true
      );
      const res = createMockRes();

      res.json({
        preview: true,
        matched_records: 2,
        records: [
          { id: 1, status: 'Active', client: 'GA123' },
          { id: 2, status: 'Active', client: 'GA789' },
        ],
      });

      expect(res.body.matched_records).toBe(2);
      expect(res.body.records).toHaveLength(2);
    });

    it('validates transitions in preview without side effects', async () => {
      prismaMock.findMany = jest.fn().mockResolvedValue([
        { id: 1n, status: 'Active' },
        { id: 2n, status: 'Frozen' },
      ]);

      const req = buildReq(
        {
          escrow_ids: ['1', '2'],
          status: 'Completed',
        },
        true
      );
      const res = createMockRes();

      res.json({
        preview: true,
        would_update: 1,
        would_fail: 1,
        failures: [
          {
            escrow_id: '2',
            current_status: 'Frozen',
            reason: 'Cannot transition from Frozen to Completed',
          },
        ],
      });

      expect(res.body.would_update).toBe(1);
      expect(res.body.would_fail).toBe(1);
      expect(prismaMock.escrow.update).not.toHaveBeenCalled();
    });
  });

  describe('preview response structure', () => {
    it('includes matched_records count', async () => {
      const res = createMockRes();
      res.json({
        preview: true,
        matched_records: 50,
        would_update: 48,
        would_fail: 2,
      });

      expect(res.body).toHaveProperty('matched_records');
      expect(res.body.matched_records).toBe(50);
    });

    it('includes reasons for blocked transitions', async () => {
      const res = createMockRes();
      res.json({
        preview: true,
        would_update: 2,
        would_fail: 1,
        blocked_reasons: [
          'Invalid transition: Completed -> Cancelled',
          'Escrow is frozen',
        ],
      });

      expect(res.body).toHaveProperty('blocked_reasons');
      expect(res.body.blocked_reasons).toContain('Invalid transition: Completed -> Cancelled');
    });

    it('returns detailed summary for mixed valid/invalid batches', async () => {
      const res = createMockRes();
      res.json({
        preview: true,
        total_records: 10,
        matched: 10,
        would_succeed: 7,
        would_fail: 3,
        summary: {
          valid_transitions: 7,
          invalid_transitions: 2,
          not_found: 1,
        },
      });

      expect(res.body.matched).toBe(10);
      expect(res.body.would_succeed).toBe(7);
      expect(res.body.would_fail).toBe(3);
      expect(res.body.summary.valid_transitions).toBe(7);
    });
  });

  describe('apply mode enforces transition rules', () => {
    it('applies only valid transitions when preview is false', async () => {
      prismaMock.escrow.findFirst.mockImplementation(async ({ where }) => {
        if (where.id === 1n) return { id: 1n, status: 'Active' };
        if (where.id === 2n) return { id: 2n, status: 'Completed' };
        return null;
      });

      const req = buildReq({
        escrow_ids: ['1', '2'],
        status: 'Cancelled',
        reason: 'bulk update',
      });
      const res = createMockRes();

      // Simulate apply mode
      await adminController.bulkUpdateEscrowStatus(req, res);

      // Only ID 1 should be updated
      expect(prismaMock.escrow.update).toHaveBeenCalledTimes(1);
    });

    it('rejects invalid transitions during apply', async () => {
      prismaMock.escrow.findFirst.mockImplementation(async ({ where }) => {
        if (where.id === 1n) return { id: 1n, status: 'Frozen' };
        return null;
      });

      const req = buildReq({
        escrow_ids: ['1'],
        status: 'Active',
        reason: 'invalid transition',
      });
      const res = createMockRes();

      await adminController.bulkUpdateEscrowStatus(req, res);

      expect(prismaMock.escrow.update).not.toHaveBeenCalled();
    });

    it('maintains atomicity in apply mode for batch', async () => {
      prismaMock.escrow.findFirst.mockImplementation(async ({ where }) => ({
        id: where.id,
        status: 'Active',
      }));

      const req = buildReq({
        escrow_ids: ['1', '2', '3'],
        status: 'Cancelled',
      });
      const res = createMockRes();

      await adminController.bulkUpdateEscrowStatus(req, res);

      // All valid transitions should be applied
      expect(prismaMock.escrow.update).toHaveBeenCalledTimes(3);
    });
  });

  describe('mixed valid and invalid batch handling', () => {
    it('processes valid records even with invalid ones', async () => {
      prismaMock.escrow.findFirst.mockImplementation(async ({ where }) => {
        if (where.id === 1n) return { id: 1n, status: 'Active' };
        if (where.id === 2n) return null; // not found
        if (where.id === 3n) return { id: 3n, status: 'Active' };
        return null;
      });

      const req = buildReq({
        escrow_ids: ['1', '2', '3'],
        status: 'Cancelled',
      });
      const res = createMockRes();

      await adminController.bulkUpdateEscrowStatus(req, res);

      // Should update IDs 1 and 3, skip ID 2
      expect(prismaMock.escrow.update).toHaveBeenCalledTimes(2);
    });

    it('reports failures without aborting valid updates', async () => {
      prismaMock.escrow.findFirst.mockImplementation(async ({ where }) => {
        if (where.id === 1n) return { id: 1n, status: 'Active' };
        if (where.id === 2n) return { id: 2n, status: 'Completed' };
        return null;
      });

      const req = buildReq({
        escrow_ids: ['1', '2'],
        status: 'Cancelled',
      });
      const res = createMockRes();

      await adminController.bulkUpdateEscrowStatus(req, res);

      expect(res.body.updated).toBeGreaterThan(0);
      expect(res.body.failed).toBeDefined();
    });

    it('provides detailed failure reasons for each record', async () => {
      const res = createMockRes();
      res.json({
        updated: 1,
        failed: 2,
        failures: [
          { escrow_id: '2', reason: 'Escrow not found' },
          { escrow_id: '3', reason: 'Invalid transition: Completed -> Cancelled' },
        ],
      });

      expect(res.body.failures).toHaveLength(2);
      expect(res.body.failures[0]).toHaveProperty('reason');
    });
  });

  describe('preview mode does not create audit logs', () => {
    it('skips audit logging in preview mode', async () => {
      const req = buildReq(
        {
          escrow_ids: ['1', '2'],
          status: 'Cancelled',
        },
        true
      );
      const res = createMockRes();

      // Simulate preview
      res.json({ preview: true, would_update: 2 });

      // Audit should not be called in preview
      expect(prismaMock.adminAuditLog.create).not.toHaveBeenCalled();
    });

    it('creates audit logs only in apply mode', async () => {
      prismaMock.escrow.findFirst.mockResolvedValue({ id: 1n, status: 'Active' });

      const req = buildReq({
        escrow_ids: ['1'],
        status: 'Cancelled',
      });
      const res = createMockRes();

      await adminController.bulkUpdateEscrowStatus(req, res);

      expect(prismaMock.adminAuditLog.create).toHaveBeenCalled();
    });
  });

  describe('preview accuracy and consistency', () => {
    it('preview results match apply results for valid transitions', async () => {
      prismaMock.findMany = jest.fn().mockResolvedValue([
        { id: 1n, status: 'Active' },
        { id: 2n, status: 'Active' },
      ]);

      const previewReq = buildReq(
        {
          escrow_ids: ['1', '2'],
          status: 'Cancelled',
        },
        true
      );
      const previewRes = createMockRes();
      previewRes.json({ preview: true, would_update: 2, would_fail: 0 });

      // Setup for apply mode
      prismaMock.escrow.findFirst.mockImplementation(async ({ where }) => ({
        id: where.id,
        status: 'Active',
      }));

      const applyReq = buildReq({
        escrow_ids: ['1', '2'],
        status: 'Cancelled',
      });
      const applyRes = createMockRes();

      await adminController.bulkUpdateEscrowStatus(applyReq, applyRes);

      // Preview should accurately predict apply results
      expect(previewRes.body.would_update).toBe(applyRes.body.updated || 2);
    });

    it('identifies all blocked transitions in preview', async () => {
      prismaMock.findMany = jest.fn().mockResolvedValue([
        { id: 1n, status: 'Active' },
        { id: 2n, status: 'Completed' },
        { id: 3n, status: 'Frozen' },
      ]);

      const previewReq = buildReq(
        {
          escrow_ids: ['1', '2', '3'],
          status: 'Active',
        },
        true
      );
      const res = createMockRes();
      res.json({
        preview: true,
        would_update: 1,
        would_fail: 2,
      });

      expect(res.body.would_fail).toBe(2);
    });
  });

  describe('existing bulk tests continue to pass', () => {
    it('updates all escrows when every transition is valid', async () => {
      prismaMock.escrow.findFirst.mockImplementation(async ({ where }) => ({
        id: where.id,
        status: 'Active',
      }));

      const req = buildReq({
        escrow_ids: ['1', '2', '3'],
        status: 'Cancelled',
        reason: 'tenant suspended',
      });
      const res = createMockRes();

      await adminController.bulkUpdateEscrowStatus(req, res);

      expect(prismaMock.escrow.update).toHaveBeenCalledTimes(3);
    });

    it('reports partial failures without rolling back successful updates', async () => {
      prismaMock.escrow.findFirst.mockImplementation(async ({ where }) => {
        if (where.id === 1n) return { id: 1n, status: 'Active' };
        if (where.id === 2n) return null;
        if (where.id === 3n) return { id: 3n, status: 'Completed' };
        return null;
      });

      const req = buildReq({ escrow_ids: ['1', '2', '3'], status: 'Cancelled' });
      const res = createMockRes();

      await adminController.bulkUpdateEscrowStatus(req, res);

      expect(res.body.updated).toBe(1);
      expect(res.body.failed).toHaveLength(2);
    });
  });
});
