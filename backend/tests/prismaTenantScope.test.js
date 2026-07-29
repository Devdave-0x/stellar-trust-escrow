import { describe, expect, it, jest } from '@jest/globals';

import { applyTenantScope, mergeTenantWhere } from '../lib/prisma.js';
import { runWithTenantContext, withTenantScopeBypassed } from '../lib/tenantContext.js';

const TENANT = { id: 'tenant_1', slug: 'acme' };
const OTHER_TENANT = { id: 'tenant_2', slug: 'globex' };

function fakeQuery() {
  return jest.fn(async (args) => ({ receivedArgs: args }));
}

describe('mergeTenantWhere', () => {
  it('returns the where clause unchanged when there is no tenant', () => {
    expect(mergeTenantWhere({ id: 1 }, null)).toEqual({ id: 1 });
  });

  it('builds a bare tenant filter when where is empty', () => {
    expect(mergeTenantWhere(undefined, 'tenant_1')).toEqual({ tenantId: 'tenant_1' });
    expect(mergeTenantWhere({}, 'tenant_1')).toEqual({ tenantId: 'tenant_1' });
  });

  it('leaves the where clause untouched if it already scopes the same tenant', () => {
    const where = { tenantId: 'tenant_1', status: 'Active' };
    expect(mergeTenantWhere(where, 'tenant_1')).toBe(where);
  });

  it('keeps a unique identifying field at the top level required by Prisma for update/delete/findUnique', () => {
    const result = mergeTenantWhere({ id: 42 }, 'tenant_1');
    expect(result).toEqual({ id: 42, AND: [{ tenantId: 'tenant_1' }] });
    // `id` must remain a direct sibling key, not nested only inside AND, or Prisma's
    // extended-where-unique validation rejects the query as non-unique.
    expect(result.id).toBe(42);
  });

  it('folds an existing AND object into the merged AND array', () => {
    const result = mergeTenantWhere({ id: 42, AND: { status: 'Active' } }, 'tenant_1');
    expect(result).toEqual({ id: 42, AND: [{ status: 'Active' }, { tenantId: 'tenant_1' }] });
  });

  it('folds an existing AND array into the merged AND array', () => {
    const result = mergeTenantWhere(
      { id: 42, AND: [{ status: 'Active' }, { archived: false }] },
      'tenant_1',
    );
    expect(result).toEqual({
      id: 42,
      AND: [{ status: 'Active' }, { archived: false }, { tenantId: 'tenant_1' }],
    });
  });
});

describe('applyTenantScope', () => {
  it('passes the query through unchanged outside any tenant context', async () => {
    const query = fakeQuery();
    await applyTenantScope({ model: 'Escrow', operation: 'findMany', args: { where: {} }, query });
    expect(query).toHaveBeenCalledWith({ where: {} });
  });

  it('does not scope models outside the tenant-scoped allowlist', async () => {
    const query = fakeQuery();
    await runWithTenantContext(TENANT, async () => {
      await applyTenantScope({
        model: 'Tenant',
        operation: 'findMany',
        args: { where: { slug: 'acme' } },
        query,
      });
    });
    expect(query).toHaveBeenCalledWith({ where: { slug: 'acme' } });
  });

  it('respects an explicit tenant-scope bypass', async () => {
    const query = fakeQuery();
    await runWithTenantContext(TENANT, async () => {
      await withTenantScopeBypassed(async () => {
        await applyTenantScope({
          model: 'Escrow',
          operation: 'findMany',
          args: { where: {} },
          query,
        });
      });
    });
    expect(query).toHaveBeenCalledWith({ where: {} });
  });

  it('scopes findMany to the current tenant', async () => {
    const query = fakeQuery();
    await runWithTenantContext(TENANT, async () => {
      await applyTenantScope({
        model: 'Escrow',
        operation: 'findMany',
        args: { where: { status: 'Active' } },
        query,
      });
    });
    expect(query).toHaveBeenCalledWith({
      where: { status: 'Active', AND: [{ tenantId: 'tenant_1' }] },
    });
  });

  it('scopes findUnique while keeping the unique id at the top level', async () => {
    const query = fakeQuery();
    await runWithTenantContext(TENANT, async () => {
      await applyTenantScope({
        model: 'Escrow',
        operation: 'findUnique',
        args: { where: { id: 42n } },
        query,
      });
    });
    expect(query).toHaveBeenCalledWith({ where: { id: 42n, AND: [{ tenantId: 'tenant_1' }] } });
  });

  it('scopes update by a unique id — closing the cross-tenant write hole', async () => {
    const query = fakeQuery();
    await runWithTenantContext(TENANT, async () => {
      await applyTenantScope({
        model: 'Escrow',
        operation: 'update',
        args: { where: { id: 42n }, data: { status: 'Completed' } },
        query,
      });
    });
    expect(query).toHaveBeenCalledWith({
      where: { id: 42n, AND: [{ tenantId: 'tenant_1' }] },
      data: { status: 'Completed' },
    });
  });

  it('scopes delete by a unique id — closing the cross-tenant delete hole', async () => {
    const query = fakeQuery();
    await runWithTenantContext(TENANT, async () => {
      await applyTenantScope({
        model: 'Dispute',
        operation: 'delete',
        args: { where: { id: 7n } },
        query,
      });
    });
    expect(query).toHaveBeenCalledWith({ where: { id: 7n, AND: [{ tenantId: 'tenant_1' }] } });
  });

  it('never lets one tenant address another tenant record by id', async () => {
    const query = jest.fn(async (args) => args);

    const scopedArgs = await runWithTenantContext(OTHER_TENANT, () =>
      applyTenantScope({
        model: 'Escrow',
        operation: 'update',
        args: { where: { id: 42n }, data: { status: 'Completed' } },
        query,
      }),
    );

    // Simulate the mocked DB: the record with id 42 actually belongs to TENANT.
    const matchesTenantOnlyRecord = (where, record) =>
      Object.entries(where).every(([key, value]) => {
        if (key === 'AND') return value.every((clause) => matchesTenantOnlyRecord(clause, record));
        return record[key] === value;
      });

    const record = { id: 42n, tenantId: TENANT.id };
    expect(matchesTenantOnlyRecord(scopedArgs.where, record)).toBe(false);
  });

  it('scopes upsert on both the lookup where and the create payload', async () => {
    const query = fakeQuery();
    await runWithTenantContext(TENANT, async () => {
      await applyTenantScope({
        model: 'ReputationRecord',
        operation: 'upsert',
        args: {
          where: { address: '0xabc' },
          create: { address: '0xabc', totalScore: 0 },
          update: { totalScore: 10 },
        },
        query,
      });
    });
    expect(query).toHaveBeenCalledWith({
      where: { address: '0xabc', AND: [{ tenantId: 'tenant_1' }] },
      create: { address: '0xabc', totalScore: 0, tenantId: 'tenant_1' },
      update: { totalScore: 10 },
    });
  });

  it('stamps tenantId on create', async () => {
    const query = fakeQuery();
    await runWithTenantContext(TENANT, async () => {
      await applyTenantScope({
        model: 'Escrow',
        operation: 'create',
        args: { data: { status: 'Active' } },
        query,
      });
    });
    expect(query).toHaveBeenCalledWith({ data: { status: 'Active', tenantId: 'tenant_1' } });
  });

  it('does not override an explicitly provided tenantId on create', async () => {
    const query = fakeQuery();
    await runWithTenantContext(TENANT, async () => {
      await applyTenantScope({
        model: 'Escrow',
        operation: 'create',
        args: { data: { status: 'Active', tenantId: 'explicit_tenant' } },
        query,
      });
    });
    expect(query).toHaveBeenCalledWith({
      data: { status: 'Active', tenantId: 'explicit_tenant' },
    });
  });

  it('stamps tenantId on every entry of createMany', async () => {
    const query = fakeQuery();
    await runWithTenantContext(TENANT, async () => {
      await applyTenantScope({
        model: 'Escrow',
        operation: 'createMany',
        args: { data: [{ status: 'Active' }, { status: 'Pending' }] },
        query,
      });
    });
    expect(query).toHaveBeenCalledWith({
      data: [
        { status: 'Active', tenantId: 'tenant_1' },
        { status: 'Pending', tenantId: 'tenant_1' },
      ],
    });
  });
});
