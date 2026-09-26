# Governance Event Indexing Reference

Reference for every event emitted by `contracts/governance`, for backend
indexers and admin dashboards. It complements `event-schema.md` (escrow and
extension events) and `governance-guide.md` (contract usage).

Decoding works the same way as described in
[`event-schema.md` → How to decode Soroban events](./event-schema.md#how-to-decode-soroban-events):
topic 0 is a `Symbol` identifying the event, topic 1 (when present) is the
primary id, and `data` is a single value or a tuple.

Sources: `contracts/governance/src/events.rs`, `lib.rs`, `arbitrators.rs`,
`incentives.rs`.

---

## 1. Proposal lifecycle overview

```
create_proposal ──► prop_new
      │
cast_vote (×N) ──► vote_cast
      │
finalize_proposal ──► prop_que  (Queued, quorum + threshold met)
      │           └─► prop_def  (Defeated)
      │           └─► dep_ref | dep_slh   (fee deposit, if any)
      │
execute_proposal (after executable_at) ──► prop_exe

cancel_proposal (any status except Executed/Cancelled) ──► prop_can
```

| Status after event | Event      |
| ------------------ | ---------- |
| `Active`           | `prop_new` |
| `Queued`           | `prop_que` |
| `Defeated`         | `prop_def` |
| `Executed`         | `prop_exe` |
| `Cancelled`        | `prop_can` |

`vote_cast`, `dep_ref` and `dep_slh` do not change status.

---

## 2. Proposal events

| Event       | Emitted by          | Topics                        | Data                                  |
| ----------- | ------------------- | ----------------------------- | ------------------------------------- |
| `prop_new`  | `create_proposal`   | `(prop_new, proposal_id: u64)` | `proposer: Address`                   |
| `prop_que`  | `finalize_proposal` | `(prop_que, proposal_id: u64)` | `executable_at: u64`                  |
| `prop_def`  | `finalize_proposal` | `(prop_def, proposal_id: u64)` | `()`                                  |
| `prop_exe`  | `execute_proposal`  | `(prop_exe, proposal_id: u64)` | `()`                                  |
| `prop_can`  | `cancel_proposal`   | `(prop_can, proposal_id: u64)` | `cancelled_by: Address`               |

### 2.1 Creation (`prop_new`)

Only the proposer is in the event. Title, description, type, payload,
`vote_start`, `vote_end`, `executable_at` and `total_supply_snapshot` are not
emitted; indexers must call `get_proposal(proposal_id)` after seeing
`prop_new` and store the result.

### 2.2 Timelock (`prop_que`)

`executable_at` is a ledger timestamp (`vote_end + timelock_delay`).
Dashboards should show the proposal as "Queued — executable after
`executable_at`". `execute_proposal` before that time fails with
`TimelockNotElapsed`, so there is no event to index for failed attempts.

### 2.3 Execution (`prop_exe`)

Emitted after the payload is applied and status set to `Executed`
(`executed_at` stored on the proposal). What execution did depends on the
payload, which the indexer already has from `get_proposal`:

| Payload     | On-chain effect                                         | Indexer action                                             |
| ----------- | ------------------------------------------------------- | ---------------------------------------------------------- |
| `Fund`      | Token transfer to `recipient` of `amount`               | Record treasury outflow                                    |
| `Parameter` | Validated only; not applied on-chain                    | Off-chain systems apply the parameter change from the payload |
| `Upgrade`   | None; target contract admin must call `upgrade()`       | Flag "upgrade approved" with the wasm hash                 |
| `Text`      | None                                                    | Signal only                                                |

### 2.4 Cancellation (`prop_can`)

`cancelled_by` is either the proposer or the admin. Allowed from `Active`,
`Queued` or `Defeated`. When a fee deposit exists it is refunded to the
proposer **without** a `dep_ref` event; indexers must treat `prop_can` as
releasing any recorded deposit.

---

## 3. Voting events

| Event       | Emitted by  | Topics                          | Data                                            |
| ----------- | ----------- | ------------------------------- | ----------------------------------------------- |
| `vote_cast` | `cast_vote` | `(vote_cast, proposal_id: u64)` | `(voter: Address, support: bool, power: i128)`  |

- `power` is the voter's voting power at the time of the vote.
- One vote per voter per proposal; a second vote fails (`AlreadyVoted`).
- Running tallies: sum `power` into `votes_for` when `support = true`,
  `votes_against` otherwise. These must match `get_proposal` after each vote;
  a mismatch means missed events.

---

## 4. Fee deposit events

Emitted by `finalize_proposal` only when a deposit exists for the proposal.

| Event     | Topics                         | Data                                 | Meaning                                     |
| --------- | ------------------------------ | ------------------------------------ | ------------------------------------------- |
| `dep_ref` | `(dep_ref, proposal_id: u64)`  | `(proposer: Address, amount: i128)`  | Participation ≥ 15% of supply snapshot; deposit returned |
| `dep_slh` | `(dep_slh, proposal_id: u64)`  | `(treasury: Address, amount: i128)`  | Participation below 15%; deposit sent to treasury (admin if unset) |

---

## 5. Other governance contract events

Not part of the proposal lifecycle, but emitted by the same contract and
should be indexed or explicitly ignored.

| Event      | Emitted by                   | Topics                          | Data                                         |
| ---------- | ---------------------------- | ------------------------------- | -------------------------------------------- |
| `arb_stk`  | `stake_arbitrator`           | `(arb_stk, arbitrator)`         | `(amount: i128, new_stake: i128)`            |
| `arb_wdr`  | `withdraw_stake`             | `(arb_wdr, arbitrator)`         | `stake: i128`                                |
| `arb_slh`  | `slash_arbitrator`           | `(arb_slh, arbitrator)`         | `(slash_amount: i128, remaining: i128, reason)` |
| `ve_lock`  | `create_lock`                | `(ve_lock, owner)`              | `(amount: i128, unlock_time: u64)`           |
| `ve_ext`   | `extend_lock`                | `(ve_ext, owner)`               | `(amount: i128, unlock_time: u64)`           |
| `ve_wdr`   | `withdraw_lock`              | `(ve_wdr, owner)`               | `amount: i128`                               |
| `lk_bonus` | `extend_lock_bonus`          | `(lk_bonus, staker)`            | `(bonus_tokens, multiplier, extension_duration)` |
| `arb_add`  | `registry_add_arbitrator`    | `(arb_add, arbitrator)`         | `()`                                         |
| `arb_rem`  | `registry_remove_arbitrator` | `(arb_rem, arbitrator)`         | `()`                                         |
| `arb_sel`  | `select_dispute_panel`       | `(arb_sel, dispute_id: u64)`    | `()`                                         |
| `arb_acc`  | `accept_arbitration`         | `(arb_acc, dispute_id: u64)`    | `arbitrator: Address`                        |
| `arb_rot`  | `rotate_timed_out_slot`      | `(arb_rot, dispute_id: u64)`    | `(outgoing: Address, new_arbitrator)`        |

`jury_new`, `jury_vot`, `jury_res` and `jury_pay` are defined in `events.rs`
but not emitted by any entrypoint yet. Indexers may register decoders for
them but must not expect them.

Admin calls `update_config` and `set_treasury` emit **no** event. Dashboards
that show config must read `get_config()` directly.

---

## 6. Versioning

Governance events carry no explicit version field. The topic symbol and the
data shape together are the contract with indexers.

Rules for contract changes:

1. **Additive only for existing topics.** Do not reorder, remove or change the
   type of tuple fields for an existing topic.
2. **Breaking change → new topic.** Emit under a new symbol (e.g. `prop_new2`,
   still ≤ 9 characters for `symbol_short!`) and keep emitting the old one for
   at least one release so indexers can migrate.
3. **Document first.** Every new or changed event is added to this file in the
   same PR as the contract change.
4. **Contract upgrades.** After a governance contract upgrade, indexers must
   record the upgrade ledger and use it to choose decoders for historical vs.
   new events.

Rules for indexers:

- Ignore unknown topic symbols (log at debug level), never fail the batch.
- Decode with `scValToNative()` and validate tuple length; a length mismatch is
  a schema change and must raise an alert instead of writing partial data.
- Store the raw event XDR alongside decoded rows so data can be re-decoded
  after a schema change.
- Process events in ledger + event index order; lifecycle transitions
  (section 1) are only valid in that order.
