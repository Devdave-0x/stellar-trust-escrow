# Payment submission replay-protection recovery

## Scope

Payment checkout submission depends on replay protection to make retries with
an `Idempotency-Key` safe. This guide covers the degraded response emitted when
that optional protection reports that it is unavailable. It does not authorize
operators to replay, refund, or create payments manually.

## Detection

The checkout controller emits the structured log event
`payment.replay_protection_degraded` and returns:

```json
{
  "error": "Payment submission is temporarily unavailable. Retry with the same Idempotency-Key.",
  "code": "PAYMENT_REPLAY_PROTECTION_DEGRADED",
  "retryable": true
}
```

with HTTP 503. Alerts should use the event name and code, not request bodies,
idempotency keys, wallet addresses, or provider error strings.

## Mitigation

1. Confirm the replay/idempotency store health, connectivity, credentials, and
   latency from its own metrics and deployment logs.
2. Keep the endpoint in its degraded state while that store is unavailable;
   do not bypass replay protection or ask clients to use a new key.
3. Tell callers to retry only after recovery, using the **same**
   `Idempotency-Key`. This permits a completed response to be replayed rather
   than creating a second checkout.
4. Check payment-provider dashboards by their provider-side reference only;
   do not copy payment data into incident chat or logs.

## Rollback

If a deployment introduced the unavailable condition, roll back the payment
service/controller deployment and retain the replay store. Do not clear the
idempotency namespace during rollback: cached successful responses and
in-flight locks are part of duplicate-submission protection.

## Verification after recovery

1. Observe a successful checkout with a new test key in the target network.
2. Repeat the same request and confirm the existing idempotency middleware
   returns the original response with `X-Idempotency-Replayed: true`.
3. Confirm no new `payment.replay_protection_degraded` events occur for the
   configured observation period.
4. Reconcile provider sessions against internal payment records before
   declaring the incident resolved.

Run these steps independently for test and production environments. Never use
production keys, payment records, or customer data in a testnet verification.
