# Adding a Contract Event: Developer Checklist

A new Soroban event is only useful once every layer understands it: the contract emits it, the schema documents it, the indexer stores it, the API exposes it, and the UI renders it. Missing any one of these makes the event silently invisible. This guide is the end-to-end checklist, in the order the work should be done.

Copy the [checklist](#the-checklist) into your PR description and tick each item.

## Contents

- [How events flow](#how-events-flow)
- [The checklist](#the-checklist)
- [1. Contract: constant and emitter](#1-contract-constant-and-emitter)
- [2. Contract: payload test](#2-contract-payload-test)
- [3. Docs: event schema](#3-docs-event-schema)
- [4. Backend: indexer](#4-backend-indexer)
- [5. Backend: indexer replay validation](#5-backend-indexer-replay-validation)
- [6. Backend: OpenAPI](#6-backend-openapi)
- [7. Frontend and mobile consumers](#7-frontend-and-mobile-consumers)
- [Changing or removing an event](#changing-or-removing-an-event)
- [Current gaps to be aware of](#current-gaps-to-be-aware-of)

## How events flow

```
contracts/escrow_contract/src/event_names.rs   topic constant (symbol_short!)
contracts/escrow_contract/src/events.rs        emit_* function publishes (topics, data)
        │  ledger
        ▼
Soroban RPC getEvents                          retained for a limited window only
        │
        ▼
backend/workers/escrowIndexer.js               dispatchEvent(topic) → handler → prisma
        │                                      contract_events row + domain tables
        ▼
backend API  (/api/events, /api/escrows/:id/events, domain endpoints)
        │
        ▼
frontend/ and mobile/                          timelines, status badges, notifications
```

Topics are `(symbol, u64 escrow_id)` for escrow-scoped events, so the indexer routes on `topic[0]` and reads the escrow id from `topic[1]`.

## The checklist

```markdown
- [ ] Topic constant added to `event_names.rs` (≤ 9 chars, `[a-zA-Z0-9_]`, unique)
- [ ] `emit_*` function added to `events.rs`, using the constant (no inline `symbol_short!`)
- [ ] Emitter called from every code path that performs the action
- [ ] Payload test in `event_tests.rs` asserts topic symbol, escrow id and every data field
- [ ] Negative test: the event is NOT emitted when the action fails or is rejected
- [ ] Row added to `docs/event-schema.md` (topic, topic tuple, data tuple, emitter, when)
- [ ] `backend/tests/contractEventDocs.test.js` passes
- [ ] Indexer: `dispatchEvent` case + handler using the idempotent `contractEvent.upsert`
- [ ] Indexer handler test covers the payload, a malformed payload, and a duplicate delivery
- [ ] Replay validated on testnet (cursor rewind, no duplicates, domain state correct)
- [ ] OpenAPI (`backend/api/docs/paths/*.js`) documents any new filter value or response field
- [ ] Frontend / mobile consumers render or deliberately ignore the new `eventType`
- [ ] CHANGELOG entry under `[Unreleased]`
```

## 1. Contract: constant and emitter

Add the topic to `contracts/escrow_contract/src/event_names.rs`, in the section for its domain:

```rust
// ── Milestones ────────────────────────────────────────────────────────────────
pub const MILESTONE_PAUSED: Symbol = symbol_short!("mil_pause");
```

Rules:

- `symbol_short!` accepts at most **9 characters** from `[a-zA-Z0-9_]`; longer strings fail to compile. Follow the existing `domain_verb` style (`mil_apr`, `dis_rai`).
- Grep for the string before choosing it. Two constants with the same symbol are indistinguishable to the indexer.
- Once shipped, a topic string is permanent: indexers and archived ledgers depend on it. Never rename a symbol; add a new one instead.

Add the emitter to `events.rs`, referencing the constant:

```rust
pub fn emit_milestone_paused(env: &Env, escrow_id: u64, milestone_id: u32, paused_by: &Address) {
    env.events()
        .publish((ev::MILESTONE_PAUSED, escrow_id), (milestone_id, paused_by.clone()));
}
```

- Keep the topic tuple `(symbol, escrow_id)` for escrow-scoped events so the indexer's routing works unchanged. Put everything else in the data tuple.
- Emit **after** the state change succeeds, never before a check that can still fail.
- Prefer a tuple of primitives and `Address` in the data; nested `contracttype` structs are harder to decode off-chain.

## 2. Contract: payload test

Add a test to `contracts/escrow_contract/src/event_tests.rs` using the existing helpers (`setup`, `contract_events`, `has_topic_symbol`):

```rust
#[test]
fn test_milestone_paused_event_payload() {
    let (env, _admin, contract_id, client) = setup();
    // ... create an escrow and a milestone, then pause it ...

    let events = contract_events(&env, &contract_id);
    let (_, topics, data) = events
        .iter()
        .find(|(_, t, _)| has_topic_symbol(&env, t, soroban_sdk::symbol_short!("mil_pause")))
        .expect("mil_pause event not emitted");

    // topic[1] is the escrow id; decode and check every data field
    // assert_eq!(u64::try_from_val(&env, &topics.get(1).unwrap()).unwrap(), escrow_id);
    // let (milestone_id, paused_by): (u32, Address) = <_>::try_from_val(&env, &data).unwrap();
}
```

Also assert the event is **absent** when the action is rejected (unauthorised caller, wrong state). Run:

```bash
cargo test -p stellar-trust-escrow-contract event_tests
```

## 3. Docs: event schema

Add a row to the right section of `docs/event-schema.md`:

| Event            | `symbol_short!` | Topic tuple               | Data tuple                              | Emitting function       | When emitted                        |
| ---------------- | --------------- | ------------------------- | --------------------------------------- | ----------------------- | ----------------------------------- |
| Milestone paused | `mil_pause`     | `(symbol, u64 escrow_id)` | `(u32 milestone_id, Address paused_by)` | `emit_milestone_paused` | A client pauses work on a milestone |

`backend/tests/contractEventDocs.test.js` fails if a constant in `event_names.rs` has no matching `` `symbol` `` entry in `docs/event-schema.md` (apart from a fixed allowlist of events that predate the test). Run it with:

```bash
npm run test -w backend -- contractEventDocs
```

## 4. Backend: indexer

In `backend/workers/escrowIndexer.js`:

1. Add a case to `dispatchEvent`:

   ```js
   case 'mil_pause':
     return handleMilestonePaused(event, escrowId);
   ```

   Topics without a case are logged (`[Indexer] Unknown event topic`) and **dropped**: nothing is written to `contract_events`. Until the case exists, the event is invisible to the whole backend.

2. Write the handler. Always record the raw event with the idempotent upsert keyed on `(tenantId, txHash, eventIndex)`, then update domain tables:

   ```js
   async function handleMilestonePaused(event, escrowId) {
     const [milestoneId, pausedBy] = event.value ?? [];
     if (!escrowId || milestoneId === undefined) return;
     await prisma.contractEvent.upsert({
       where: {
         tenantId_txHash_eventIndex: {
           tenantId: 'default',
           txHash: event.txHash,
           eventIndex: event.id ?? 0,
         },
       },
       create: {
         tenantId: 'default',
         ledger: BigInt(event.ledger),
         ledgerAt: new Date(event.ledgerClosedAt),
         contractId: CONTRACT_ID,
         eventType: 'mil_pause',
         escrowId,
         topics: event.topic,
         data: event.value,
         txHash: event.txHash,
         eventIndex: event.id ?? 0,
       },
       update: {},
     });
     // domain update, e.g. prisma.milestone.updateMany(...)
   }
   ```

   - `eventType` is stored as the **topic symbol** (`mil_pause`), not a friendly name.
   - Handlers must be idempotent: the same event can be delivered again after a retry or a replay. Use upserts and `updateMany` with the target state rather than increments.
   - Guard against malformed payloads (`event.value` of the wrong shape) by returning early instead of throwing, or the batch retries forever.

3. Test the handler with a mocked Prisma client (`backend/tests/escrowIndexer.edge.test.js` shows the pattern). Cover the happy path, a malformed payload, and a duplicate delivery.

## 5. Backend: indexer replay validation

A new handler only sees events indexed after it is deployed. Events emitted earlier were dropped (step 4) and must be replayed.

The indexer's position is the single row `indexer_state.last_processed_ledger` (`id = 1`). It only advances after a batch is written, and every handler upserts on `(tenantId, txHash, eventIndex)`, so replaying a range is safe.

On testnet (or a staging copy of production):

```bash
# 1. Record current state
psql "$DATABASE_URL" -c "SELECT last_processed_ledger FROM indexer_state WHERE id = 1;"
psql "$DATABASE_URL" -c "SELECT count(*) FROM contract_events WHERE event_type = 'mil_pause';"

# 2. Stop the indexer, rewind the cursor to just before the first ledger that emitted the event
psql "$DATABASE_URL" -c "UPDATE indexer_state SET last_processed_ledger = <first_ledger - 1> WHERE id = 1;"

# 3. Restart the indexer and let it catch up
# 4. Check: the new events exist exactly once, older event counts are unchanged
psql "$DATABASE_URL" -c "
  SELECT event_type, count(*), count(DISTINCT (tx_hash, event_index))
  FROM contract_events GROUP BY event_type ORDER BY event_type;"
```

Pass criteria: the new `event_type` appears, `count = count(DISTINCT …)` for every type (no duplicates), and the domain tables match what the contract state says.

Limits:

- Soroban RPC only keeps events for a limited window (about 7 days on public RPC providers by default). A replay cannot reach further back than the RPC's retention. For older history, use an archive RPC or a Horizon/Galexie data source, or accept that the history starts at deployment.
- `INDEXER_START_LEDGER` only applies when `indexer_state` has no row; it does not rewind an existing cursor.
- In multi-instance deployments the indexer holds a distributed lock; stop all instances before rewinding.

## 6. Backend: OpenAPI

Contract events are exposed through `GET /api/events` (documented in `backend/api/docs/paths/events.js`) and `GET /api/escrows/:id/events`.

- If clients filter by the new event, document the `eventType` value. Use the stored topic symbol (for example `mil_pause`).
- If the handler adds fields to a domain resource (escrow, milestone, dispute), update that resource's schema in the matching `paths/*.js` file.
- Check the rendered spec locally at `http://localhost:4000/api-docs` (also served at `/docs`).

## 7. Frontend and mobile consumers

- `frontend/app/escrow/[id]/page.jsx` reads `/api/escrows/:id/events` for the escrow timeline. Add a label and icon for the new `eventType`, or confirm the component falls back gracefully for unknown types.
- Search both apps for existing handling of related events and keep them consistent:

  ```bash
  grep -rn "mil_apr\|eventType" frontend/app frontend/components mobile/app mobile/components
  ```

- Clients must ignore event types they do not know, so older app versions keep working when a new event ships. Never switch exhaustively on `eventType` without a default branch.
- If the event should notify users, wire it into the notification worker (`backend/workers/notificationWorker.js`) and its templates.

## Changing or removing an event

- **Changing the data tuple** is a breaking change for every indexer and client. Emit a new event with a new topic, keep the old one until all consumers migrate, and document both.
- **Removing an event**: keep the constant (marked deprecated in a comment) and its `event-schema.md` row with a note, so historical ledgers can still be decoded.

## Current gaps to be aware of

These predate this guide and are tracked separately:

- `docs/event-schema.md` does not yet cover every constant in `event_names.rs`. The existing gaps are listed in the allowlist in `backend/tests/contractEventDocs.test.js`; remove entries from it as they get documented.
- `events.rs` still emits a few topics with inline `symbol_short!` (`gov_esc`, `partcnt`, `prt_can`, `ref_pay`) instead of constants from `event_names.rs`.
- The indexer's `dispatchEvent` handles only a small subset of topics (`esc_crt`, `mil_add`, `mil_sub`, `mil_apr`, `funds_rel`, `esc_can`, `dis_rai`, `dis_res`, `rep_upd`); everything else is dropped.
- The `eventType` example in `backend/api/docs/paths/events.js` is `escrow_created`, but stored values are topic symbols such as `esc_crt`.
- `backend/tests/escrowIndexer.test.js` is excluded in `backend/jest.config.js` (`testPathIgnorePatterns`); only `escrowIndexer.edge.test.js` runs.
