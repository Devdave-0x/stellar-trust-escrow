# Rent and Storage Reserve System

The Stellar ledger charges a per-entry storage fee to prevent unlimited state growth.
The `stellar-trust-escrow` contract implements an **application-level rent reserve
system** on top of this: the contract holds a token balance on behalf of each escrow
and periodically transfers it to the admin as a fee. When the balance runs out the
escrow expires and the client is refunded.

This document explains all constants, data fields, functions, and the full lifecycle
so that integrators can calculate the correct top-up amount and avoid unexpected
expiry.

---

## Table of Contents

1. [Why Rent Exists](#1-why-rent-exists)
2. [Constants](#2-constants)
3. [Relevant `EscrowMeta` Fields](#3-relevant-escrowmeta-fields)
4. [Active Storage Entries](#4-active-storage-entries)
5. [Rent Formulas](#5-rent-formulas)
6. [Function Reference](#6-function-reference)
7. [Full Lifecycle: `top_up_rent` → `collect_rent_due` → `expire_escrow`](#7-full-lifecycle)
8. [Worked Example: 3-Milestone Escrow for 30 Days](#8-worked-example)
9. [Settle-on-Access: Lazy Rent Collection](#9-settle-on-access)
10. [Expiry Consequences](#10-expiry-consequences)
11. [Integrator Checklist](#11-integrator-checklist)

---

## 1. Why Rent Exists

Each on-chain persistent storage entry (escrow meta, milestone, recurring config, etc.)
consumes ledger space indefinitely until removed. The rent system creates a financial
incentive for counterparties to close or top-up long-lived escrows rather than leaving
dormant state permanently on-chain.

The collected rent is transferred to the contract admin (platform treasury), providing
a sustainable revenue model for the protocol.

---

## 2. Constants

All constants are defined in `contracts/escrow_contract/src/lib.rs`.

| Constant | Value | Description |
|----------|-------|-------------|
| `RENT_PERIOD_SECONDS` | `86_400` | Length of one rent period: **24 hours** (1 day) in seconds. |
| `RENT_RESERVE_PERIODS` | `30` | Number of periods covered by the initial rent reserve charged at creation or when a new storage entry is added: **30 days**. |
| `RENT_PER_ENTRY_PER_PERIOD` | `1` | Token amount (in the escrow token's smallest unit, e.g. 1 stroop for XLM) charged per active storage entry per period. |

> **Note:** `RENT_PER_ENTRY_PER_PERIOD = 1` stroop is intentionally minimal in the
> current implementation. In a production deployment the admin can update this constant
> at the Rust level before deploying a new WASM version.

---

## 3. Relevant `EscrowMeta` Fields

Two fields on `EscrowMeta` track rent state:

### `rent_balance: i128`

Prepaid token amount (in the escrow token's smallest unit) currently held by the
contract on behalf of this escrow. Think of it as a credit that depletes over time.

- Increases when `top_up_rent` is called or when a new milestone/entry is added
  (via `charge_entry_rent`).
- Decreases during `collect_rent_due` by `rent_due_per_period × elapsed_periods`.
- When it reaches zero the escrow becomes eligible for expiry.

### `last_rent_collection_at: u64`

Unix timestamp (seconds) of the last successful rent collection checkpoint.

- Set to the escrow creation timestamp (`created_at`) when the escrow is first created.
- Advanced by `collect_rent_due` by exactly `covered_periods × RENT_PERIOD_SECONDS`
  after each collection, preventing double-charging within the same period.
- Used with the current ledger timestamp to compute `elapsed_periods`.

---

## 4. Active Storage Entries

The rent formula scales with the number of **active persistent storage entries**
associated with an escrow. More entries = more rent per period.

The `active_storage_entries` helper counts:

| Entry | Always Present | Count |
|-------|---------------|-------|
| `EscrowMeta` record itself | Yes | 1 |
| Each `Milestone` entry | Yes (one per milestone) | `milestone_count` |
| `RecurringPaymentConfig` entry | Only if recurring | 1 (optional) |
| `CancellationRequest` entry | Only if pending cancellation | 1 (optional) |
| `SlashRecord` entry | Only if a slash was recorded | 1 (optional) |

Formula:

```
active_entries = 1 + milestone_count
              + (1 if RecurringConfig exists)
              + (1 if CancellationRequest exists)
              + (1 if SlashRecord exists)
```

A freshly created escrow with 3 milestones and no optional entries has:

```
active_entries = 1 + 3 = 4
```

---

## 5. Rent Formulas

### Per-Period Rent

```
rent_due_per_period = active_entries × RENT_PER_ENTRY_PER_PERIOD
```

For the example above (4 entries):

```
rent_due_per_period = 4 × 1 = 4 stroops/day
```

### Reserve Required for N Periods

The initial reserve charged by `charge_entry_rent` when a new entry is created:

```
reserve = entries × RENT_PER_ENTRY_PER_PERIOD × RENT_RESERVE_PERIODS
```

Adding 1 milestone to an existing escrow charges:

```
reserve = 1 × 1 × 30 = 30 stroops
```

### Rent Due for a Time Window

```
elapsed_periods = floor((now - last_rent_collection_at) / RENT_PERIOD_SECONDS)
rent_due        = rent_due_per_period × elapsed_periods
collectable     = min(rent_due, rent_balance)
```

### Covered Periods (How Long Before Expiry)

```
covered_periods = floor(rent_balance / rent_due_per_period)
expires_at      = last_rent_collection_at + (covered_periods + 1) × RENT_PERIOD_SECONDS
```

### Rent Expiry Check

An escrow has expired when:

```
elapsed_periods > covered_periods
```

i.e. when more complete periods have elapsed since the last collection than the
remaining `rent_balance` can cover.

---

## 6. Function Reference

All functions are in `contracts/escrow_contract/src/lib.rs` under `impl ContractStorage`
(private helpers) or `impl EscrowContract` (public contract functions).

### `active_storage_entries(env, meta) → i128`

Counts the number of active persistent storage entries for an escrow.
Used by `rent_due_per_period`.

### `rent_due_per_period(env, meta) → i128`

Returns `active_entries × RENT_PER_ENTRY_PER_PERIOD`.

### `rent_has_expired(env, meta) → bool`

Returns `true` when `elapsed_periods > covered_periods`. Called from
`settle_rent_for_access` to gate every state-modifying access.

### `rent_expires_at(env, meta) → u64`

Returns the Unix timestamp after which the escrow will be considered expired:

```
last_rent_collection_at + (covered_periods + 1) × RENT_PERIOD_SECONDS
```

Use this to warn users before expiry.

### `charge_rent_reserve(env, token, payer, amount)` *(private)*

Transfers `amount` tokens from `payer` to the contract address.
Does nothing if `amount <= 0`.

### `charge_entry_rent(env, meta, payer, entries) → i128` *(private)*

Called when new storage entries are created (e.g. `add_milestone`).
Computes `reserve_for_entries(entries)` and charges `payer`, then
adds the amount to `meta.rent_balance`.

### `collect_rent_due(env, meta) → i128` *(private)*

Core rent collection logic:

1. Compute `time_since_last = now - last_rent_collection_at`.
2. If `elapsed_periods == 0`, return 0 (no rent owed yet).
3. Compute `due = rent_per_period × elapsed_periods`.
4. Clamp to `collectable = min(due, rent_balance)`.
5. Transfer `collectable` to the admin address.
6. Decrement `meta.rent_balance` by `collectable`.
7. Advance `meta.last_rent_collection_at` by `covered_periods × RENT_PERIOD_SECONDS`.
8. Emit a `rent_collected` event with `(collectable, remaining_balance, expires_at)`.

### `settle_rent_for_access(env, meta) → i128` *(private)*

Called by `load_escrow_meta_with_rent` on every read that precedes a state change.

1. Checks `rent_has_expired` — if true, returns `E8` (escrow not found / expired).
2. Calls `collect_rent_due` to charge any overdue rent.
3. Saves the updated `meta` to storage.

This is the **lazy collection** mechanism: rent is always settled just before any
operation touches an escrow, ensuring the rent ledger is up to date without requiring
a separate scheduled call.

### `collect_rent(env, meta) → i128` *(private)*

Similar to `settle_rent_for_access` but additionally triggers `expire_escrow` if
the balance is exhausted after collection. Used by the public `top_up_rent` path
to handle the edge case where rent is collected and the escrow immediately expires.

### `expire_escrow(env, meta)` *(private)*

Called when rent is exhausted:

1. Computes `refund_amount = remaining_balance + rent_balance`.
2. Transfers `refund_amount` back to `meta.client`.
3. Removes all milestone entries, recurring config, cancellation request, slash
   record, and the meta entry itself from persistent storage.
4. Emits a `rent_expired` event with `(refund_amount, remaining_balance)`.

After expiry the escrow ID is permanently gone — it cannot be reopened.

### `top_up_rent(caller, escrow_id, periods)` *(public)*

The public entrypoint for integrators to add more rent to an escrow.

```rust
// Pseudocode
let additional = rent_due_per_period(env, &meta) * i128::from(periods);
charge_rent_reserve(env, &meta.token, &caller, additional)?;
meta.rent_balance += additional;
save_escrow_meta(env, &meta);
```

Call this periodically (e.g. via a cron job) to keep long-running escrows alive.

---

## 7. Full Lifecycle

```
Client creates escrow
       │
       ▼
charge_entry_rent(payer=client, entries=1 + milestone_count)
  → rent_balance  = entries × RENT_PER_ENTRY_PER_PERIOD × RENT_RESERVE_PERIODS
  → last_rent_collection_at = created_at
       │
       ▼  (any state-changing call, e.g. submit_milestone)
load_escrow_meta_with_rent(escrow_id)
  → settle_rent_for_access(meta)
       │
       ├─ rent_has_expired? → YES → return E8 (escrow inaccessible)
       │
       └─ NO
           │
           ▼
       collect_rent_due(meta)
         → compute elapsed_periods
         → transfer collectable to admin
         → decrement rent_balance
         → advance last_rent_collection_at
           │
           ▼
       (operation continues normally)
           │
           ▼  (rent_balance approaches 0)
top_up_rent(caller, escrow_id, periods)
  → transfers additional tokens from caller
  → increases rent_balance
           │
           ▼  (rent_balance == 0 AND elapsed_periods > covered_periods)
rent_has_expired → true
  → expire_escrow(meta)
       → refund (remaining_balance + rent_balance) to client
       → remove all storage entries
       → emit rent_expired event
```

---

## 8. Worked Example: 3-Milestone Escrow for 30 Days

**Setup:**
- Token: XLM (1 XLM = 10 000 000 stroops)
- Milestones: 3
- Optional entries: none (no recurring config, no cancellation, no slash)

### Step 1 — Calculate active entries

```
active_entries = 1 (meta) + 3 (milestones) = 4
```

### Step 2 — Calculate initial rent reserve charged at creation

```
reserve = entries × RENT_PER_ENTRY_PER_PERIOD × RENT_RESERVE_PERIODS
        = 4 × 1 × 30
        = 120 stroops
```

The client is charged 120 stroops (0.0000120 XLM) at creation time as prepaid rent.
This covers 30 days.

### Step 3 — Daily rent burn rate

```
rent_due_per_period = 4 × 1 = 4 stroops/day
```

### Step 4 — How long does 120 stroops last?

```
covered_periods = floor(120 / 4) = 30 days
expires_at      = created_at + (30 + 1) × 86_400
                = created_at + 31 days
```

### Step 5 — Top-up to extend by another 30 days

```
additional = rent_due_per_period × 30 = 4 × 30 = 120 stroops
```

Call `top_up_rent(caller, escrow_id, 30)` to add 120 stroops.

### Step 6 — What if a 4th milestone is added?

Adding a new milestone increases `active_entries` to 5.

`charge_entry_rent` charges the caller for 1 new entry × 30 periods:

```
charge = 1 × 1 × 30 = 30 stroops
```

The new `rent_due_per_period` becomes:

```
rent_due_per_period = 5 × 1 = 5 stroops/day
```

The existing `rent_balance` (whatever remains) is now consumed faster.

### Summary Table

| Milestones | `active_entries` | Initial reserve | Daily burn | Days covered |
|------------|-----------------|-----------------|------------|--------------|
| 1 | 2 | 60 stroops | 2 stroops | 30 days |
| 3 | 4 | 120 stroops | 4 stroops | 30 days |
| 5 | 6 | 180 stroops | 6 stroops | 30 days |
| 20 (max) | 21 | 630 stroops | 21 stroops | 30 days |

The initial reserve always covers exactly `RENT_RESERVE_PERIODS` (30 days) because
`charge_entry_rent` uses `reserve_for_entries` which multiplies by `RENT_RESERVE_PERIODS`.

---

## 9. Settle-on-Access: Lazy Rent Collection

Rent is **not** collected on a timer. It is collected lazily: every time
`load_escrow_meta_with_rent` is called (which happens before every state-changing
operation), `settle_rent_for_access` runs `collect_rent_due`.

**Why this is safe against manipulation:**

Even if an adversary calls a read-only function thousands of times in the same
ledger, rent is only charged for **complete periods elapsed** since
`last_rent_collection_at`. Within the same second (same ledger timestamp),
`elapsed_periods = 0` and `collect_rent_due` returns 0. There is no way to
accelerate rent depletion beyond the normal schedule.

**Consequence for integrators:**

You do not need to call a separate "tick" or "update" function. However, you should
monitor `rent_expires_at` and call `top_up_rent` proactively. A good strategy is to
top up whenever `rent_balance < rent_due_per_period × RENT_RESERVE_PERIODS`.

---

## 10. Expiry Consequences

When `expire_escrow` is triggered:

1. **All funds returned to client:** `remaining_balance + rent_balance` is
   transferred back to `meta.client`. The freelancer receives nothing for
   incomplete milestones.
2. **All storage removed:** Every persistent storage entry for the escrow is
   deleted, freeing ledger space.
3. **Irreversible:** The escrow ID is permanently invalidated. There is no
   resurrection mechanism.
4. **Event emitted:** A `rent_expired` event is published with
   `(refund_amount, remaining_balance)` for off-chain indexers to detect.

> **Important:** Expiry can be triggered on the **first read** after the escrow's
> rent runs out, not just on explicit `top_up_rent` calls. Any user who tries to
> call `get_escrow`, `submit_milestone`, or any other function on an expired escrow
> will receive `E8` and the expiry path will execute.

---

## 11. Integrator Checklist

- [ ] **At creation:** Ensure the `client` has sufficient token balance to cover
  the initial rent reserve (`active_entries × RENT_PER_ENTRY_PER_PERIOD × RENT_RESERVE_PERIODS`
  stroops) on top of the escrow `total_amount`.
- [ ] **On milestone addition:** Inform the `client` that each new milestone adds
  30 stroops to their rent obligation at the time of the `add_milestone` call.
- [ ] **Monitor expiry:** Subscribe to `rent_expired` events from the Soroban
  event stream. When you receive one, update your off-chain database to mark the
  escrow as expired.
- [ ] **Proactive top-up:** Call `rent_expires_at(env, escrow_id)` periodically
  and top up if the result is within 7 days.
- [ ] **Display rent info:** Show `rent_balance`, `rent_due_per_period`, and
  `rent_expires_at` in your UI so users know how long their escrow will remain active.
- [ ] **High-value escrows:** For escrows that are expected to run for many months,
  top up at creation with a larger number of periods (e.g. `top_up_rent(..., 365)`)
  to avoid manual intervention.
