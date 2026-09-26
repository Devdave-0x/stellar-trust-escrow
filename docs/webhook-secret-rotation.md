# Webhook Secret Rotation

How to rotate a webhook signing secret without dropping or rejecting
deliveries. It covers what the producer (this platform) does, how consumers
roll out the new secret, rollback, deadline handling and troubleshooting.

Related: [`webhooks.md`](./webhooks.md) (payloads, signatures, retries) and
[`api/webhooks.md`](./api/webhooks.md) (endpoints).

---

## 1. Producer behaviour

Code: `rotateSecret` in `backend/services/webhookService.js`, route
`POST /api/webhooks/:id/rotate-secret`.

- Rotation generates a new 32-byte secret and **replaces** the old one
  immediately. The platform stores one secret per subscription, and every
  delivery **created** after the rotation is signed with the new secret.
- Signatures are computed when a delivery is created and enqueued, not when
  it is sent. **Retries of deliveries created before the rotation keep their
  original signature**, made with the old secret, until their retries run out.
  With the defaults (`WEBHOOK_MAX_RETRY_ATTEMPTS=5`,
  `WEBHOOK_BACKOFF_BASE_MS=5000`), the last retry is sent about
  5 + 10 + 20 + 40 = 75 seconds after the first attempt, plus jitter.
- The old secret is not kept or returned anywhere after rotation. Save it
  before rotating if you need it for the overlap window.

Because the producer switches at once, the **dual-secret window is
implemented by the consumer**: during rotation, accept a signature made with
either the current or the previous secret, until a deadline.

### Headers (unchanged by rotation)

| Header | Value |
| --- | --- |
| `X-Webhook-Signature` | `sha256=<hex HMAC-SHA256 of "<timestamp>.<raw body>">` |
| `X-Webhook-Timestamp` | Unix seconds used in the signing input |
| `X-Webhook-Delivery-Id` | Stable across retries; use it for idempotency |
| `X-Webhook-Event-Type` | Event type code |

---

## 2. Rotation timeline

| Step | When | Who | Action |
| --- | --- | --- | --- |
| 1 | T − 1 day | Consumer | Deploy dual-secret verification (section 3), still configured with only the current secret |
| 2 | T | Consumer | Copy the current secret into `WEBHOOK_SECRET_PREVIOUS` and set `WEBHOOK_SECRET_PREVIOUS_UNTIL` = T + 1 hour |
| 3 | T | Consumer | Call rotate-secret (section 4) and store the returned secret as `WEBHOOK_SECRET`. Do steps 2–4 together. |
| 4 | T + seconds | Consumer | Reload / redeploy so every receiver instance has both secrets |
| 5 | T → deadline | Both | New deliveries verify with the new secret; in-flight retries verify with the previous one |
| 6 | After the deadline | Consumer | Remove `WEBHOOK_SECRET_PREVIOUS`; signatures made with it are now rejected |

**Choosing the deadline:** at least the retry window (≈ 75 s by default)
plus the time it takes to roll the new secret out to every receiver
instance, plus your timestamp tolerance (5 minutes recommended). One hour is
a safe default; never leave the previous secret active indefinitely.

---

## 3. Consumer: dual-secret verification

```js
import crypto from 'crypto';

const TOLERANCE_SECONDS = 300;

function sign(secret, timestamp, rawBody) {
  return crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
}

function matches(expectedHex, receivedHex) {
  const a = Buffer.from(expectedHex, 'hex');
  const b = Buffer.from(receivedHex, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Returns 'current', 'previous' or null.
 */
export function verifyWebhook(rawBody, signatureHeader, timestamp, now = Date.now()) {
  if (!signatureHeader || !timestamp) return null;
  if (Math.abs(now / 1000 - Number(timestamp)) > TOLERANCE_SECONDS) return null; // replay guard

  const received = signatureHeader.replace(/^sha256=/, '');
  if (matches(sign(process.env.WEBHOOK_SECRET, timestamp, rawBody), received)) return 'current';

  const previous = process.env.WEBHOOK_SECRET_PREVIOUS;
  const until = Date.parse(process.env.WEBHOOK_SECRET_PREVIOUS_UNTIL ?? '');
  if (previous && now < until && matches(sign(previous, timestamp, rawBody), received)) {
    return 'previous';
  }
  return null;
}

// Express: verify against the raw bytes, not re-serialised JSON.
app.post('/hooks', express.raw({ type: 'application/json' }), (req, res) => {
  const result = verifyWebhook(
    req.body.toString('utf8'),
    req.get('X-Webhook-Signature'),
    req.get('X-Webhook-Timestamp'),
  );
  if (!result) return res.status(401).send('Invalid signature');
  if (result === 'previous') console.info('webhook verified with previous secret', req.get('X-Webhook-Delivery-Id'));
  // dedupe on X-Webhook-Delivery-Id, then process
  res.sendStatus(200);
});
```

Log which secret matched. When `previous` matches stop appearing, the
rotation has drained and the previous secret can be removed before the
deadline.

---

## 4. API examples

Rotate (the response contains the only copy of the new secret):

```bash
curl -X POST "https://api.example.com/api/webhooks/$SUBSCRIPTION_ID/rotate-secret" \
  -H "Authorization: Bearer $TOKEN"
```

```json
{ "data": { "id": "cmc9x7h3q0001w9j1a2b3c4d5", "secret": "4a1e0d54…d0cd0af" } }
```

Check recent deliveries during the window:

```bash
curl "https://api.example.com/api/webhooks/$SUBSCRIPTION_ID/deliveries?limit=30" \
  -H "Authorization: Bearer $TOKEN"
```

Only the subscription's owner can rotate it; other callers get `404`.

---

## 5. Rollback

The platform keeps no history of secrets, so a rotation cannot be undone
server-side. If the new secret was lost or leaked, or the rollout failed:

1. Keep accepting the previous secret by extending
   `WEBHOOK_SECRET_PREVIOUS_UNTIL`. This only helps for retries of
   deliveries created before the rotation.
2. **Rotate again** and roll the newest secret out. This is the only way to
   recover if the secret returned by the first rotation was lost.
3. Reconcile deliveries that failed during the incident: list them in the
   delivery history (`GET /api/webhooks/:id/deliveries`) and re-read the
   affected escrows from the API. There is no redelivery endpoint yet.

If a secret is suspected leaked, rotate immediately and set the deadline for
the leaked secret to **now**: do not accept it during an overlap window.

---

## 6. Deadline handling

- Enforce the deadline in code (`WEBHOOK_SECRET_PREVIOUS_UNTIL`), not only
  by remembering to remove the variable.
- After the deadline, signatures made with the previous secret fail with
  `401`. Those deliveries are retried by the platform and end as `failed`.
  They are visible in delivery history for reconciliation.
- Alert if `previous` matches are still seen within 10 minutes of the
  deadline; the rollout did not reach every instance.

---

## 7. Troubleshooting failed signatures

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| All deliveries fail right after rotation | Receiver still has only the old secret | Finish the rollout; the dual-secret check covers retries in the meantime |
| Only some instances reject | Partial deploy / stale config on some replicas | Reload every instance; compare the secret fingerprint (e.g. first 8 hex of `sha256(secret)`) across instances |
| Fails for every secret, including current | Verifying re-serialised JSON instead of raw bytes, or a body-parser changed the body | Verify `req.body` from `express.raw` (or equivalent) exactly as received |
| Fails with the correct secret | Signing input missing the timestamp or the `.` separator, or the `sha256=` prefix not stripped | Use `` `${timestamp}.${rawBody}` `` and strip the prefix |
| Intermittent failures | Clock skew beyond the timestamp tolerance | Sync with NTP; keep a 5-minute tolerance |
| `previous` matches long after rotation | Retry settings raised (`WEBHOOK_MAX_RETRY_ATTEMPTS` / `WEBHOOK_BACKOFF_BASE_MS`), so pre-rotation retries run longer | Size the deadline to the configured retry window |
| 404 on rotate-secret | Wrong subscription id or caller is not the owner | Use the owner's token and the id from `GET /api/webhooks` |
