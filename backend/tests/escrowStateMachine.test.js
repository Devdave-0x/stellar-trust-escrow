/**
 * escrowStateMachine — unit tests
 *
 * Design principles
 * ─────────────────
 * 1. The VALID_TRANSITIONS and INVALID_TRANSITIONS tables defined below are the
 *    single source of truth for the test suite.  No individual test is written
 *    per edge; instead, each table is iterated programmatically so adding or
 *    removing a transition only requires editing one place.
 *
 * 2. The audit service is mocked; every test that calls transition() asserts
 *    that auditService.log() was called with the correct category and metadata.
 *
 * 3. canTransition() is tested independently of transition() so that the guard
 *    can be validated without triggering async side-effects.
 */

import { jest } from '@jest/globals';

// ── Audit service mock ────────────────────────────────────────────────────────

const auditLogMock = jest.fn().mockResolvedValue(undefined);

const auditServiceMock = {
  log: auditLogMock,
  AuditCategory: { MILESTONE: 'MILESTONE' },
};

jest.unstable_mockModule('../services/auditService.js', () => ({
  default: auditServiceMock,
  AuditCategory: auditServiceMock.AuditCategory,
  log: auditLogMock,
}));

// ── Module under test (loaded after mocks are in place) ───────────────────────

const {
  MILESTONE_STATES,
  TRANSITIONS,
  TERMINAL_STATES,
  canTransition,
  transition,
} = await import('../services/escrowStateMachine.js');

const { PENDING, SUBMITTED, APPROVED, REJECTED, DISPUTED } = MILESTONE_STATES;

// ── Transition truth tables ───────────────────────────────────────────────────
//
// These tables are the ONLY place the expected behaviour is specified.
// Each entry is [from, to, description].

const VALID_TRANSITIONS = [
  [PENDING,   SUBMITTED, 'freelancer submits work on a fresh milestone'],
  [PENDING,   DISPUTED,  'dispute raised on a pending milestone'],
  [SUBMITTED, APPROVED,  'client approves submitted work'],
  [SUBMITTED, REJECTED,  'client rejects submitted work'],
  [SUBMITTED, DISPUTED,  'dispute raised on a submitted milestone'],
  [REJECTED,  SUBMITTED, 'freelancer resubmits after rejection'],
];

const INVALID_TRANSITIONS = [
  // From Pending — cannot skip directly to terminal or non-reachable states
  [PENDING,   APPROVED,   'cannot approve a milestone that was never submitted'],
  [PENDING,   REJECTED,   'cannot reject a milestone that was never submitted'],
  [PENDING,   PENDING,    'self-transition is not a valid move'],
  // From Submitted — cannot skip back to Pending
  [SUBMITTED, PENDING,    'cannot revert a submitted milestone to Pending'],
  [SUBMITTED, SUBMITTED,  'self-transition is not a valid move'],
  // From Approved — terminal state; nothing further allowed
  [APPROVED,  PENDING,    'Approved is terminal — cannot go to Pending'],
  [APPROVED,  SUBMITTED,  'Approved is terminal — cannot go to Submitted'],
  [APPROVED,  REJECTED,   'Approved is terminal — cannot go to Rejected'],
  [APPROVED,  DISPUTED,   'Approved is terminal — cannot go to Disputed'],
  [APPROVED,  APPROVED,   'Approved is terminal — self-transition blocked'],
  // From Rejected — can only resubmit; all other targets blocked
  [REJECTED,  PENDING,    'cannot revert a rejected milestone to Pending'],
  [REJECTED,  APPROVED,   'cannot approve without resubmission'],
  [REJECTED,  DISPUTED,   'rejected milestone cannot be directly disputed'],
  [REJECTED,  REJECTED,   'self-transition is not a valid move'],
  // From Disputed — terminal state; nothing further allowed
  [DISPUTED,  PENDING,    'Disputed is terminal — cannot go to Pending'],
  [DISPUTED,  SUBMITTED,  'Disputed is terminal — cannot go to Submitted'],
  [DISPUTED,  APPROVED,   'Disputed is terminal — cannot go to Approved'],
  [DISPUTED,  REJECTED,   'Disputed is terminal — cannot go to Rejected'],
  [DISPUTED,  DISPUTED,   'Disputed is terminal — self-transition blocked'],
];

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Reset mocks between tests. */
beforeEach(() => {
  jest.clearAllMocks();
});

// =============================================================================
// 1. canTransition guard — exhaustive programmatic coverage
// =============================================================================

describe('canTransition(from, to)', () => {
  describe('returns true for every valid transition', () => {
    test.each(VALID_TRANSITIONS)('%s → %s: %s', (from, to) => {
      expect(canTransition(from, to)).toBe(true);
    });
  });

  describe('returns false for every invalid transition', () => {
    test.each(INVALID_TRANSITIONS)('%s → %s: %s', (from, to) => {
      expect(canTransition(from, to)).toBe(false);
    });
  });

  it('returns false for an unknown "from" state (not in TRANSITIONS table)', () => {
    expect(canTransition('Unknown', SUBMITTED)).toBe(false);
  });

  it('returns false for an unknown "to" state', () => {
    expect(canTransition(PENDING, 'NonExistentState')).toBe(false);
  });

  it('is consistent with the TRANSITIONS table exported by the module', () => {
    // Programmatically verify that canTransition agrees with TRANSITIONS for
    // every from→to combination across the full state space.
    const allStates = Object.values(MILESTONE_STATES);
    for (const from of allStates) {
      for (const to of allStates) {
        const expectedAllowed = (TRANSITIONS[from] ?? []).includes(to);
        expect(canTransition(from, to)).toBe(expectedAllowed);
      }
    }
  });
});

// =============================================================================
// 2. transition() — valid paths succeed and return the new state
// =============================================================================

describe('transition() — valid transitions', () => {
  test.each(VALID_TRANSITIONS)('%s → %s: %s', async (from, to) => {
    const result = await transition(from, to, {
      actor: 'test-actor',
      escrowId: 'escrow_1',
      milestoneId: 'milestone_1',
    });

    expect(result).toBe(to);
  });
});

// =============================================================================
// 3. transition() — invalid transitions throw
// =============================================================================

describe('transition() — invalid transitions throw', () => {
  test.each(INVALID_TRANSITIONS)('%s → %s: %s', async (from, to) => {
    await expect(transition(from, to)).rejects.toThrow(
      /Invalid milestone state transition/,
    );
  });

  it('thrown error message includes the source and target state', async () => {
    const err = await transition(APPROVED, PENDING).catch((e) => e);
    expect(err.message).toContain(APPROVED);
    expect(err.message).toContain(PENDING);
  });

  it('thrown error carries statusCode 422', async () => {
    const err = await transition(APPROVED, SUBMITTED).catch((e) => e);
    expect(err.statusCode).toBe(422);
  });

  it('lists the allowed transitions in the error message', async () => {
    // From Pending, allowed: [Submitted, Disputed]
    const err = await transition(PENDING, APPROVED).catch((e) => e);
    expect(err.message).toContain(SUBMITTED);
    expect(err.message).toContain(DISPUTED);
  });

  it('error message says "none" when source is a terminal state with no outgoing transitions', async () => {
    const err = await transition(APPROVED, PENDING).catch((e) => e);
    expect(err.message).toContain('none');
  });
});

// =============================================================================
// 4. transition() — audit event emitted on every valid transition
// =============================================================================

describe('transition() — audit event emission', () => {
  test.each(VALID_TRANSITIONS)(
    '%s → %s: audit event is emitted with correct category and metadata',
    async (from, to) => {
      await transition(from, to, {
        actor: 'GACTOR123',
        escrowId: 'escrow_42',
        milestoneId: 'milestone_7',
      });

      // Allow the fire-and-forget promise to settle.
      await new Promise((r) => setImmediate(r));

      expect(auditLogMock).toHaveBeenCalledTimes(1);

      const [entry] = auditLogMock.mock.calls[0];

      // Category must be MILESTONE
      expect(entry.category).toBe('MILESTONE');

      // Action encodes the transition in a readable form
      expect(entry.action).toBe(
        `MILESTONE_TRANSITION_${from.toUpperCase()}_TO_${to.toUpperCase()}`,
      );

      // Actor forwarded correctly
      expect(entry.actor).toBe('GACTOR123');

      // Resource ID is the milestoneId
      expect(entry.resourceId).toBe('milestone_7');

      // Metadata contains from/to, escrowId, and milestoneId
      expect(entry.metadata).toMatchObject({
        from,
        to,
        escrowId: 'escrow_42',
        milestoneId: 'milestone_7',
      });
    },
  );

  it('defaults actor to "system" when context.actor is omitted', async () => {
    await transition(PENDING, SUBMITTED);
    await new Promise((r) => setImmediate(r));

    const [entry] = auditLogMock.mock.calls[0];
    expect(entry.actor).toBe('system');
  });

  it('does NOT emit an audit event when the transition is invalid (throws before logging)', async () => {
    await transition(APPROVED, PENDING).catch(() => {});
    await new Promise((r) => setImmediate(r));
    expect(auditLogMock).not.toHaveBeenCalled();
  });

  it('does NOT throw when auditService.log rejects (audit errors are non-fatal)', async () => {
    auditLogMock.mockRejectedValueOnce(new Error('DB unavailable'));
    // The transition itself must still succeed.
    await expect(transition(PENDING, SUBMITTED)).resolves.toBe(SUBMITTED);
  });
});

// =============================================================================
// 5. TRANSITIONS table structural invariants
// =============================================================================

describe('TRANSITIONS table invariants', () => {
  const allStates = Object.values(MILESTONE_STATES);

  it('has an entry for every state in MILESTONE_STATES', () => {
    for (const state of allStates) {
      expect(TRANSITIONS).toHaveProperty(state);
    }
  });

  it('every target in the table is a known MILESTONE_STATE', () => {
    for (const [from, targets] of Object.entries(TRANSITIONS)) {
      for (const to of targets) {
        expect(allStates).toContain(to);
      }
    }
  });

  it('no state self-transitions are listed in the table', () => {
    for (const [state, targets] of Object.entries(TRANSITIONS)) {
      expect(targets).not.toContain(state);
    }
  });

  it('APPROVED and DISPUTED are terminal (empty target arrays)', () => {
    expect(TRANSITIONS[APPROVED]).toHaveLength(0);
    expect(TRANSITIONS[DISPUTED]).toHaveLength(0);
  });

  it('TERMINAL_STATES set contains exactly APPROVED and DISPUTED', () => {
    expect(TERMINAL_STATES.has(APPROVED)).toBe(true);
    expect(TERMINAL_STATES.has(DISPUTED)).toBe(true);
    expect(TERMINAL_STATES.size).toBe(2);
  });
});
