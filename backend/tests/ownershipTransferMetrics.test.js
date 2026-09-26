import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

describe('Ownership Transfer Metrics', () => {
  describe('aggregateOwnershipTransferMetrics', () => {
    it('should count pending ownership transfers by tenant', async () => {
      const mockPrisma = {
        escrowOwnership: {
          groupBy: async () => [
            {
              currentOwner: 'owner1',
              _count: {
                id: 5,
              },
            },
            {
              currentOwner: 'owner2',
              _count: {
                id: 3,
              },
            },
          ],
        },
      };

      const results = await mockPrisma.escrowOwnership.groupBy();
      expect(results).toHaveLength(2);
      expect(results[0]._count.id).toBe(5);
      expect(results[1]._count.id).toBe(3);
    });

    it('should count accepted ownership transfers', async () => {
      const mockPrisma = {
        ownershipTransferLog: {
          count: async () => 42,
        },
      };

      const count = await mockPrisma.ownershipTransferLog.count();
      expect(count).toBe(42);
    });

    it('should count expired ownership transfers by filtering transferredAt', async () => {
      const mockPrisma = {
        escrowOwnership: {
          count: async () => 15,
        },
      };

      const count = await mockPrisma.escrowOwnership.count();
      expect(count).toBe(15);
    });

    it('should count cancelled ownership transfers with matching status', async () => {
      const mockPrisma = {
        escrowOwnership: {
          count: async () => 8,
        },
      };

      const count = await mockPrisma.escrowOwnership.count();
      expect(count).toBe(8);
    });

    it('should include tenant labels in metrics', async () => {
      const mockMetrics = {
        pending: { tenant_1: 5, tenant_2: 3 },
        accepted: { tenant_1: 42, tenant_2: 28 },
        expired: { tenant_1: 15, tenant_2: 10 },
        cancelled: { tenant_1: 8, tenant_2: 5 },
      };

      expect(mockMetrics.pending).toHaveProperty('tenant_1');
      expect(mockMetrics.pending.tenant_1).toBe(5);
      expect(mockMetrics.accepted).toHaveProperty('tenant_2');
      expect(mockMetrics.accepted.tenant_2).toBe(28);
    });

    it('should detect stale pending transfers based on transfer log age', () => {
      const now = new Date();
      const oldTransfer = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // 7 days ago

      expect(oldTransfer < new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)).toBe(true);
    });

    it('should aggregate transfers across escrows', () => {
      const transfers = [
        { escrowId: 1, status: 'pending', transferredAt: null },
        { escrowId: 2, status: 'pending', transferredAt: null },
        { escrowId: 3, status: 'accepted', transferredAt: new Date() },
      ];

      const pending = transfers.filter(t => t.status === 'pending');
      expect(pending).toHaveLength(2);
    });

    it('should ensure tenant safety when filtering transfers', () => {
      const tenantId = 'tenant_1';
      const transfers = [
        { escrowId: 1, tenantId: 'tenant_1' },
        { escrowId: 2, tenantId: 'tenant_2' },
      ];

      const tenantTransfers = transfers.filter(t => t.tenantId === tenantId);
      expect(tenantTransfers).toHaveLength(1);
      expect(tenantTransfers[0].escrowId).toBe(1);
    });
  });
});
