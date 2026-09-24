# API Key Management for Integrators

This guide covers how programmatic API keys work in StellarTrustEscrow and how to create, rotate, restrict, and retire them safely. It describes the behaviour of the current backend (`backend/services/apiKeyService.js`, `backend/api/controllers/apiKeyController.js`, `backend/api/middleware/apiKeyAuth.js`). Where a capability does not exist yet, this guide says so and gives the recommended workaround.

## Contents

- [How API keys work](#how-api-keys-work)
- [Current capabilities and gaps](#current-capabilities-and-gaps)
- [Creating a key](#creating-a-key)
- [Using a key](#using-a-key)
- [Least privilege](#least-privilege)
- [Rotating a key safely](#rotating-a-key-safely)
- [Revoking a key](#revoking-a-key)
- [Responding to a compromised key](#responding-to-a-compromised-key)
- [Audit and monitoring](#audit-and-monitoring)
- [Error reference](#error-reference)

## How API keys work

| Property       | Behaviour                                                                                                                                     |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Format         | `stk_` followed by 64 hex characters (32 random bytes).                                                                                       |
| Storage        | Only the SHA-256 hash (`api_keys.key_hash`) is stored. The raw key is returned **once**, in the create response, and can never be read again. |
| Display prefix | The first 12 characters (`keyPrefix`, e.g. `stk_3f9a0c1b`) are stored so you can tell keys apart in listings.                                 |
| Identity       | A key acts as the user who created it. The middleware sets `req.user = { address, apiKeyId }`, the same shape as a JWT session.               |
| Header         | `x-api-key: <raw key>`. When the header is present the gateway uses API-key auth and never falls back to JWT.                                 |
| IP restriction | Optional `allowedIps` list of CIDR ranges or bare IPs. An empty list allows every source IP.                                                  |
| Usage tracking | `lastUsedAt` is updated (best effort) on every authenticated request.                                                                         |
| Revocation     | A key with `revokedAt` set is rejected with `401 Invalid API key` and hidden from listings.                                                   |
| Tenancy        | Keys are created under the tenant of the creating request (`tenantId`).                                                                       |

## Current capabilities and gaps

| Capability                       | Status                                                                                                   |
| -------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Create, list, rename a key       | Available via `/api/v1/api-keys`.                                                                        |
| IP allowlist (CIDR)              | Available (`allowedIps` on create and update).                                                           |
| Last-used timestamp              | Available (`lastUsedAt` in the list response).                                                           |
| **Permission scopes**            | **Not implemented.** Every key carries the full permissions of the owning user.                          |
| **Self-service revoke endpoint** | **Not implemented.** `revokedAt` is enforced, but no API sets it. See [Revoking a key](#revoking-a-key). |
| Expiry dates                     | Not implemented. Keys are valid until revoked.                                                           |

Because scopes do not exist, least privilege is achieved with **dedicated users, one key per integration, and tight IP allowlists** (see [Least privilege](#least-privilege)).

## Creating a key

Key management endpoints require a normal user session (JWT). An API key cannot be used to create other keys.

```bash
curl -sS -X POST https://api.example.com/api/v1/api-keys \
  -H "Authorization: Bearer $USER_JWT" \
  -H "Content-Type: application/json" \
  -d '{
        "name": "billing-sync-prod",
        "allowedIps": ["203.0.113.0/24", "198.51.100.7"]
      }'
```

Response (`201 Created`):

```json
{
  "id": "clx8w0g2e0000abcd1234efgh",
  "name": "billing-sync-prod",
  "key": "stk_3f9a0c1b7d...e41",
  "keyPrefix": "stk_3f9a0c1b",
  "allowedIps": ["203.0.113.0/24", "198.51.100.7"],
  "createdAt": "2026-09-24T10:00:00.000Z"
}
```

Store `key` in your secret manager immediately. It is not retrievable later; losing it means creating a new key.

Validation rules:

- `name` is required and must be a non-empty string (it is trimmed).
- `allowedIps` must be an array. Every entry must be a valid CIDR or IP, otherwise the request fails with `400 Invalid CIDR/IP entries: ...`.

List your active keys (the raw key is never returned):

```bash
curl -sS https://api.example.com/api/v1/api-keys \
  -H "Authorization: Bearer $USER_JWT"
```

```json
{
  "data": [
    {
      "id": "clx8w0g2e0000abcd1234efgh",
      "name": "billing-sync-prod",
      "keyPrefix": "stk_3f9a0c1b",
      "allowedIps": ["203.0.113.0/24", "198.51.100.7"],
      "lastUsedAt": "2026-09-24T10:05:12.000Z",
      "createdAt": "2026-09-24T10:00:00.000Z",
      "updatedAt": "2026-09-24T10:00:00.000Z"
    }
  ]
}
```

## Using a key

Send the raw key in the `x-api-key` header on any authenticated `/api` route:

```bash
curl -sS https://api.example.com/api/escrows \
  -H "x-api-key: $STK_API_KEY"
```

- Never put the key in a query string, a URL, client-side code, or a mobile app bundle. It is a server-to-server credential.
- Never log the full key. Log the `keyPrefix` instead.

## Least privilege

There are no scopes, so restrict what a key can reach using these controls:

1. **One key per integration and environment.** Name keys so they identify owner, purpose, and environment (`billing-sync-prod`, `billing-sync-staging`). Separate keys mean a leak or rotation only affects one system.
2. **Dedicated integration user.** Create keys under a user account that exists only for the integration and holds only the roles and escrow access the integration needs. A key can never do more than its user.
3. **IP allowlist every production key.** Restrict to the egress IPs or NAT range of the calling service:

   ```bash
   curl -sS -X PATCH https://api.example.com/api/v1/api-keys/$KEY_ID \
     -H "Authorization: Bearer $USER_JWT" \
     -H "Content-Type: application/json" \
     -d '{ "allowedIps": ["203.0.113.10/32"] }'
   ```

   Sending `"allowedIps": []` removes the restriction, so treat that change as a security review item.

4. **Keep admin credentials separate.** Admin routes use the `x-admin-api-key` header / admin session token, not user API keys. Never embed the admin key in an integration.

## Rotating a key safely

Keys do not expire, so rotate on a schedule (for example every 90 days) and whenever someone with access leaves. The zero-downtime pattern is create, deploy, verify, retire:

1. **Create the replacement** with the same name plus a suffix and the same `allowedIps`:

   ```bash
   curl -sS -X POST https://api.example.com/api/v1/api-keys \
     -H "Authorization: Bearer $USER_JWT" \
     -H "Content-Type: application/json" \
     -d '{ "name": "billing-sync-prod-2026q4", "allowedIps": ["203.0.113.10/32"] }'
   ```

2. **Deploy** the new key to the integration's secret store and roll the service.
3. **Verify the cutover.** List keys and confirm the new key's `lastUsedAt` is advancing and the old key's `lastUsedAt` has stopped changing:

   ```bash
   curl -sS https://api.example.com/api/v1/api-keys \
     -H "Authorization: Bearer $USER_JWT" \
     | jq '.data[] | {name, keyPrefix, lastUsedAt}'
   ```

4. **Retire the old key** as described in [Revoking a key](#revoking-a-key). Until a revoke endpoint exists, the interim step is to lock the old key down so it cannot be used from anywhere useful, then ask an operator to revoke it:

   ```bash
   # Interim lock-down: restrict the old key to an unroutable documentation address
   curl -sS -X PATCH https://api.example.com/api/v1/api-keys/$OLD_KEY_ID \
     -H "Authorization: Bearer $USER_JWT" \
     -H "Content-Type: application/json" \
     -d '{ "name": "billing-sync-prod (retired)", "allowedIps": ["192.0.2.1/32"] }'
   ```

   Requests with the old key now fail with `403 IP not allowed`.

## Revoking a key

There is no revoke API yet. Revocation is an operator action that sets `revoked_at`; the middleware then rejects the key with `401 Invalid API key` and the list endpoint hides it.

Operator procedure (production database access required, run inside a change ticket):

```sql
-- 1. Confirm the target by id and prefix, never by name alone
SELECT id, tenant_id, user_id, name, key_prefix, last_used_at, revoked_at
FROM api_keys
WHERE id = 'clx8w0g2e0000abcd1234efgh';

-- 2. Revoke
UPDATE api_keys
SET revoked_at = now(), updated_at = now()
WHERE id = 'clx8w0g2e0000abcd1234efgh' AND revoked_at IS NULL;
```

Revocation takes effect on the next request: the middleware looks the key up by hash on every call and does not cache it.

## Responding to a compromised key

Treat any key that appears in a repository, log, ticket, chat message, or client bundle as compromised, even if the exposure was brief.

1. **Contain (minutes).**
   - Immediately `PATCH` the key's `allowedIps` to `["192.0.2.1/32"]` (see the rotation section). This is self-service and blocks the key at once with `403`.
   - Ask an operator to set `revoked_at` (see [Revoking a key](#revoking-a-key)).
2. **Replace.** Create a new key, deploy it, and confirm the integration is healthy.
3. **Assess.**
   - Note the old key's `lastUsedAt`. Activity after the exposure time that your service did not generate is a strong signal of misuse.
   - Search API logs for the key's `apiKeyId` / the owning user's address over the exposure window and list every write (escrow creation, milestone actions, dispute actions).
4. **Remediate.** Remove the key from wherever it leaked (rewrite history or purge the log entry) and rotate any other secret stored alongside it.
5. **Record.** File an incident using `docs/incidents/templates/post-mortem.md` with the timeline, the key prefix (never the key), and the actions taken.

## Audit and monitoring

- **Weekly review.** List keys per integration user and check:
  - keys with `lastUsedAt` older than 30 days (unused keys should be revoked);
  - keys with an empty `allowedIps` in production;
  - keys whose name does not identify an owner.
- **Usage anomalies.** Alert on a `lastUsedAt` change for keys marked retired, and on spikes of `401 Invalid API key` or `403 IP not allowed` responses, which indicate a leaked key being tried from elsewhere or a misconfigured client.
- **Correlation.** Authenticated API-key requests carry `req.user.apiKeyId`; use it together with the gateway request id to trace activity back to a specific key.

## Error reference

| Status | Body                                          | Cause                                                      |
| ------ | --------------------------------------------- | ---------------------------------------------------------- |
| `401`  | `{ "error": "API key required" }`             | `x-api-key` header missing or not a string.                |
| `401`  | `{ "error": "Invalid API key" }`              | Unknown key, or the key has been revoked.                  |
| `403`  | `{ "error": "IP not allowed" }`               | Source IP is outside the key's `allowedIps`.               |
| `400`  | `{ "error": "name is required" }`             | Create request without a usable `name`.                    |
| `400`  | `{ "error": "Invalid CIDR/IP entries: ..." }` | One or more `allowedIps` entries are not valid CIDR or IP. |
| `404`  | `{ "error": "API key not found" }`            | `PATCH` on a key id the requesting user does not own.      |
| `500`  | `{ "error": "Authentication error" }`         | Unexpected failure during key lookup (check backend logs). |
