# Escrow Indexer Guide

The indexer is a background service that polls Stellar for Soroban contract events
and writes them to PostgreSQL. This keeps the REST API fast without hitting the
blockchain on every request.

---

## Why an Indexer?

Soroban contracts don't store easily queryable lists. You can read individual records
by key, but you can't ask "give me all escrows for address X" efficiently on-chain.
The indexer solves this by listening to events and maintaining a relational DB mirror.

```
Stellar Network          Indexer Service         PostgreSQL
     │                        │                      │
     │ ← poll events ─────────┤                      │
     │                        │                      │
     │ ─ EscrowCreated ──────►│                      │
     │ ─ MilestoneAdded ─────►│ ─ INSERT escrow ────►│
     │ ─ MilestoneApproved ──►│ ─ UPDATE milestone ─►│
     │ ─ ReputationUpdated ──►│ ─ UPSERT reputation ►│
     │                        │                      │
```

---

## Architecture

### Polling Loop (`startIndexer`)

```
startIndexer()
    │
    ├─► Load lastProcessedLedger from DB (indexer_state table)
    │
    └─► setInterval(every 5s):
            │
            ├─► fetchAndProcessEvents(server)
            │       │
            │       ├─► server.getEvents({ startLedger, contractIds: [CONTRACT_ADDRESS] })
            │       │
            │       └─► for each event:
            │               │
            │               └─► dispatchEvent(event)
            │                       │
            │                       ├─► parse topic[0] → event name
            │                       │
            │                       └─► call handler (handleEscrowCreated, etc.)
            │
            └─► update lastProcessedLedger in DB
```

### Event Parsing

Each Soroban event has:

- `topics`: array of ScVal — `[event_name_symbol, primary_id, ...]`
- `data`: ScVal — the event payload

```javascript
// Example: EscrowCreated event
// topic[0]: symbol "esc_crt"
// topic[1]: u64 escrow_id
// data:     tuple (client_address, freelancer_address, amount)

const eventName = scValToNative(event.topic[0]); // → "esc_crt"
const escrowId = scValToNative(event.topic[1]); // → 42n
const [client, freelancer, amount] = scValToNative(event.data);
```

### Event → DB Mapping

| Event Symbol | Handler                    | DB Action                                              |
| ------------ | -------------------------- | ------------------------------------------------------ |
| `esc_crt`    | `handleEscrowCreated`      | `escrow.create()`                                      |
| `mil_add`    | `handleMilestoneAdded`     | `milestone.create()`                                   |
| `mil_sub`    | `handleMilestoneSubmitted` | `milestone.update(status: Submitted)`                  |
| `mil_apr`    | `handleMilestoneApproved`  | `milestone.update(status: Approved)`                   |
| `funds_rel`  | `handleFundsReleased`      | `escrow.update(remaining_balance)`                     |
| `esc_can`    | `handleEscrowCancelled`    | `escrow.update(status: Cancelled)`                     |
| `dis_rai`    | `handleDisputeRaised`      | `escrow.update(status: Disputed)`, `dispute.create()`  |
| `dis_res`    | `handleDisputeResolved`    | `escrow.update(status: Completed)`, `dispute.update()` |
| `rep_upd`    | `handleReputationUpdated`  | `reputationRecord.upsert()`                            |

---

## Running the Indexer

The indexer starts automatically when the backend server starts (once implemented).
To test it in isolation:

```bash
cd backend
node -e "require('./services/escrowIndexer').startIndexer()"
```

---

## Implementing a New Event Handler

1. **Define the event** in `contracts/escrow_contract/src/events.rs`
2. **Add the topic symbol** to the `TOPICS` map in `escrowIndexer.js`
3. **Add a case** in `dispatchEvent`:
   ```javascript
   case 'my_event': return handleMyEvent(event);
   ```
4. **Implement the handler**:
   ```javascript
   const handleMyEvent = async (event) => {
     const id = scValToNative(event.topic[1]);
     const data = scValToNative(event.data);
     await prisma.someTable.update({ where: { id }, data: { ... } });
   };
   ```
5. **Export the handler** from `escrowIndexer.js` for unit testing
6. **Write a test** that mocks the event and verifies the DB update

---

## Error Handling

The indexer should never crash on a single bad event. Each handler should:

```javascript
const handleMyEvent = async (event) => {
  try {
    // ... process event
  } catch (err) {
    console.error('[Indexer] handleMyEvent failed:', err.message, event);
    // TODO: send to error tracking (Sentry, etc.) — see Issue #44
    // Do NOT re-throw — let the indexer continue
  }
};
```

---

## Resume After Restart

The `indexer_state` table stores the last processed ledger:

```sql
SELECT * FROM indexer_state;
-- id | last_processed_ledger
-- 1  | 7234891
```

On startup, the indexer reads this and resumes from there. If the table is empty,
it starts from `INDEXER_START_LEDGER` in `.env`.

---

## Open Issues

| Issue | Task                                                                                       |
| ----- | ------------------------------------------------------------------------------------------ |
| #27   | Implement `startIndexer`, `fetchAndProcessEvents`, `dispatchEvent`, and all event handlers |
| #43   | Implement `stellarService.getContractEvents`                                               |
| #42   | This documentation file (you're reading it!)                                               |

## Runbook: indexer lag recovery and cursor reset

### 1. Diagnose

| Symptom | Classification |
| --- | --- |
| Indexed ledger trails network tip but is advancing; projections consistent | **Transient lag** |
| Cursor stuck or advancing while rows are missing, duplicated, or contradict on-chain state | **Corrupted projection** |

Compare the stored cursor with the latest ledger from Horizon/RPC, and spot-check
a few escrows against contract state.

### 2. Transient lag (non-destructive)

- Check RPC health, rate limits, and DB latency; scale or switch RPC endpoint.
- Let the indexer catch up from its current cursor. **Do not reset the cursor.**

### 3. Corrupted projection (destructive)

1. **Pause** the indexer (scale to zero / stop the worker) so no writes race the reset.
2. **Back up first — mandatory.** Take a database snapshot (`pg_dump`) of the
   projection tables and the cursor row, and verify the backup is restorable.
   Never proceed with a reset without a verified backup.
3. **Reset** the cursor to the last ledger known to be consistent (or the
   contract deployment ledger) and truncate/delete projection rows after it.
4. **Replay** from the reset cursor; handlers must be idempotent.
5. **Resume** normal operation, then re-verify spot-checked escrows and lag metrics.
   If verification fails, restore from the backup and escalate.
