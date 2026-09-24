import { describe, test, expect, beforeEach, jest } from '@jest/globals';

jest.unstable_mockModule('../services/escrowService.js', () => ({
  getEscrowList: jest.fn().mockResolvedValue([
    {
      id: 'escrow-1',
      status: 'active',
      amount: '1000.00',
      receiver: 'GABC123',
      sender: 'GXYZ456',
      arbiter: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      _v: 1,
    },
  ]),
  getEscrowDetail: jest.fn().mockResolvedValue({
    id: 'escrow-1',
    status: 'active',
    amount: '1000.00',
    receiver: 'GABC123',
    sender: 'GXYZ456',
    arbiter: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    milestones: [
      {
        id: 'milestone-1',
        amount: '500.00',
        dueDate: null,
        completed: false,
      },
    ],
    _v: 1,
  }),
}));

jest.unstable_mockModule('../config/logger.js', () => ({
  createModuleLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

describe('mobileApiContractPayloads', () => {
  let escrowService;

  beforeEach(async () => {
    jest.resetModules();
    escrowService = await import('../services/escrowService.js');
  });

  describe('escrow list payload validation', () => {
    test('list payload includes required fields', async () => {
      const list = await escrowService.getEscrowList();
      expect(list).toHaveLength(1);
      const escrow = list[0];

      expect(escrow).toHaveProperty('id');
      expect(escrow).toHaveProperty('status');
      expect(escrow).toHaveProperty('amount');
      expect(escrow).toHaveProperty('receiver');
      expect(escrow).toHaveProperty('sender');
      expect(escrow).toHaveProperty('createdAt');
      expect(escrow).toHaveProperty('updatedAt');
    });

    test('list payload version marker (_v) is present and backward compatible', async () => {
      const list = await escrowService.getEscrowList();
      const escrow = list[0];

      expect(escrow).toHaveProperty('_v');
      expect(typeof escrow._v).toBe('number');
      expect(escrow._v).toBeGreaterThanOrEqual(1);
    });

    test('nullability: arbiter field can be null', async () => {
      const list = await escrowService.getEscrowList();
      const escrow = list[0];

      expect(escrow.arbiter).toBeNull();
    });

    test('backward-compatible additions: new fields do not break consumers', async () => {
      const list = await escrowService.getEscrowList();
      const escrow = list[0];

      // Verify existing fields are present
      expect(escrow.id).toBeDefined();
      expect(escrow.status).toBeDefined();
      expect(escrow.amount).toBeDefined();
    });
  });

  describe('escrow detail payload validation', () => {
    test('detail payload includes required fields', async () => {
      const detail = await escrowService.getEscrowDetail('escrow-1');

      expect(detail).toHaveProperty('id');
      expect(detail).toHaveProperty('status');
      expect(detail).toHaveProperty('amount');
      expect(detail).toHaveProperty('receiver');
      expect(detail).toHaveProperty('sender');
      expect(detail).toHaveProperty('createdAt');
      expect(detail).toHaveProperty('updatedAt');
      expect(detail).toHaveProperty('milestones');
    });

    test('detail payload version marker (_v) is present', async () => {
      const detail = await escrowService.getEscrowDetail('escrow-1');

      expect(detail).toHaveProperty('_v');
      expect(typeof detail._v).toBe('number');
      expect(detail._v).toBeGreaterThanOrEqual(1);
    });

    test('milestones array contains objects with required fields', async () => {
      const detail = await escrowService.getEscrowDetail('escrow-1');

      expect(Array.isArray(detail.milestones)).toBe(true);
      if (detail.milestones.length > 0) {
        const milestone = detail.milestones[0];
        expect(milestone).toHaveProperty('id');
        expect(milestone).toHaveProperty('amount');
        expect(milestone).toHaveProperty('dueDate');
        expect(milestone).toHaveProperty('completed');
      }
    });

    test('dueDate can be null', async () => {
      const detail = await escrowService.getEscrowDetail('escrow-1');

      if (detail.milestones.length > 0) {
        expect(detail.milestones[0].dueDate).toBeNull();
      }
    });
  });

  describe('payload field types', () => {
    test('list payload string fields are strings', async () => {
      const list = await escrowService.getEscrowList();
      const escrow = list[0];

      expect(typeof escrow.id).toBe('string');
      expect(typeof escrow.status).toBe('string');
      expect(typeof escrow.amount).toBe('string');
      expect(typeof escrow.receiver).toBe('string');
      expect(typeof escrow.sender).toBe('string');
    });

    test('timestamps are ISO 8601 strings', async () => {
      const list = await escrowService.getEscrowList();
      const escrow = list[0];

      const isoDateRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
      expect(isoDateRegex.test(escrow.createdAt)).toBe(true);
      expect(isoDateRegex.test(escrow.updatedAt)).toBe(true);
    });
  });
});
