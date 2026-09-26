# Runbook: Audit Hash-Chain Verification Failure

What to do when an audit log hash chain fails verification. Covers triage,
evidence preservation, scope identification, communication and remediation.

---

## 1. The two audit chains

| Chain | Code | Table | Verification |
| --- | --- | --- | --- |
| Tenant audit log | `backend/services/auditVerifier.js` | `audit_logs` (per `tenant_id`) + `audit_chain_roots` | `runVerification()` recomputes each tenant's root hash and compares it with the stored `root_hash` / `entry_count` |
| Arbitrator actions | `backend/api/services/auditLogger.js` | Prisma model `arbitratorAuditLog` (`prevHash`, `hash` per row) | `validateChain()` walks every row and returns the first `prevHash_mismatch` or `hash_mismatch` |

How each chain is built:

- **Tenant chain:** `hash[n] = SHA-256(hash[n-1] ‖ id ‖ tenantId ‖ category ‖ action ‖ actor ‖ createdAt)`,
  starting from `STELLAR_TRUST_ESCROW_AUDIT_GENESIS`. The chain is only
  stored as a root per tenant, so a mismatch tells you **that** something
  changed, not **which** row.
- **Arbitrator chain:** each row stores `prevHash` and `hash` (over id,
  action, actor, resourceId, timestamp, metadata), so `validateChain()`
  points at the **first** broken row.

> Neither check runs automatically yet. `startVerificationWorker()` is not
> started by the server, and `validateChain()` is not exposed on any route.
> The `arbitratorAuditLog` model used by `auditLogger.js` is also not yet
> defined in `schema.prisma`, so the arbitrator-chain steps below apply once
> that model is migrated.
> Until they are wired in, run them manually (section 3.1) on a schedule and
> after any database restore or manual data fix.

---

## 2. Signals

| Signal | Source |
| --- | --- |
| Log line `CRITICAL: Audit chain violation detected — log tampering suspected` with `storedHash`, `computedHash`, `storedCount`, `computedCount` | `auditVerifier` |
| `audit:chain:violation` event on `auditEvents` | `auditVerifier` |
| Redis key `audit:lock:<tenantId>` = `1` (TTL `AUDIT_LOCK_TTL_SEC`, default 2 h) | `auditVerifier` |
| `validateChain()` returns `valid: false` with `firstViolation` | `auditLogger` |

Admin features for a locked tenant should be refused while
`isAdminLocked(tenantId)` is true. The lock is only set when Redis is
configured; without Redis, no lock is applied, so treat the log line as the
source of truth.

---

## 3. Triage (first 30 minutes)

Declare a **SEV-1** security incident until tampering is ruled out. Name an
incident lead and open an incident doc from `docs/incidents/templates/`.

### 3.1 Confirm the failure

Re-run verification from a backend shell against the **primary** database:

```bash
cd backend
node -e "import('./services/auditVerifier.js').then(m => m.runVerification())"
node -e "import('./api/services/auditLogger.js').then(async m => console.log(JSON.stringify(await m.validateChain(), null, 2)))"
```

- Failure reproduces → go to section 4 immediately.
- Failure does not reproduce → note the time and continue with section 5
  anyway. An intermittent result can come from reading a lagging replica or
  from a write racing the check. Rule both out before closing.

### 3.2 Classify the mismatch

| Observation | Likely meaning |
| --- | --- |
| `computedCount < storedCount` | Rows **deleted** (or restore from an older backup) |
| `computedCount > storedCount`, hash differs | Rows **inserted** after the last verification. Normal only if the stored root is stale; see below. |
| Counts equal, hash differs | Rows **modified** (any hashed column, or `createdAt` precision / timezone change) |
| `prevHash_mismatch` at row N | Row N or N-1 was inserted, deleted or reordered |
| `hash_mismatch` at row N | Row N's content was modified |

The tenant verifier stores the current root on every **successful** run, so
new rows between runs always change `entry_count` and `root_hash`. The
comparison is therefore only meaningful immediately after the stored root was
written. If writes happened between the last verification and this one, a
mismatch is expected. Treat it as **unconfirmed** and follow section 5.2
before assuming tampering.

---

## 4. Evidence preservation

Do this **before** any fix, and do not re-run `upsertStoredRoot` or any
write that changes `audit_chain_roots`.

1. Take a database snapshot / point-in-time-recovery marker of the primary.
2. Export the affected tables to write-once storage:
   ```bash
   pg_dump "$DATABASE_URL" -t audit_logs -t audit_chain_roots  # plus the arbitrator audit table once it exists \
     --data-only -Fc -f audit-evidence-$(date -u +%Y%m%dT%H%M%SZ).dump
   sha256sum audit-evidence-*.dump > audit-evidence.sha256
   ```
3. Save the verifier log lines and event payloads, the Redis lock state
   (`GET` / `TTL audit:lock:<tenantId>`) and the output of section 3.1.
4. Collect database access evidence for the window since the last good
   verification: Postgres logs, cloud audit trails, admin audit logs
   (`GET /api/admin/audit-logs`) and deploy/migration history.
5. Restrict write access to the audit tables to the incident lead until the
   incident is closed.

---

## 5. Scope identification

### 5.1 Arbitrator chain

`firstViolation.id` is the first bad row. Rows before it are intact. Compare
from that row onward against the latest backup taken before the incident
window to find every inserted, deleted or modified row. Map each affected row
to `resourceId` (dispute) and `actor` (arbitrator).

### 5.2 Tenant chain

The root does not identify rows, so narrow it down:

1. Restore the most recent backup taken **after** the last successful
   verification (`audit_chain_roots.verified_at`) into an isolated database.
2. Recompute that tenant's root on the restore. If it matches the stored root,
   the backup is a clean reference.
3. Diff `audit_logs` for the tenant between the clean reference and the
   primary: missing ids = deletions, extra ids with `createdAt` before
   `verified_at` = insertions, same id with different hashed fields =
   modifications.
4. If the only differences are rows created **after** `verified_at`, the
   mismatch was a stale root, not tampering (section 3.2). Record that and go to
   section 7.

For every affected row, list the tenant, escrow / dispute / user it refers to,
and the actions it recorded. This list drives communication and remediation.

---

## 6. Communication

| Audience | When | What |
| --- | --- | --- |
| Incident channel / on-call | Immediately | SEV-1, which chain, tenant(s), lock state |
| Security lead and engineering manager | Within 1 hour | Classification from 3.2, evidence location |
| Affected tenant admins | Once scope is confirmed (5) | What records were affected, the time window, admin features locked, next update time |
| Users / arbitrators whose records were affected | After legal / compliance review | Plain-language notice, no speculation about the cause |
| Regulators / auditors | Per contractual and legal obligations | Via compliance, with the evidence package |

Do not share hashes, table dumps or suspected-insider details outside the
incident group.

---

## 7. Remediation checklist

- [ ] Root cause identified: tampering, bad migration / manual SQL, restore
      from an old backup, clock or timestamp precision change, stale root, or a
      concurrent-write race in the logger
- [ ] If credentials or DB access were abused: rotate DB credentials and admin
      keys (`docs/runbook.md` → Rotating Secrets) and revoke sessions
- [ ] Affected rows restored from the clean reference, or documented as lost.
      Original rows are never edited "back into shape" without evidence of the
      correct values.
- [ ] Arbitrator chain: the chain is re-verified end to end
      (`validateChain().valid === true`)
- [ ] Tenant chain: the new baseline is written only after the incident lead
      signs off. Delete the tenant's `audit_chain_roots` row and run
      `runVerification()` to re-baseline, with the reason recorded in the
      incident doc.
- [ ] Admin lock released with `releaseAdminLock(tenantId)` after sign-off
      (or let the TTL expire)
- [ ] Verification re-run twice, clean
- [ ] Post-incident review in `docs/incidents/` within 5 business days,
      including whether the verification worker and `validateChain()` should
      now be scheduled automatically
