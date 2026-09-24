# Fraud Signal Review Guide

For support and trust-and-safety reviewers. It explains what each fraud signal means, what a flag does to an account, how to review and clear a flag, how to handle false positives, and what must be recorded.

This guide is deliberately written for reviewers, not for users. It does not list scoring weights, thresholds, or how the checks can be avoided. Operators who need to tune detection should read `backend/services/fraudDetector.js` and its environment variables directly; do not copy those values into tickets, user-facing messages, or public docs.

## Contents

- [What the detector looks for](#what-the-detector-looks-for)
- [Signals](#signals)
- [What a flag does](#what-a-flag-does)
- [Current state of the tooling](#current-state-of-the-tooling)
- [Review procedure](#review-procedure)
- [False positives](#false-positives)
- [Clearing or upholding a flag](#clearing-or-upholding-a-flag)
- [Talking to users](#talking-to-users)
- [Audit requirements](#audit-requirements)

## What the detector looks for

The detector (`backend/services/fraudDetector.js`) looks at **completed** escrows for signs of **collusion and wash trading**: a client and freelancer, often the same person or a coordinated pair, running escrows through the platform to farm reputation rather than to exchange real work.

Each completed escrow gets a combined score from the signals below. An escrow is **flagged** only when several signals line up; no single weak signal (for example a round amount) is enough on its own. A flag is a prompt for human review, never a verdict.

## Signals

| Signal             | Meaning                                                                                      | Why it matters                                                                                                     | Common innocent explanations                                                                                               |
| ------------------ | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `SAME_IP`          | The client's and the freelancer's most recent active sessions came from the same IP address. | Two "different" parties on one connection can be one person controlling both wallets. The strongest single signal. | Same office, co-working space, university, VPN exit, mobile carrier NAT, or a household where both parties genuinely live. |
| `RAPID_COMPLETION` | The escrow went from creation to completion unusually fast.                                  | Real work takes time; an escrow funded and released almost immediately often had no work behind it.                | Pre-agreed small tasks, work delivered before the escrow was created, test transactions by new users.                      |
| `REPEATED_PAIR`    | The same client and freelancer have already completed several escrows together.              | Reputation farming repeats the same pair many times.                                                               | Long-running client relationships, retainers, agencies with a regular contractor.                                          |
| `ROUND_AMOUNT`     | The escrow total is an exact round figure.                                                   | Scripted or self-dealt escrows often use round numbers. Weak on its own.                                           | Most humans price in round numbers.                                                                                        |
| `ZERO_MILESTONES`  | The escrow has no milestones.                                                                | Milestones describe the work; an escrow with none has nothing to verify. Weak on its own.                          | Simple one-off payments; older escrows created before milestones were common.                                              |

Signals are recorded by name in the flag reason, for example `Fraud signals: SAME_IP, RAPID_COMPLETION (score: …)`.

## What a flag does

When an escrow is flagged, three rows are written to the admin audit log (`admin_audit_logs`), all with `performed_by = 'system:fraud-detector'`:

| `action`               | `target_address`   | `reason`                               |
| ---------------------- | ------------------ | -------------------------------------- |
| `FRAUD_FLAGGED`        | client address     | `Fraud signals: <names> (score: <n>)`  |
| `REPUTATION_SUSPENDED` | client address     | `Pending fraud review for escrow <id>` |
| `REPUTATION_SUSPENDED` | freelancer address | `Pending fraud review for escrow <id>` |

An address counts as **suspended** while its most recent `REPUTATION_SUSPENDED` / `REPUTATION_RESTORED` audit row is a suspension (`isReputationSuspended`). Suspension is per **address**, not per escrow: one restore clears the address, even if it was suspended for several escrows.

Funds are not frozen, and the escrow itself is not changed. Suspension is meant to stop reputation gains from counting while the case is reviewed.

## Current state of the tooling

Reviewers should know what is and is not wired up today:

- **Nothing calls the detector yet.** `runFraudCheck` exists but no route, worker, or indexer hook invokes it, so flags are only created when an operator runs it (for example from a script or the Node REPL against production credentials).
- **Nothing reads the suspension yet.** `isReputationSuspended` is not called by the reputation code, so a suspension is currently a record for reviewers, not an enforced block.
- **There is no review UI or API.** Flags are found and resolved through the audit log (`GET /api/admin/audit-logs`) and the database, as described below.

Until these are built, treat this guide as the procedure for working the audit log by hand.

## Review procedure

1. **Find open flags.** List recent `FRAUD_FLAGGED` rows and check whether each address is still suspended:

   ```sql
   SELECT id, target_address, reason, performed_at
   FROM admin_audit_logs
   WHERE action = 'FRAUD_FLAGGED'
   ORDER BY performed_at DESC;
   ```

   An address is still under review if its latest `REPUTATION_SUSPENDED` / `REPUTATION_RESTORED` row is `REPUTATION_SUSPENDED`.

2. **Open a case** in the trust-and-safety tracker. Record the escrow id (from the reason text), both addresses, the signals, and the flag time. Never paste session IPs or wallet keys into general support channels.

3. **Gather context** without contacting the users yet:
   - the escrow's milestones, descriptions, and deliverables;
   - the pair's history: how many escrows, over what period, and whether amounts or timing follow a pattern;
   - whether either account has other flags, disputes, or KYC issues;
   - whether a shared IP has a benign explanation visible in the account data (same organisation domain, a known co-working location).

4. **Decide:** clear (false positive), uphold (reputation gains for the escrow should not count), or escalate (possible wider abuse, sanctions, or account takeover) to the trust-and-safety lead.

5. **Record the decision** as described below before touching anything else.

Target turnaround: first look within 2 business days, decision within 5. A suspension left open indefinitely is itself a harm to legitimate users.

## False positives

Expect many flags on legitimate activity. The signals describe patterns, not intent. Clear the flag when the context explains the signals, for example:

- a shared IP plus a shared organisation (agency and in-house contractor, a university lab);
- a long-standing client relationship where fast, round-number, repeat escrows are normal;
- first-time users testing the platform with a small escrow to themselves on a shared connection, with no reputation actually gained.

When a false positive reveals a systematic pattern (for example one large co-working provider behind many flags), report it to the engineering owner of the detector rather than clearing flags one by one.

## Clearing or upholding a flag

There is no endpoint yet, so decisions are recorded directly in the audit log. Write the row in the same transaction as any other change, and use your own identity in `performed_by`.

**Clear (false positive)**: restore both addresses:

```sql
INSERT INTO admin_audit_logs (tenant_id, action, target_address, reason, performed_by, performed_at)
VALUES
  ('<tenant>', 'REPUTATION_RESTORED', '<client address>',
   'Fraud review <case id>: false positive, escrow <id> (shared office)', 'reviewer:<name>', now()),
  ('<tenant>', 'REPUTATION_RESTORED', '<freelancer address>',
   'Fraud review <case id>: false positive, escrow <id> (shared office)', 'reviewer:<name>', now());
```

**Uphold**: leave the suspension in place and record the decision so it is not re-reviewed:

```sql
INSERT INTO admin_audit_logs (tenant_id, action, target_address, reason, performed_by, performed_at)
VALUES ('<tenant>', 'FRAUD_REVIEW_UPHELD', '<client address>',
        'Fraud review <case id>: upheld for escrow <id>', 'reviewer:<name>', now());
```

Restoring an address clears **all** of its suspensions (see [What a flag does](#what-a-flag-does)). If the address has another open flag that should stay suspended, finish that review first or write a fresh `REPUTATION_SUSPENDED` row after the restore.

Never delete or edit existing audit rows. Corrections are new rows.

## Talking to users

- Do not tell users which signals fired, how the score works, or what would have avoided the flag. Say that the escrow was selected for a routine integrity review.
- Do not accuse. Ask neutral questions about the work (what was delivered, how the parties know each other).
- If a user disputes an upheld decision, escalate to the trust-and-safety lead; the original reviewer should not handle the appeal.
- Suspension details, IP addresses, and other users' data are never shared with the user.

## Audit requirements

Every review must leave a trail an auditor can follow without asking the reviewer:

| Requirement                        | Where it lives                                                                                                       |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| The original flag and its signals  | `FRAUD_FLAGGED` row (system-written)                                                                                 |
| Suspension of each address         | `REPUTATION_SUSPENDED` rows (system-written)                                                                         |
| The decision, who made it, and why | `REPUTATION_RESTORED` or `FRAUD_REVIEW_UPHELD` row with `performed_by = reviewer:<name>` and the case id in `reason` |
| Evidence considered                | the case in the trust-and-safety tracker, linked by case id                                                          |
| Escalations and appeals            | the case, plus a new audit row for any change of decision                                                            |

Retain case records for as long as the related escrow records are retained. Audit rows are append-only: never update or delete them.
