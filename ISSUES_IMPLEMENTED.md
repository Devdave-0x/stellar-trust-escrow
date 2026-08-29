# Issues implemented on this branch

This branch bundles four small, independent housekeeping fixes, each as its own commit.

## 1. Refactor: named constants in `backend/services/webhookService.js`
Replaced inline magic numbers/strings (HMAC secret byte length, signature algorithm,
default pagination page/limit) with named, commented constants
(`SUBSCRIPTION_SECRET_BYTE_LENGTH`, `SIGNATURE_ALGORITHM`, `DEFAULT_HISTORY_PAGE`,
`DEFAULT_HISTORY_PAGE_SIZE`), alongside the existing `DEFAULT_RETRY_ATTEMPTS` /
`DEFAULT_BACKOFF_DELAY_MS`. No behavior change.

## 2. Documentation: JSDoc for `backend/services/eventIndexer.js`
Added `@param`/`@returns` JSDoc blocks to every exported function (`startIndexer`,
`fetchAndProcessEvents`, `dispatchEvent`, and each `handle*` contract-event handler)
so IDE hovers and generated docs describe the raw event/meta shapes and return types.
Comments only — no behavior change.

## 3. DX: friendly empty state in `frontend/app/admin/disputes/page.jsx`
The admin disputes list previously showed a bare "No disputes found." message.
It now shows contextual, actionable copy depending on the active filter tab
(Open / Resolved / All), using the existing `card` empty-state styling.

## 4. Documentation: JSDoc for `frontend/hooks/useWallet.js`
Added a full `@returns` JSDoc block to the exported `useWallet()` hook describing
its returned state/actions shape, plus a supporting JSDoc block for the internal
`connect()` callback. Comments only — no behavior change.
