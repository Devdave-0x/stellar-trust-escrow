## Summary

A shared zod schema for share-link payloads, and three mobile features: network-mismatch blocking, a retry queue for signed transactions, and offline evidence drafts.

> **Stacked on #670 (itself stacked on #667) — merge order: #667, #670, then this PR.** #638 and #639 change `useBroadcastEscrow` in `mobile/hooks/useEscrows.ts`, and #640 adds to `mobile/app/escrow/[id].tsx`; both files are two concatenated implementations on `develop` and are only repaired in #670. Until those merge, their commits also appear in this PR's diff; afterwards only the four commits below remain.

Closes #638
Closes #639
Closes #640
Closes #641

## Type of change

- [x] `feat` — new feature (#638, #639, #640, #641)
- [x] `test` — tests

## What changed

### #641 Shared schema for share-link payloads

- `shared/schemas/shareLink.js`: zod schemas for `GET /api/share/:token` (escrow id as a string, status enum, amounts as integer strings, milestones, `sharedAt`, `expiresAt`) and `POST /api/escrows/:id/share`. Timestamps accept `Date` (server side) and ISO strings (wire). Exported from `shared/schemas/index.js`.
- **Backend:** `shareLinkController` validates both responses with the shared schema before sending; a mismatch is logged and returns 500 rather than a drifted payload.
- **Frontend:** `frontend/lib/api/shareLinks.js` (`resolveShareLink`) fetches and validates with the same schema, throwing `ShareLinkError` on drift, 404 and 410. `next.config.js` sets `experimental.externalDir` so the frontend can compile `../shared` (no page imports the helper yet).
- **Mobile:** the app has no zod and cannot bundle `../shared`, so `shared/types/shareLink.d.ts` provides matching interfaces, imported with `import type` (erased at compile time) by the new `shareApi.resolve`. A backend test fails if the interfaces' fields drift from the schemas.

### #638 Wallet network mismatch

- `lib/networkMatch.ts`: `checkNetworkMatch` compares the network the wallet was connected on, the app's configured network, and the API's network (`systemApi.apiNetwork` reads the public `/api/relayer/status`). Unknown values never block; a positive disagreement does.
- The wallet store records the network in MMKV at connect time (the existing unused `STELLAR_NETWORK` key) and restores it on launch; sessions saved before this read as unknown.
- **Blocks submission:** `useBroadcastEscrow` runs `assertNetworkMatch` before submitting and throws `NetworkMismatchError`. On the create-escrow screen `NetworkMismatchBanner` shows the expected network with a **Reconnect wallet** action (disconnect → connect screen), and the Broadcast button is disabled.

### #639 Retry queue for signed transactions

- `services/txRetryQueue.ts`: submits the signed XDR with the **transaction hash as `Idempotency-Key`** (the backend's global idempotency middleware then de-duplicates retries). Network errors, 5xx, 429 and in-flight 409 are queued in MMKV; any other 4xx is a permanent rejection and is thrown immediately (`PermanentSubmissionError`). Malformed XDR is rejected before any request.
- `processQueue` retries due entries with exponential backoff (5 s doubling to 5 min, 8 attempts max). Successes are removed; rejections and exhausted entries become `failed` with the server's reason.
- `services/txRetryRunner.ts` wires MMKV and the API, flushes on launch and whenever NetInfo reports connectivity (started in `app/_layout.tsx`).
- UI: the create screen tells the user the transaction was saved for retry; the Escrows tab's `PendingTransactions` panel shows waiting transactions and any failures (with reason) until dismissed.

### #640 Offline evidence drafts

- `services/evidenceDrafts.ts`: drafts `{ escrowId, description, status }` persisted in MMKV (survive restarts), deletable before upload, validated (non-empty, ≤ 5 000 chars). `syncDrafts` resolves the escrow's dispute id and posts text evidence (`POST /api/disputes/:disputeId/evidence` with a `description` field). Uploaded drafts are removed; network/5xx errors keep them pending; server rejections mark them `failed` with the reason. Drafts added or deleted during an in-flight sync are neither lost nor resurrected.
- `services/evidenceDraftRunner.ts` syncs on launch, after each save, and on reconnect.
- UI: on a **Disputed** escrow, participants get an Evidence section on the detail screen to write, list, and delete drafts, with "Waiting to upload" / "Not uploaded: <reason>" states.
- Scope: drafts hold evidence text only. File attachments are not drafted (the server-side file upload path currently rejects every file; see #667's IPFS durability doc, gap 2).

## Tests

```bash
cd mobile && npx jest
# 13 suites, 78 passed (38 new):
#   networkMatch (7), useWalletStore (4), NetworkMismatchBanner (2)      — #638
#   txRetryQueue (11), PendingTransactions (3)                          — #639
#   evidenceDrafts (8), EvidenceDrafts (3)                               — #640

cd backend && NODE_OPTIONS=--experimental-vm-modules npx jest --runInBand tests/shareLinkSchema.test.js
# 15 passed: required fields, BigInt-safe strings, status enum, .d.ts drift, controller validation (#641)

cd frontend && npx jest --config jest.config.cjs tests/lib/shareLinks.test.js
# 3 passed (#641)
```

`npx tsc --noEmit` in `mobile/` reports no errors in any file added or changed here; the only remaining errors are the pre-existing `lib/api.ts` TS1323 dynamic-import errors and missing `@types/jest` in test files (see #670).

## Documentation

- [x] No separate docs needed — behaviour is covered in the CHANGELOG and code comments; the share-link wire format is documented by `shared/types/shareLink.d.ts`.

## CHANGELOG

```
### Added
- Shared zod schema for escrow share-link payloads (#641)
- Mobile wallet network mismatch messaging (#638)
- Mobile retry queue for signed transactions (#639)
- Mobile offline drafts for dispute evidence (#640)
```

## Review notes

- Merge order: **#667 → #670 → this PR.**
- `useBroadcastEscrow` now resolves to `{ status: 'submitted', result } | { status: 'queued', id }` instead of the raw broadcast response; `app/escrow/create.tsx` is its only caller and is updated.
- The API's network is read from `/api/relayer/status` because it is the only public endpoint that reports `STELLAR_NETWORK`; a dedicated config endpoint would be cleaner.

## Migration safety checklist

- [x] No migration is included — reason: no database changes.

## Checklist

- [x] Tests added or updated
- [x] Documentation updated (or absence explained above)
- [x] `## [Unreleased]` section of CHANGELOG updated
- [x] PR targets `develop`
- [x] No `.env` files or secrets committed

🤖 Generated with [Claude Code](https://claude.com/claude-code)
