# Issue 1 — Document env vars read by streamingIndexer.js

## What was implemented

`backend/services/streamingIndexer.js` does not exist in this codebase —
there is no file by that name anywhere under `backend/`. The closest
existing services are `backend/services/eventIndexer.js` and
`backend/services/escrowIndexer.js`, both of which already read their
`process.env.*` values with matching, commented entries in
`backend/.env.example`:

- `ESCROW_CONTRACT_ID` — documented at `.env.example` (Meta-Transactions /
  Indexer sections)
- `INDEXER_POLL_INTERVAL_MS` — documented at `.env.example`
- `INDEXER_START_LEDGER` — documented at `.env.example`

## Recommendation

If `streamingIndexer.js` is a planned/renamed file that hasn't landed on
this branch yet, please point to its actual path (or the PR that introduces
it) and the corresponding `.env.example` entries will be added then. No
file was fabricated to satisfy this issue since doing so would document
env vars for code that isn't part of the codebase.
