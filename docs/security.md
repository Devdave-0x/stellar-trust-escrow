# Security Reference — Stellar Crowd Fund Escrow

This document describes the threat model, authentication flow, key management procedures, rate-limiting configuration, and known attack vectors with their mitigations for the Stellar Crowd Fund Escrow platform.

---

## Threat Model

### Protected Assets

| Asset | Where it lives | Why it matters |
|---|---|---|
| **JWT secrets** (`JWT_SECRET`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`) | Server environment / Vault | Compromise allows arbitrary token forgery |
| **Stellar private keys** (user wallets, `RELAYER_SECRET_KEY`) | Client devices / server env | Compromise allows unauthorized contract calls and fund theft |
| **Contract funds** | Soroban smart contract on-chain | Direct financial loss if escrow logic is bypassed |
| **PII** (Stellar addresses, IP addresses, email addresses) | PostgreSQL, Redis, logs | Regulatory exposure; deanonymization of pseudonymous participants |
| **IPFS evidence files** | IPFS network + hash stored on-chain | Tampering breaks dispute audit trail |
| **Webhook signing secrets** | PostgreSQL (per-subscription) | Compromise allows forged webhook deliveries |

### Threat Actors

**External attackers**
Unauthenticated or authenticated users attempting to exfiltrate funds, impersonate other participants, or degrade service availability. Primary vectors: API abuse, injection attacks, JWT forgery, rate-limit bypass.

**Malicious insiders**
Operators or developers with direct database or server access. Mitigated by structured audit logging of all admin actions, secret storage in Vault rather than application config, and multi-tenancy isolation at the query layer.

**Compromised contractors**
A freelancer whose Stellar keypair has been stolen. They can submit milestones but cannot approve them — milestone approval is gated to the client address on-chain. A compromised contractor cannot extract funds that have not yet been approved.

**Compromised clients**
A client whose keypair is stolen can approve milestones prematurely, releasing funds to the contractor. On-chain state is immutable once approved; recovery requires a dispute raised before the final milestone is approved.

### Trust Boundaries

```
┌──────────────────────────────────────────────────────────────┐
│  Client Layer (browser / mobile)                             │
│  — Untrusted input origin                                    │
│  — Freighter wallet signs transactions locally               │
│  — JWT stored in memory (web) or MMKV (mobile)              │
├──────────────────────────────────────────────────────────────┤
│  BOUNDARY 1: HTTPS + JWT Bearer token                        │
│  All requests validated at auth middleware before routing    │
├──────────────────────────────────────────────────────────────┤
│  API Layer (Express.js)                                      │
│  — Validates all inputs with express-validator               │
│  — Enforces tenant scoping on every DB query                 │
│  — Does not hold private keys (except RELAYER_SECRET_KEY     │
│    for meta-transactions, stored in Vault)                   │
├──────────────────────────────────────────────────────────────┤
│  BOUNDARY 2: Prisma parameterized queries / Redis commands   │
├──────────────────────────────────────────────────────────────┤
│  Data Layer (PostgreSQL + Redis + IPFS)                      │
│  — PostgreSQL: row-level tenant isolation via Prisma where   │
│  — Redis: cache keys prefixed by tenantId                    │
│  — IPFS: content-addressed; hashes verified on retrieval     │
├──────────────────────────────────────────────────────────────┤
│  BOUNDARY 3: Soroban RPC (signed XDR transactions)           │
│  Transactions must be signed by the correct Stellar keypair  │
│  and simulated before submission                             │
├──────────────────────────────────────────────────────────────┤
│  Blockchain Layer (Stellar / Soroban)                        │
│  — Contract enforces caller identity for every write call    │
│  — State transitions are final and publicly auditable        │
└──────────────────────────────────────────────────────────────┘
```

---

## Authentication Flow

### Wallet-Based Nonce/Sign Flow

Authentication is passwordless. Identity is proved by signing a server-issued nonce with the user's Stellar private key.

```
1. Client → POST /api/auth/nonce  { address: "G..." }
           ← { nonce: "<random 32-byte hex>", expiresAt: "<ISO timestamp>" }

2. Client signs nonce locally with Stellar private key (never sent to server)
           → POST /api/auth/verify  { address: "G...", signature: "<signed nonce>" }
           ← { accessToken: "<JWT>", refreshToken: "<JWT>", expiresIn: 900 }

3. Client sends Bearer token on every subsequent request
           Authorization: Bearer <accessToken>

4. On expiry → POST /api/auth/refresh  { refreshToken: "<JWT>" }
             ← { accessToken: "<new JWT>", refreshToken: "<rotated JWT>" }

5. Logout   → POST /api/auth/logout  { refreshToken: "<JWT>" }
            ← revokes refresh token in DB; subsequent refresh attempts rejected
```

**Nonce properties:**
- Cryptographically random; stored server-side with a short TTL (5 minutes)
- Consumed on first use — a replayed `verify` request with the same nonce is rejected
- Bound to the requesting IP to limit nonce-harvesting abuse

**Token properties:**
- Access tokens expire in **15 minutes**
- Refresh tokens expire in **7 days**; rotation on every use (sliding window)
- Both tokens are signed with separate secrets (`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`)

### MFA

When MFA is enabled for an account, the `verify` step returns a short-lived MFA challenge token rather than the full access token. The client must submit a valid TOTP code:

```
POST /api/auth/mfa/verify  { mfaToken: "<challenge JWT>", code: "<6-digit TOTP>" }
← { accessToken: "<JWT>", refreshToken: "<JWT>" }
```

The MFA challenge token is signed with a **separate signing secret** from the access and refresh tokens. This ensures that a leaked MFA token cannot be used as an access token and vice versa.

### Automatic 401 Handling on Mobile

The mobile Axios client intercepts every `401 Unauthorized` response, immediately clears the stored access and refresh tokens from MMKV, and redirects the user to the login screen. This prevents silent retry loops that could lock an account or consume rate-limit quota after a token has been revoked.

---

## Key Management

### JWT Secrets

Three separate secrets are required:

| Variable | Purpose |
|---|---|
| `JWT_SECRET` | Legacy / general signing (retained for backward compatibility) |
| `JWT_ACCESS_SECRET` | Signs access tokens (15-minute lifetime) |
| `JWT_REFRESH_SECRET` | Signs refresh tokens (7-day lifetime) |

**Rules:**
- All three are **required environment variables**. The API server calls `process.exit(1)` with a descriptive error message at startup if any of them are missing or empty. There are no hardcoded fallbacks.
- Generate each with: `openssl rand -hex 64`
- Never reuse secrets between `development`, `staging`, and `production` environments.
- Never commit `.env` files. The `.gitignore` at the repository root excludes all `.env*` files.

### Secret Rotation Procedure

1. Generate a new secret value: `openssl rand -hex 64`
2. Add the new value to your secrets store (Vault or environment) under a versioned key
3. Perform a rolling restart of API instances — the new secret takes effect immediately
4. All existing tokens signed with the old secret become invalid; users will be prompted to re-authenticate
5. Remove the old secret version from Vault after confirming no active sessions depend on it
6. Rotate `JWT_REFRESH_SECRET` and `JWT_ACCESS_SECRET` on separate schedules to avoid simultaneous invalidation of all sessions

### HashiCorp Vault Integration

Set `SECRETS_BACKEND=vault` to enable Vault-backed secret retrieval at startup.

```env
SECRETS_BACKEND=vault
VAULT_ADDR=https://vault.internal:8200
VAULT_ROLE_ID=<AppRole role_id>
VAULT_SECRET_ID=<AppRole secret_id>
VAULT_SECRET_PATH=secret/data/stellar-escrow/production
```

The API server authenticates to Vault using the **AppRole** auth method on startup, fetches all required secrets into process memory, and does not write them to disk. The `secret_id` should be wrapped and short-lived.

If `SECRETS_BACKEND` is not set, the server reads secrets directly from environment variables (suitable for local development and container environments that inject secrets at runtime).

### RELAYER_SECRET_KEY

`RELAYER_SECRET_KEY` is the Stellar secret key used by the API server to sign meta-transactions on behalf of users who do not hold XLM for fee payment. It must be stored in Vault (not in `.env` in production) and rotated quarterly or immediately upon any suspected compromise.

The relayer account should hold only the minimum XLM balance required for fee payment — it must never hold escrowed funds.

### .env File Policy

- `.env` files are listed in `.gitignore` and must never be committed to the repository
- `.env.example` files contain only placeholder values (no real secrets) and are safe to commit
- The pre-push Git hook scans staged files for common secret patterns and aborts the push if a potential secret is detected

---

## Rate Limiting

Rate limits are enforced at the API middleware layer using a **sliding-window** algorithm backed by Redis. If Redis is unavailable, the middleware falls back to an in-memory sliding window (per-process; not shared across horizontally scaled instances).

### Authenticated Tier Limits

| Tier | Requests / minute | Burst cap / second |
|---|---|---|
| `free` | 60 | 10 |
| `basic` | 120 | 20 |
| `premium` | 300 | 50 |
| `enterprise` | 1 000 | 150 |
| `admin` | 5 000 | 500 |

Tier is determined from the JWT claims on the authenticated request. Exceeding the limit returns `429 Too Many Requests` with a `Retry-After` header.

### Public Endpoint Limits

Unauthenticated endpoints are limited by both IP address and (where a Stellar address is provided in the request body) by Stellar address:

| Scope | Limit |
|---|---|
| Per IP address | 100 requests / minute |
| Per Stellar address | 50 requests / minute |

### Specific Endpoint Limits

| Endpoint | Limit |
|---|---|
| `POST /api/webhooks/subscribe` | 10 requests / 10 minutes per authenticated address |

### Redis-Backed Sliding Window

Each limit window is stored as a sorted set in Redis keyed by `ratelimit:<tenantId>:<userId>:<route>`. Entries are scored by timestamp; the middleware counts entries within the current window and atomically adds the new request in a single Lua script to avoid race conditions.

On Redis failure, the in-memory fallback uses the same sliding-window logic within the current process. In a multi-instance deployment, the in-memory fallback allows up to `instances × limit` requests — acceptable degradation during a Redis outage, not a security bypass.

---

## Attack Vectors and Mitigations

### SQL Injection

**Vector:** Malicious input in query parameters or request bodies passed to database queries.

**Mitigation:** All database access goes through Prisma ORM, which uses fully parameterized queries. Raw SQL is not used anywhere in the codebase. Unknown or invalid enum values (escrow status, sort fields) are rejected with `400 Bad Request` before reaching the data layer — they are never passed to Prisma as raw strings.

---

### Cross-Site Scripting (XSS)

**Vector:** Stored or reflected malicious scripts via user-supplied input fields.

**Mitigation:** All request body fields and query parameters are validated and sanitized by `express-validator` rules defined in `backend/api/middleware/validation.js` before reaching controllers. Search queries are additionally capped at **200 characters** and stripped of ASCII control characters (`\x00`–`\x1F`, `\x7F`) before being forwarded to Elasticsearch or Prisma.

---

### Server-Side Request Forgery (SSRF)

**Vector:** An attacker registers a webhook pointing to an internal IP address or metadata endpoint, causing the server to make requests to internal infrastructure.

**Mitigation:**
- Webhook subscriber URLs must use the `https://` scheme — plain HTTP is rejected at registration time.
- URLs resolving to private IP ranges (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `127.0.0.0/8`, `169.254.0.0/16`) are rejected before the first delivery attempt.
- The subscribe endpoint is rate-limited to 10 requests per 10 minutes per address to limit reconnaissance attempts.

---

### JWT Attacks

**Vector:** Token forgery, algorithm confusion (`alg: none`), secret brute-force, or token reuse after logout.

**Mitigations:**
- Access tokens and refresh tokens are signed with **separate secrets** (`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`). Compromising one secret does not compromise the other token type.
- The MFA challenge token uses a third distinct secret.
- No hardcoded fallback secrets exist anywhere in the codebase — the process exits at startup if any secret is missing.
- Access tokens are short-lived (**15 minutes**), limiting the window of use after a token is stolen.
- Refresh tokens are rotated on every use. A reused refresh token (detected by token family tracking) immediately invalidates the entire token family.
- The `alg` field is validated on every token verification call; `none` and symmetric-to-asymmetric downgrade attempts are rejected.

---

### Replay Attacks

**Vector:** An attacker captures a `POST /api/auth/verify` request and replays it to obtain tokens.

**Mitigation:** Each nonce is stored server-side and marked as consumed on first use. A replayed verify request with an already-consumed or expired nonce returns `401 Unauthorized`. Nonces expire after 5 minutes regardless of use.

---

### Cross-Tenant Data Leak

**Vector:** A request authenticated under tenant A retrieves or modifies data belonging to tenant B.

**Mitigation:** Every Prisma query that touches tenant-scoped data includes a `where: { tenantId: req.tenant.id }` clause enforced by middleware before the controller runs. Cache keys in Redis are prefixed with `tenantId` and `tenantSlug`. Analytics metrics are namespaced per tenant. A cross-tenant leak would require simultaneously bypassing the Prisma middleware clause on every affected query and the cache key namespace — there is no single point of failure.

---

### Rate Limit Bypass

**Vector:** An attacker distributes requests across multiple IPs or rotates identifiers to evade per-key rate limits.

**Mitigation:** Limits are applied at multiple dimensions simultaneously (IP, Stellar address, authenticated user ID, tenant). The Redis-backed sliding window uses atomic Lua scripts, removing race conditions that could allow bursts through a non-atomic implementation. Authenticated limits are tied to the JWT claims and cannot be spoofed without a valid signed token.

---

### Admin Abuse

**Vector:** An operator with admin access abuses privileged endpoints (rate-limit overrides, user bans, dispute resolutions) without accountability.

**Mitigation:** Every admin action — including rate-limit overrides, user bans, and dispute resolutions — emits a structured `admin_action` log event containing:
- Performer's Stellar address
- Action type and target resource ID
- Previous value (for mutations like rate-limit changes) alongside the new value
- ISO 8601 timestamp and correlation ID

These events are written to the immutable audit log and cannot be deleted through the application API. Changing a rate limit records both the old and new values to support forensic comparison.

---

### Contract Front-Running

**Vector:** An attacker observes a pending Soroban transaction in the mempool and submits a competing transaction with higher fees to execute first.

**Mitigation:** All Soroban write calls (milestone approval, dispute resolution, escrow creation) require a `simulateTransaction` RPC call before submission. The simulation validates the current contract state and generates the exact fee and footprint for the transaction. Transactions that arrive out of order fail contract-level authorization checks (caller identity is verified on-chain for every write function). The on-chain state machine enforces strict sequencing — approving a milestone that has not been submitted is a contract error regardless of transaction ordering.

---

### Force-Push to Main

**Vector:** A developer force-pushes to `main`, rewriting history and potentially removing audit-trail commits or introducing unauthorized code.

**Mitigation:** The `.husky/pre-push` hook enforces the following on every push:
- The full 425-test suite must pass; a failing test aborts the push.
- Direct pushes to `main` require the committer email to be on the authorized list.
- Force-push (`--force`, `--force-with-lease`) to `main` is unconditionally rejected by the hook.
- Branch deletions on `main` are blocked.
- Branch names must match the approved pattern (`feat/`, `fix/`, `refactor/`, `hotfix/`, `release/`, `docs/`, `chore/`, `test/`, or the protected branch names `main`, `develop`, `live`).

---

## Reporting a Vulnerability

If you discover a security issue, do not open a public GitHub issue. Contact the maintainers directly at the address listed in `SECURITY.md` (repository root). Please include:

1. A description of the vulnerability and affected component
2. Steps to reproduce
3. Your assessment of impact and exploitability
4. Any suggested mitigation

We aim to acknowledge reports within 48 hours and provide a resolution timeline within 7 days.
