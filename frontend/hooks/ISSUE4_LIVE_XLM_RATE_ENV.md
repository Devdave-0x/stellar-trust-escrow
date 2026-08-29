# Issue 4 — Document env vars read by useLiveXlmRate.js

## What was implemented

`frontend/hooks/useLiveXlmRate.js` does not exist in this codebase. The
existing hooks directory (`frontend/hooks/`) has no XLM-rate hook; the
closest related code is `frontend/hooks/useCurrency.js`, which is a
re-export of `useCurrency` from `frontend/contexts/CurrencyContext.jsx`
and does not read `process.env.*` itself. The actual XLM/USD price lookup
in this codebase lives server-side in
`backend/services/paymentService.js` (`getXlmUsdPrice`), which reads
`STELLAR_HORIZON_URL` and `USDC_ISSUER` — both already documented with
comments in `backend/.env.example`.

## Recommendation

If a live-XLM-rate hook is planned for the frontend (e.g. polling a
`/api/rate/xlm` endpoint), please point to its actual path once it lands
and the corresponding `NEXT_PUBLIC_*` entries will be added to
`frontend/.env.example` then. No file was fabricated to satisfy this issue
since there's no existing hook whose env usage could be documented.
