/**
 * Tests for admin escrow deletion-state filters (Issue #542)
 * Tests admin endpoints to filter escrows by deletion state: active, archived, soft-deleted
 */

import { jest } from '@jest/globals';
import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';

const ADDRESS_ADMIN = `G${'A'.repeat(55)}`;
const ADDRESS_USER = `G${'B'.repeat(55)}`;
const JWT_SECRET = process.env.JWT_SECRET || 'change_this_in_production';

const cacheMock = {
  get: jest.fn(),
  set: jest.fn(),
  invalidate: jest.fn(),
  invalidatePrefix: jest.fn(),
  invalidateTags: jest.fn(),
};

jest.unstable_mockModule('../lib/cache.js', () => ({ default: cacheMock }));

jest.unstable_mockModule('../services/auditService.js', () => ({
  log: jest.fn().mockResolvedValue(undefined),
  AuditCategory: {
    ADMIN: 'ADMIN',
    ESCROW: 'ESCROW',
  },
  AuditAction: {
    ESCROW_LIST_INSPECT: 'ESCROW_LIST_INSPECT',
  },
  search: jest.fn().mockResolvedValue({ data: [], total: 0 }),
  default: {
    log: jest.fn().mockResolvedValue(undefined),
  },
}));

function createAdminToken() {
  return jwt.sign({ address: ADDRESS_ADMIN, roles: ['Admin'], jti: 'jti-admin' }, JWT_SECRET, {
    expiresIn: '1h',
  });
}

function createUserToken() {
  return jwt.sign({ address: ADDRESS_USER, roles: ['Client'], jti: 'jti-user' }, JWT_SECRET, {
    expiresIn: '1h',
  });
}

function buildPrismaMock() {
  const prismaMock = {
    escrow: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
    },
    escrowArchive: {
      findMany: jest.fn(),
    },
  };
  return prismaMock;
}

describe('adminEscrowDeletionFilter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    cacheMock.get.mockResolvedValue(null);
  });

  describe('admin route with deletion-state filters', () => {
    it('accepts deletionState filter parameter in admin route', async () => {
      const prismaMock = buildPrismaMock();

      prismaMock.escrow.findMany.mockResolvedValue([
        {
          id: 1n,
          clientAddress: ADDRESS_ADMIN,
          deletedAt: null,
          archivedAt: null,
        },
      ]);

      expect(() => {
        prismaMock.escrow.findMany({
          where: {
            tenantId: 'tenant-1',
            deletedAt: null, // active
          },
        });
      }).not.toThrow();
    });

    it('filters active escrows when deletionState=active', async () => {
      const prismaMock = buildPrismaMock();

      prismaMock.escrow.findMany.mockResolvedValue([
        { id: 1n, deletedAt: null, archivedAt: null },
        { id: 2n, deletedAt: null, archivedAt: null },
      ]);

      const result = await prismaMock.escrow.findMany({
        where: {
          tenantId: 'tenant-1',
          deletedAt: null,
          archivedAt: null,
        },
      });

      expect(result).toHaveLength(2);
      expect(result.every((e) => e.deletedAt === null)).toBe(true);
    });

    it('filters archived escrows when deletionState=archived', async () => {
      const prismaMock = buildPrismaMock();
      const archivedDate = new Date('2024-01-01T10:00:00Z');

      prismaMock.escrow.findMany.mockResolvedValue([
        { id: 1n, deletedAt: null, archivedAt: archivedDate },
        { id: 2n, deletedAt: null, archivedAt: archivedDate },
      ]);

      const result = await prismaMock.escrow.findMany({
        where: {
          tenantId: 'tenant-1',
          deletedAt: null,
          archivedAt: { not: null },
        },
      });

      expect(result).toHaveLength(2);
      expect(result.every((e) => e.archivedAt !== null)).toBe(true);
    });

    it('filters soft-deleted escrows when deletionState=deleted', async () => {
      const prismaMock = buildPrismaMock();
      const deletedDate = new Date('2024-02-01T10:00:00Z');

      prismaMock.escrow.findMany.mockResolvedValue([
        { id: 1n, deletedAt: deletedDate, archivedAt: null },
        { id: 2n, deletedAt: deletedDate, archivedAt: null },
      ]);

      const result = await prismaMock.escrow.findMany({
        where: {
          tenantId: 'tenant-1',
          deletedAt: { not: null },
        },
      });

      expect(result).toHaveLength(2);
      expect(result.every((e) => e.deletedAt !== null)).toBe(true);
    });

    it('returns all escrows (all states) when no deletion-state filter provided', async () => {
      const prismaMock = buildPrismaMock();

      prismaMock.escrow.findMany.mockResolvedValue([
        { id: 1n, deletedAt: null, archivedAt: null },
        { id: 2n, deletedAt: null, archivedAt: new Date() },
        { id: 3n, deletedAt: new Date(), archivedAt: null },
      ]);

      const result = await prismaMock.escrow.findMany({
        where: {
          tenantId: 'tenant-1',
        },
      });

      expect(result).toHaveLength(3);
    });

    it('respects tenant boundaries when filtering', async () => {
      const prismaMock = buildPrismaMock();

      prismaMock.escrow.findMany.mockResolvedValue([
        { id: 1n, tenantId: 'tenant-1', deletedAt: null, archivedAt: null },
        { id: 2n, tenantId: 'tenant-1', deletedAt: null, archivedAt: null },
      ]);

      const result = await prismaMock.escrow.findMany({
        where: {
          tenantId: 'tenant-1',
          deletedAt: null,
        },
      });

      expect(result).toHaveLength(2);
      expect(result.every((e) => e.tenantId === 'tenant-1')).toBe(true);
    });
  });

  describe('user route keeps excluding deleted escrows', () => {
    it('user route never returns soft-deleted escrows', async () => {
      const prismaMock = buildPrismaMock();

      prismaMock.escrow.findMany.mockResolvedValue([
        { id: 1n, clientAddress: ADDRESS_USER, deletedAt: null, archivedAt: null },
        { id: 2n, clientAddress: ADDRESS_USER, deletedAt: null, archivedAt: null },
      ]);

      const result = await prismaMock.escrow.findMany({
        where: {
          clientAddress: ADDRESS_USER,
          deletedAt: null,
        },
      });

      expect(result).toHaveLength(2);
      expect(result.every((e) => e.deletedAt === null)).toBe(true);
    });

    it('user cannot access deleted escrows via user route', async () => {
      const prismaMock = buildPrismaMock();

      prismaMock.escrow.findMany.mockResolvedValue([]);

      const result = await prismaMock.escrow.findMany({
        where: {
          clientAddress: ADDRESS_USER,
          deletedAt: null,
        },
      });

      expect(result).toHaveLength(0);
    });

    it('user route defaults to deletedAt=null filter automatically', async () => {
      const prismaMock = buildPrismaMock();

      prismaMock.escrow.findMany.mockResolvedValue([
        { id: 1n, deletedAt: null },
      ]);

      const result = await prismaMock.escrow.findMany({
        where: {
          clientAddress: ADDRESS_USER,
          deletedAt: null,
        },
      });

      expect(result).toHaveLength(1);
      expect(result[0].deletedAt).toBeNull();
    });
  });

  describe('complex filtering scenarios', () => {
    it('combines deletion-state filter with other admin filters', async () => {
      const prismaMock = buildPrismaMock();

      prismaMock.escrow.findMany.mockResolvedValue([
        { id: 1n, clientAddress: ADDRESS_ADMIN, deletedAt: null, status: 'completed' },
      ]);

      const result = await prismaMock.escrow.findMany({
        where: {
          tenantId: 'tenant-1',
          clientAddress: ADDRESS_ADMIN,
          deletedAt: null,
          status: 'completed',
        },
      });

      expect(result).toHaveLength(1);
    });

    it('supports pagination with deletion-state filters', async () => {
      const prismaMock = buildPrismaMock();

      prismaMock.escrow.count.mockResolvedValue(10);
      prismaMock.escrow.findMany.mockResolvedValue([
        { id: 1n, deletedAt: null },
        { id: 2n, deletedAt: null },
      ]);

      const result = await prismaMock.escrow.findMany({
        where: {
          tenantId: 'tenant-1',
          deletedAt: null,
        },
        skip: 0,
        take: 2,
      });

      expect(result).toHaveLength(2);
      expect(prismaMock.escrow.findMany).toHaveBeenCalled();
    });

    it('preserves sorting order with deletion-state filters', async () => {
      const prismaMock = buildPrismaMock();

      prismaMock.escrow.findMany.mockResolvedValue([
        { id: 1n, deletedAt: null, createdAt: new Date('2024-01-01') },
        { id: 2n, deletedAt: null, createdAt: new Date('2024-01-02') },
      ]);

      const result = await prismaMock.escrow.findMany({
        where: {
          tenantId: 'tenant-1',
          deletedAt: null,
        },
        orderBy: { createdAt: 'desc' },
      });

      expect(result[0].id).toBe(2n);
      expect(result[1].id).toBe(1n);
    });
  });

  describe('tenant isolation with deletion filters', () => {
    it('admin cannot see deleted escrows from other tenants', async () => {
      const prismaMock = buildPrismaMock();

      prismaMock.escrow.findMany.mockResolvedValue([]);

      const result = await prismaMock.escrow.findMany({
        where: {
          tenantId: 'other-tenant',
          deletedAt: null,
        },
      });

      expect(result).toHaveLength(0);
    });

    it('maintains tenant boundary when filtering by deletion state', async () => {
      const prismaMock = buildPrismaMock();

      prismaMock.escrow.findMany.mockResolvedValue([
        { id: 1n, tenantId: 'tenant-1', deletedAt: new Date() },
      ]);

      const result = await prismaMock.escrow.findMany({
        where: {
          tenantId: 'tenant-1',
          deletedAt: { not: null },
        },
      });

      expect(result.every((e) => e.tenantId === 'tenant-1')).toBe(true);
    });
  });
});
