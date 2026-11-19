# Milestone State Machine

This document describes the valid states and transitions for a `Milestone`
in `stellar-trust-escrow`, which function drives each transition, and the
authorization required.

Source: `contracts/escrow_contract/src/types.rs` — `MilestoneStatus`
Functions: `contracts/escrow_contract/src/lib.rs`

---

## Table of Contents

1. [MilestoneStatus Variants](#milestonestatus-variants)
2. [State Transition Diagram](#state-transition-diagram)
3. [Transition Reference Table](#transition-reference-table)
4. [Function Details](#function-details)
5. [Cancellation Guard](#cancellation-guard)
6. [Terminal States](#terminal-states)

---

## MilestoneStatus Variants

```rust
pub enum MilestoneStatus {
    Pending,    // 0 — initial state
    Submitted,  // 1 — freelancer submitted work
    Approved,   // 2 — client approved; funds pending release
    Rejected,   // 3 — client rejected; freelancer may resubmit
    Disputed,   // 4 — dispute raised; funds frozen
}
```

| Variant     | Description                                                                                                                                  |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `Pending`   | Milestone created but no work submitted yet. This is the initial state for every milestone added via `add_milestone`.                        |
| `Submitted` | Freelancer has called `submit_milestone`. The client can now approve or reject.                                                              |
| `Approved`  | Client has called `approve_milestone`. Funds have been transferred to the freelancer.                                                        |
| `Rejected`  | Client has called `reject_milestone`. The freelancer may resubmit by calling `submit_milestone` again.                                       |
| `Disputed`  | A dispute was raised (via `raise_dispute`) while the milestone was `Pending` or `Submitted`. Funds are frozen until the dispute is resolved. |

---

## State Transition Diagram

```
                    add_milestone
                         |
                         v
                    +---------+
                    | Pending |<-----------+
                    +---------+            |
                         |                |
          submit_milestone|                | reject_milestone
          (freelancer)    |                | (client)
                         v                |
                   +-----------+          |
                   | Submitted |----------+
                   +-----------+
                    |         |
     approve_       |         | reject_
     milestone      |         | milestone
     (client)       |         | (client)
                    v         v
              +----------+ +----------+
              | Approved | | Rejected |
              +----------+ +----------+
                    |
              release_funds
              (admin / auto)
                    |
                    v
               [Released]
                 (funds
                transferred)


  raise_dispute (client or freelancer) can be called on:
    Pending  --> Disputed
    Submitted --> Disputed

                    +-----------+
                    | Disputed  |
                    +-----------+
                          |
               resolve_dispute
               (arbiter / admin)
                          |
                    (escrow resolved;
                     milestone stays
                     Disputed in storage)
```

Note: `Approved` and `Disputed` are effectively terminal for the
milestone itself — no further status changes occur after those states.
`Rejected` is not terminal; the freelancer can resubmit.

---

## Transition Reference Table

This table is the reviewable source of truth for every public mutation that
changes a milestone's status. It is kept in sync with the transition-matrix
test in `contracts/escrow_contract/src/test.rs`
(`test_milestone_transition_matrix`), which asserts each allowed transition
succeeds and each disallowed transition returns `InvalidMilestoneState` (14).

| From        | To          | Function                              | Caller role          | Effects                                                                 |
| ----------- | ----------- | ------------------------------------- | -------------------- | ----------------------------------------------------------------------- |
| _(none)_    | `Pending`   | `add_milestone`                       | Client               | Creates milestone, `status = Pending`, sequential id, escrow must be `Active` |
| `Pending`   | `Submitted` | `submit_milestone`                    | Freelancer           | Sets `submitted_at`, emits `mil_sub`                                     |
| `Rejected`  | `Submitted` | `submit_milestone`                    | Freelancer           | Sets `submitted_at`, emits `mil_sub`                                     |
| `Submitted` | `Approved`  | `approve_milestone`                   | Client               | Transfers `amount` to freelancer, sets `resolved_at`, increments `approved_count`, may set escrow `Completed`, emits `mil_apr` + `funds_rel` |
| `Submitted` | `Rejected`  | `reject_milestone`                    | Client               | Sets `resolved_at`, emits `mil_rej`; freelancer may resubmit             |
| `Pending`   | `Disputed`  | `raise_dispute` (with `milestone_id`) | Client or Freelancer | Sets milestone `Disputed`, sets escrow `Disputed`, funds frozen          |
| `Submitted` | `Disputed`  | `raise_dispute` (with `milestone_id`) | Client or Freelancer | Sets milestone `Disputed`, sets escrow `Disputed`, funds frozen          |

`Approved` and `Disputed` have no outgoing transitions — they are
terminal states for the milestone record. `resolve_dispute` resolves the
escrow but leaves disputed milestones `Disputed` in storage.

### Disallowed transitions

Any `submit_milestone`, `approve_milestone`, or `reject_milestone` call
from a state not listed above returns `InvalidMilestoneState` (14).
`raise_dispute` with a `milestone_id` whose milestone is `Approved`,
`Rejected`, or already `Disputed` leaves the milestone status unchanged
(the escrow-level status is still set to `Disputed`).

---

## Function Details

### add_milestone → Pending

```rust
pub fn add_milestone(
    env: Env,
    caller: Address,      // must be escrow client
    escrow_id: u64,
    title: String,
    description_hash: BytesN<32>,
    amount: i128,
) -> Result<u32, EscrowError>
```

Creates a new `Milestone` with `status = Pending`. The milestone ID is
assigned sequentially starting from 0. The escrow must be `Active`.

---

### submit_milestone → Submitted

```rust
pub fn submit_milestone(
    env: Env,
    caller: Address,      // must be escrow freelancer
    escrow_id: u64,
    milestone_id: u32,
) -> Result<(), EscrowError>
```

Transitions `Pending` or `Rejected` → `Submitted`. Sets `submitted_at`
to the current ledger timestamp. Emits `mil_sub` event.

**Accepted from:** `Pending`, `Rejected`
**Rejected from:** any other state → `InvalidMilestoneState` (14)

---

### approve_milestone → Approved

```rust
pub fn approve_milestone(
    env: Env,
    caller: Address,      // must be escrow client
    escrow_id: u64,
    milestone_id: u32,
) -> Result<(), EscrowError>
```

Transitions `Submitted` → `Approved`. Transfers `milestone.amount` to
the freelancer. Sets `resolved_at`. Increments `approved_count` on
`EscrowMeta`. If `approved_count == milestone_count`, the escrow status
is set to `Completed`. Emits `mil_apr` and `funds_rel` events.

**Accepted from:** `Submitted` only
**Rejected from:** any other state → `InvalidMilestoneState` (14)

---

### reject_milestone → Rejected

```rust
pub fn reject_milestone(
    env: Env,
    caller: Address,      // must be escrow client
    escrow_id: u64,
    milestone_id: u32,
) -> Result<(), EscrowError>
```

Transitions `Submitted` → `Rejected`. Sets `resolved_at`. Emits
`mil_rej` event. The freelancer may call `submit_milestone` again.

**Accepted from:** `Submitted` only
**Rejected from:** any other state → `InvalidMilestoneState` (14)

---

### raise_dispute → Disputed

```rust
pub fn raise_dispute(
    env: Env,
    caller: Address,      // must be client or freelancer
    escrow_id: u64,
    milestone_id: Option<u32>,
) -> Result<(), EscrowError>
```

When `milestone_id` is provided and the milestone is `Pending` or
`Submitted`, its status is set to `Disputed`. The escrow-level status
is also set to `Disputed` regardless of whether a milestone ID is given.

**Accepted from:** `Pending`, `Submitted`
**No effect on:** `Approved`, `Rejected`, `Disputed` (milestone left unchanged)

---

### resolve_dispute — no milestone status change

`resolve_dispute` distributes the escrow's `remaining_balance` between
client and freelancer. It does not change individual milestone statuses —
disputed milestones remain `Disputed` in storage after resolution. The
escrow-level status is set to `Completed`.

---

## Cancellation Guard

`cancel_escrow` checks every milestone before allowing cancellation:

```rust
for mid in 0..meta.milestone_count {
    let m = ContractStorage::load_milestone(&env, escrow_id, mid)?;
    if m.status == MilestoneStatus::Submitted || m.status == MilestoneStatus::Approved {
        return Err(EscrowError::CannotCancelWithPendingFunds);
    }
}
```

Cancellation is **blocked** while any milestone is `Submitted` or
`Approved`. `Pending`, `Rejected`, and `Disputed` milestones do not block
cancellation.

---

## Terminal States

| State      | Terminal? | Reason                                                              |
| ---------- | --------- | ------------------------------------------------------------------- |
| `Pending`  | No        | Can move to `Submitted` or `Disputed`.                              |
| `Submitted`| No        | Can move to `Approved`, `Rejected`, or `Disputed`.                  |
| `Approved` | Yes       | Funds released; no further milestone transitions.                   |
| `Rejected` | No        | Freelancer may resubmit → `Submitted`.                              |
| `Disputed` | Yes       | Frozen; `resolve_dispute` resolves escrow but leaves status intact. |
