# Admin Bulk Escrow Actions: Safety Guide

How to use the admin bulk escrow status endpoint safely: who can call it, which transitions it allows, how to preview a change, what gets audited, how to verify the result, and what can and cannot be rolled back.

This guide describes the current implementation: `bulkUpdateEscrowStatus` in `backend/api/controllers/adminController.js`, the transition table in `backend/lib/escrowTransitions.js`, and the route in `backend/api/routes/adminRoutes.js`.

## Contents

- [When to use it](#when-to-use-it)
- [Current capabilities and gaps](#current-capabilities-and-gaps)
- [Permissions](#permissions)
- [Request and response](#request-and-response)
- [Allowed and blocked transitions](#allowed-and-blocked-transitions)
- [Safe operating procedure](#safe-operating-procedure)
- [Post-action verification](#post-action-verification)
- [Audit log](#audit-log)
- [Rollback strategy](#rollback-strategy)
- [Examples](#examples)

## When to use it

Escrow status is normally **event-sourced from the blockchain**: the indexer (`backend/workers/escrowIndexer.js`) sets `Active`, `Disputed`, `Completed`, and `Cancelled` from contract events. The bulk endpoint changes the **database copy only**. It does not call the contract and does not move funds.

Use it to correct the off-chain view, for example:

- reconciling escrows whose indexer events were missed or failed;
- closing out escrows after an incident where on-chain state is known and the database lags behind.

Do **not** use it to "resolve" a dispute or "cancel" an escrow for a user. That must happen on-chain; a database-only change makes the API disagree with the contract, and the next indexed event may overwrite it.

## Current capabilities and gaps

| Capability                               | Status                                                                                          |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Bulk status update, up to 50 escrows     | Available.                                                                                      |
| Transition validation per escrow         | Available (see the table below).                                                                |
| Per-escrow isolation and partial success | Available. Each escrow is its own transaction.                                                  |
| Audit log entry per successful update    | Available (`BULK_ESCROW_STATUS_UPDATE`).                                                        |
| **Preview / dry-run mode**               | **Not implemented.** Use the manual preview step in the [procedure](#safe-operating-procedure). |
| **Previous status in the audit log**     | **Not recorded.** Capture a snapshot before running, or rollback is guesswork.                  |
| **Admin identity in the audit log**      | **Not recorded.** `performedBy` is always `"admin"`. Put your name and ticket in `reason`.      |
| **Undo endpoint**                        | **Not implemented.** See [Rollback strategy](#rollback-strategy).                               |

## Permissions

The route is `PATCH /api/admin/escrows/bulk-status` and requires both:

1. **Admin authentication** (`adminAuth`, applied to every admin route): an admin session token (`Authorization: Bearer <token>` from `POST /api/admin/auth/login`), or the `x-admin-api-key` header for bootstrap.
2. **MFA** (`requireMfa`): an MFA-verified session. Without it the request is rejected before any escrow is read.

The update is scoped to the caller's tenant: escrows in other tenants are reported as `Escrow not found`.

Only operators on the on-call or support rota should hold admin credentials. Never script this endpoint with a long-lived admin key in CI.

## Request and response

```
PATCH /api/admin/escrows/bulk-status
Content-Type: application/json

{
  "escrow_ids": ["101", "102", "103"],
  "status": "Cancelled",
  "reason": "INC-2026-0412 reconcile: cancelled on-chain, indexer missed esc_can (jane.doe)"
}
```

| Field        | Type       | Rules                                                                                                    |
| ------------ | ---------- | -------------------------------------------------------------------------------------------------------- |
| `escrow_ids` | `string[]` | Required array. At most **50** ids. Each must parse as an integer (`BigInt`). An empty array is a no-op. |
| `status`     | `string`   | One of `Active`, `Completed`, `Disputed`, `Cancelled`.                                                   |
| `reason`     | `string`   | Optional, defaults to `""`. Treat it as **required** in practice (see [Audit log](#audit-log)).          |

Response (`200`, including partial success):

```json
{
  "updated": 2,
  "failed": [{ "escrow_id": "103", "reason": "Invalid transition: Completed -> Cancelled" }]
}
```

Request-level errors (`400`), where nothing is updated:

| Error                                                           | Cause                              |
| --------------------------------------------------------------- | ---------------------------------- |
| `escrow_ids must be an array`                                   | `escrow_ids` missing or wrong type |
| `A maximum of 50 escrow_ids are allowed per request`            | More than 50 ids                   |
| `status must be one of: Active, Completed, Disputed, Cancelled` | Unknown target status              |

Per-escrow failure reasons (in `failed[]`), where other escrows in the batch are still updated:

| `reason`                     | Meaning                                             |
| ---------------------------- | --------------------------------------------------- |
| `Invalid escrow id`          | The id does not parse as an integer.                |
| `Escrow not found`           | No such escrow in this tenant.                      |
| `Invalid transition: X -> Y` | Blocked by the transition table.                    |
| any other message            | Database error for that escrow; it was not changed. |

## Allowed and blocked transitions

<!-- drift:escrow-transitions:start -->

| From        | Allowed targets                      |
| ----------- | ------------------------------------ |
| `Active`    | `Completed`, `Disputed`, `Cancelled` |
| `Disputed`  | `Completed`, `Cancelled`             |
| `Completed` | none (terminal)                      |
| `Cancelled` | none (terminal)                      |

<!-- drift:escrow-transitions:end -->

Everything not listed is blocked, including:

- re-opening a terminal escrow (`Completed -> Active`, `Cancelled -> Active`);
- moving between terminal states (`Completed -> Cancelled`);
- clearing a dispute back to active (`Disputed -> Active`);
- "no-op" transitions to the same status (`Active -> Active`).

This table is checked against `backend/lib/escrowTransitions.js` by `backend/tests/adminBulkDocs.test.js`.

## Safe operating procedure

Because there is no dry-run mode, follow these steps every time.

1. **Open a ticket** describing the incident, the escrow ids, the target status, and the on-chain evidence that justifies it.
2. **Confirm on-chain state** for every escrow (contract read or explorer). The target status must match the contract. If it does not, stop: fix it on-chain, not in the database.
3. **Snapshot the current state (manual preview).** Save the current status of every id. This is both your preview and your rollback record:

   ```sql
   -- Save the output to the ticket before running the update
   SELECT id, status, updated_at
   FROM escrows
   WHERE id IN (101, 102, 103)
   ORDER BY id;
   ```

4. **Predict the result.** Check every row against the [transition table](#allowed-and-blocked-transitions). Remove ids that will fail, or accept that they will be reported in `failed[]`. Nothing should surprise you in the response.
5. **Start small.** Run the first batch with 1 to 5 ids, verify, then continue in batches of up to 50.
6. **Write a useful `reason`**: ticket id, short justification, and your name. It is the only place your identity is recorded.
7. **Run the update** and save the full JSON response to the ticket.
8. **Verify** (next section) before running the next batch.

## Post-action verification

After each batch:

1. **Counts add up.** `updated + failed.length` equals the number of ids sent. Investigate every `failed` entry; do not blindly retry.
2. **Database matches the target.**

   ```sql
   SELECT id, status FROM escrows WHERE id IN (101, 102, 103) ORDER BY id;
   ```

3. **API reflects the change.** The endpoint invalidates the `escrows` cache prefix when at least one escrow changed, so `GET /api/escrows/:id` should show the new status immediately. If it does not, check the cache layer.
4. **Audit entries exist**, one per updated escrow (see below).
5. **On-chain agreement.** Spot-check that the new status still matches the contract, and watch the indexer for the next few minutes: a later on-chain event for the same escrow will overwrite a manual change.

## Audit log

Each **successful** update writes one `admin_audit_logs` row inside the same transaction as the status change:

| Column           | Value                       |
| ---------------- | --------------------------- |
| `action`         | `BULK_ESCROW_STATUS_UPDATE` |
| `target_address` | the escrow id, as a string  |
| `reason`         | the request's `reason`      |
| `performed_by`   | always `"admin"`            |
| `performed_at`   | time of the update          |

Failed escrows write no audit row. The row **does not** record the previous or new status, so keep the step-3 snapshot and the response with the ticket.

Read the log:

```bash
curl -sS "https://api.example.com/api/admin/audit-logs?page=1&limit=50" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  | jq '.data[] | select(.action == "BULK_ESCROW_STATUS_UPDATE")'
```

The audit-log endpoint caches each page for 15 seconds, so a just-written entry can take that long to appear. For a specific escrow, query the table directly:

```sql
SELECT performed_at, reason
FROM admin_audit_logs
WHERE action = 'BULK_ESCROW_STATUS_UPDATE' AND target_address = '101'
ORDER BY performed_at DESC;
```

## Rollback strategy

There is no undo. What you can recover depends on the transition you made:

| Change made                         | Can the endpoint reverse it? | How to recover                                                                                                                   |
| ----------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `Active -> Disputed`                | Partly                       | `Disputed -> Active` is blocked. Move on to the correct terminal status if known; otherwise restore via database change (below). |
| `Active -> Completed / Cancelled`   | No                           | Terminal states cannot be left through the API. Restore via database change.                                                     |
| `Disputed -> Completed / Cancelled` | No                           | Restore via database change.                                                                                                     |

**Database restore (last resort).** Requires production database access, a second reviewer, and the step-3 snapshot:

```sql
BEGIN;

-- Restore each escrow to the status recorded in the snapshot
UPDATE escrows SET status = 'Active',   updated_at = now() WHERE id = 101 AND status = 'Cancelled';
UPDATE escrows SET status = 'Disputed', updated_at = now() WHERE id = 102 AND status = 'Cancelled';

-- Record the rollback in the audit trail
INSERT INTO admin_audit_logs (tenant_id, action, target_address, reason, performed_by, performed_at)
VALUES
  ('default', 'BULK_ESCROW_STATUS_ROLLBACK', '101', 'Rollback of INC-2026-0412 batch 1 (jane.doe, reviewed by john.roe)', 'admin', now()),
  ('default', 'BULK_ESCROW_STATUS_ROLLBACK', '102', 'Rollback of INC-2026-0412 batch 1 (jane.doe, reviewed by john.roe)', 'admin', now());

-- Check row counts before committing
COMMIT;
```

- Include the current status in each `WHERE` clause so a row that changed since the bulk action (for example through the indexer) is not overwritten.
- Use the escrow's real `tenant_id`.
- After committing, clear the API cache for escrows (restart or invalidate the `escrows` prefix) and repeat [post-action verification](#post-action-verification).
- Remember the contract is the source of truth: if the on-chain state is terminal, restoring the database to `Active` only makes it wrong in the other direction.

## Examples

**Reconcile three escrows cancelled on-chain:**

```bash
curl -sS -X PATCH https://api.example.com/api/admin/escrows/bulk-status \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
        "escrow_ids": ["101", "102", "104"],
        "status": "Cancelled",
        "reason": "INC-2026-0412: esc_can missed by indexer, verified on-chain (jane.doe)"
      }'
```

```json
{ "updated": 3, "failed": [] }
```

**Mixed batch with a blocked transition:**

```json
// Request: escrow 103 is already Completed
{ "escrow_ids": ["101", "103"], "status": "Cancelled", "reason": "..." }

// Response: 101 updated, 103 left unchanged
{ "updated": 1, "failed": [{ "escrow_id": "103", "reason": "Invalid transition: Completed -> Cancelled" }] }
```

**Oversized batch (rejected, nothing changed):**

```json
{ "error": "A maximum of 50 escrow_ids are allowed per request" }
```

Split into batches of 50 or fewer and verify each one before sending the next.
