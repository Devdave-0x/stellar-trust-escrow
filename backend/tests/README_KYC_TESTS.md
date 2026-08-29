# Testing — kycService edge case coverage

## What changed
Added `backend/tests/kycService.test.js` covering gaps in
`backend/services/kycService.js` that had no test coverage:

1. **Empty input** — `handleWebhook({})` returns `null` and performs no writes.
2. **Malformed / unrecognized event type** — `handleWebhook` with an unknown
   `type` returns `null` without upserting a record or writing an audit log.
3. **Unhappy path** — `applicantReviewed` with a missing/undefined
   `reviewResult` defaults to a `Declined` status and logs `KYC_DECLINED`.
4. Additional coverage: malformed payload missing `externalUserId` doesn't
   throw, `getStatus` returns `null` for an address with no record, and
   `verifyWebhookSignature` returns `false` for an incorrect signature.

No production code was changed — `kycService.js` is untouched.

## Running
```
npm test -- kycService.test.js
```
(uses the existing Jest + `jest.unstable_mockModule` pattern already used by
sibling tests such as `complianceService.test.js`.)
