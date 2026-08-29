# Issue 2 — Standardize null/undefined checks in KycStatusBanner.jsx

## What was implemented

`frontend/components/KycStatusBanner.jsx` does not exist in this codebase.
The KYC feature lives instead under `frontend/app/kyc/` (`layout.jsx`,
`page.jsx`, `admin/page.jsx`) and there is no standalone "status banner"
component under `frontend/components/`.

A similar inconsistent-null-check bug was already fixed on `develop` for
`backend/services/escrowIndexer.js` (commit `853deab`,
"standardize null/undefined checks in escrowIndexer.js"), which is the
closest precedent for the pattern this issue describes.

## Recommendation

If the KYC status banner lives under a different name or path (e.g. inside
`frontend/app/kyc/page.jsx`), please point to the exact file/component and
its null/undefined checks will be standardized on `== null` (covering both
`null` and `undefined`) with a regression test, matching the pattern used
in the `escrowIndexer.js` fix. No file was fabricated to satisfy this issue
since doing so would risk introducing a duplicate, unused component.
