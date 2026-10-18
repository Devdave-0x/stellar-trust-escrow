# Payment checkout replay protection

`POST /api/payments/checkout` requires an `Idempotency-Key` header with 8–128
URL-safe characters. A caller must reuse a key only when retrying the exact
same wallet, amount, and escrow request. Reusing it for different parameters
returns `409`; malformed or absent keys return `400` before KYC or payment
creation occurs.

The service coalesces concurrent requests in one API worker, sends an opaque
derived key to Stripe, and upserts the payment record by Stripe session ID.
This provides deterministic retry behavior across workers without storing or
logging the raw client key. Failed requests are not retained, so a corrected
request can retry with the same key.

Prometheus exposes `payment_checkout_replay_total` with only the bounded
`created`, `in_flight`, `replayed`, `conflict`, `rejected`, and `failed`
outcomes. Structured logs include a one-way correlation digest and request ID;
they never include a wallet address, payment amount, Stripe session, or raw
idempotency key.
