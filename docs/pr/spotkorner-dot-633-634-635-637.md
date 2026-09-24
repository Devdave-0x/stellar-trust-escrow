## Summary

Three documentation deliverables (fraud signal review, ownership transfer user guide, export verification) and a stale-data banner on the mobile escrow detail screen.

> **Stacked on #667 — please merge #667 first.** #637 builds on the rebuilt `mobile/services/offlineCache.ts` from #667 (which was two concatenated implementations on `develop`). Until #667 is merged, its five commits also appear in this PR's diff; once it is, this PR shows only the four commits below.

Closes #633
Closes #634
Closes #635
Closes #637

## Type of change

- [x] `docs` — documentation only (#633, #634, #635)
- [x] `feat` — new feature (#637)
- [x] `fix` — de-duplicates two mobile files broken by #1016 (part of #637)
- [x] `test` — tests (#637)

## What changed

### #633 Fraud signal review guide (`docs/fraud-signal-review.md`)

- What each signal (`SAME_IP`, `RAPID_COMPLETION`, `REPEATED_PAIR`, `ROUND_AMOUNT`, `ZERO_MILESTONES`) means, why it matters, and common innocent explanations — **without** weights, thresholds, or how to avoid a flag (per the acceptance criteria; tuning stays in the service and its env vars).
- What a flag writes (`FRAUD_FLAGGED` + `REPUTATION_SUSPENDED` for both parties), that suspension is per address (one restore clears all of an address's suspensions), review procedure, false-positive handling, clearing/upholding via audit rows, how to talk to users, and audit requirements.
- **Current-state gaps documented:** nothing calls `runFraudCheck`, nothing reads `isReputationSuspended`, and there is no review UI or API, so the guide describes working the audit log by hand.

### #634 Ownership transfer user guide (`docs/user-guide/ownership-transfer.md`)

- Documents the transfer that exists: the single-step `transfer_client_role(escrow_id, new_client)` — who can call it (current client, Active escrow, not paused), valid recipients (not the freelancer or arbiter), the effect on each participant (new client inherits approvals, cancellation and refunds; previous client loses them; multisig buyer signers unchanged), how to invoke it, the `cl_role` event, and errors `E3`, `E8`, `E9`, `E31`.
- **Not yet supported, clearly marked:** request/accept, reject, expiry, in-app UI, notifications, and backend indexing of `cl_role` (the indexer drops the topic, so the API may show the previous client).

### #635 Export verification docs (`docs/export-verification.md`)

- Every export that exists (user-data JSON `version: "1.0"`, escrows CSV, audit CSV, compliance reports), why two downloads never hash the same (exports are regenerated per request and the JSON embeds `exportedAt`), how to record and check SHA-256 checksums on Linux/macOS/Windows, completeness checks (sections, header rows, row counts, the 10 000-row audit cap), schema version notes, and a mismatch troubleshooting table.
- **Not yet supported, clearly marked:** export manifests, server-side checksums, reproducible exports, and CSV schema versions. Also documents a defect found while researching: the emailed link for exports over 10 MB points back to the same endpoint, which re-queues instead of serving the file.

### #637 Mobile stale-data banner

- **De-duplication (pre-existing breakage):** #1016 left `mobile/hooks/useEscrows.ts` and `mobile/app/escrow/[id].tsx` as two concatenated implementations each (two `useEscrowList`s; two `EscrowDetailScreen` default exports interleaved line by line). `useEscrows.ts` is restored to its pre-#1016 version, which is byte-identical to the half the app imports; `[id].tsx` is restored to its pre-#1016 version plus the three later changes from #1015 (id guards, biometric skeleton). The diff of `[id].tsx` against its pre-#1016 version is exactly #1015's changes plus the banner.
- `offlineCache.ts` (from #667): new `getCachedEscrowEntry(id)` → `{ record, cachedAt }`; `getCachedEscrow` delegates to it.
- `useEscrows.ts`: `useEscrow` now runs `loadEscrowWithFallback`, which returns `{ escrow, source: 'network' | 'cache', syncedAt, staleReason? }`. Offline → cached data (`staleReason: 'offline'`); online but the request fails → cached data (`staleReason: 'fetch-failed'`) instead of an error screen; fresh fetch → `source: 'network'` and the cache is updated. It throws only when neither source has the escrow, so React Query's retries still apply then.
- New `components/escrow/StaleDataBanner.tsx`: "You're offline. Showing saved data. Last synced 5 min ago." / "Couldn't refresh. Showing saved data. Last synced 2 h ago. Pull down to retry."; hidden when data is fresh. Rendered at the top of the escrow detail screen; pull-to-refresh clears it once a sync succeeds.

## Tests

```bash
cd mobile && npx jest
# 5 suites, 40 passed:
#   loadEscrowWithFallback (new, 5): fresh sync, offline fallback, fetch-failure fallback, and both no-cache error paths
#   StaleDataBanner (new, 10): age formatting, offline and fetch-failed messages rendered, hidden after a fresh sync
#   offlineCache (+2): getCachedEscrowEntry returns cachedAt; unusable rows yield no entry
#   stellar, useReputation: unchanged
```

**Type checking.** On `develop`, `npx tsc --noEmit` only ever reported syntax errors (199 across the three concatenated files), because `tsc` skips semantic checking when any file fails to parse. With those files fixed, the full check now runs and surfaces **pre-existing** problems this PR does not touch: `lib/api.ts` uses dynamic `import()` which the configured `module` setting rejects (TS1323), and `@types/jest` is not installed, so every test file (old and new) reports missing Jest globals. No source file changed here has a type error.

**New or updated tests:** yes: `mobile/__tests__/loadEscrowWithFallback.test.ts`, `mobile/__tests__/StaleDataBanner.test.tsx`, `mobile/__tests__/offlineCache.test.ts`.

## Documentation

- [x] Docs updated:
  - `docs/fraud-signal-review.md` (new)
  - `docs/user-guide/ownership-transfer.md` (new)
  - `docs/export-verification.md` (new)

## CHANGELOG

```
### Added
- Fraud signal review guide (#633)
- Ownership transfer user guide (#634)
- Export verification docs (#635)
- Mobile stale-data banner on the escrow detail screen (#637)
```

## Review notes

- Merge order: **#667, then this PR.**
- `useEscrow`'s return shape changed from `Escrow` to `EscrowResult`; the escrow detail screen is its only consumer and is updated.
- Follow-ups surfaced (not fixed here): wire `fraudDetector` into completion and reputation; a two-step ownership transfer and `cl_role` indexing; export manifests/checksums and the large-export email loop; add `@types/jest` and fix the `lib/api.ts` module setting in the mobile app.

## Migration safety checklist

- [x] No migration is included — reason: no database changes.

## Checklist

- [x] Tests added or updated
- [x] Documentation updated
- [x] `## [Unreleased]` section of CHANGELOG updated
- [x] PR targets `develop`
- [x] No `.env` files or secrets committed

🤖 Generated with [Claude Code](https://claude.com/claude-code)
