# Env var documentation: stellarService.js

`backend/services/stellarService.js` reads two environment variables:

- `SOROBAN_RPC_URL` — Soroban RPC endpoint used by `getServer()` for
  submitting transactions, polling transaction status, fetching contract
  events, and reading the latest ledger.
- `STELLAR_NETWORK` — selects the network passphrase (`mainnet` vs
  `testnet`) used when constructing/submitting transactions.

Both already had entries in `backend/.env.example`, but neither had an
explanatory comment tying them to this file, which is what made local
setup error-prone (a new contributor scanning `.env.example` couldn't
tell that these two specific values gate Stellar RPC connectivity).

What changed: added a comment directly above each entry in
`backend/.env.example` pointing at `stellarService.js` and describing
its effect, so no separate README changes were needed — the
`.env.example` comments are now the setup reference for these two vars.
