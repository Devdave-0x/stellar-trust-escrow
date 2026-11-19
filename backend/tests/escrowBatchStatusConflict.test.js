import { describe, expect, it } from '@jest/globals';
import { buildChainStatusConflictResponse } from '../api/controllers/escrowController.js';

describe('escrow batch status conflicts — issue 897', () => {
  it('returns a stable conflict envelope', () => {
    const body = buildChainStatusConflictResponse('Completed');
    expect(body.code).toBe('CHAIN_STATE_CONFLICT');
    expect(body.currentStatus).toBe('Completed');
  });
});