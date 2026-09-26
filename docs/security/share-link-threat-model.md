# Share-Link Threat Model

Public share links let an escrow participant give a read-only view of an
escrow to someone without an account (a client's finance team, an auditor, a
QR code on a completion certificate). This document records the security
assumptions, threats, mitigations and a checklist for reviewing changes.

Code: `backend/api/controllers/shareLinkController.js`, model
`EscrowShareLink`, routes in `backend/api/routes/escrowRoutes.js` and
`backend/server.js`. Also used by `backend/services/certificateService.js`.

---

## 1. How share links work

| Operation | Route | Who |
| --- | --- | --- |
| Create | `POST /api/escrows/:id/share` `{ expiresInDays? }` | Authenticated client or freelancer of the escrow |
| Revoke | `DELETE /api/escrows/:id/share/:token` | The link's creator only (soft delete: `revokedAt`) |
| Resolve | `GET /api/share/:token` | Intended to be public (see finding F1) |
| Certificate QR | `certificateService.resolveShareUrl` | Reuses an active link or creates one (`createdBy = requester` or `system:certificate`, 30-day TTL) |

- **Token:** `randomBytes(24).toString('base64url')`, i.e. 192 bits from the
  CSPRNG, 32 URL-safe characters, unique index on `token`.
- **Expiry:** `expiresAt = now + expiresInDays` (default 30). Expired links
  return `410`, revoked or unknown ones `404`.
- **Resolved view (allow-list):** escrow `id`, `status`, `totalAmount`,
  `remainingBalance`, `deadline`, `createdAt`, and milestones with `id`,
  `title`, `amount`, `status`. Participant addresses, descriptions,
  messages, evidence and dispute data are **not** returned.

---

## 2. Assumptions

1. Anyone holding the URL can read the view. The token is a bearer secret,
   and possession equals authorization.
2. Participants accept that the shared fields are visible to whoever they
   send the link to, and anyone it is forwarded to.
3. Escrow amounts and statuses are also public on-chain. The share link must
   not leak anything that is **not** already derivable on-chain, beyond
   milestone titles.
4. TLS terminates in front of the API; tokens are never sent over plain HTTP.

---

## 3. Tenant scoping

`/api` runs `tenantMiddleware`, which resolves the tenant from
`x-tenant-id`, `x-tenant-slug` or the request host. It then runs the handler
in that tenant's context. The Prisma extension in `backend/lib/prisma.js`
adds `tenantId` to queries on tenant-scoped models, and `Escrow` is one of
them.

- The escrow lookup in `resolveShareLink` is therefore tenant-scoped. A token
  resolved on another tenant's host finds the link but not the escrow, and
  returns `404`.
- `EscrowShareLink` itself is **not** in `TENANT_SCOPED_MODELS` and has no
  `tenantId` column. Isolation relies on the escrow lookup. Any new query that
  returns link rows directly, such as listing links, must filter through the
  escrow's tenant.

---

## 4. Threats and mitigations

| # | Threat | Mitigation | Status |
| --- | --- | --- | --- |
| T1 | Token guessing / enumeration | 192-bit CSPRNG tokens make brute force infeasible. Unknown and revoked tokens return the same `404`, so their states can't be told apart. | ✅ |
| T2 | High-rate probing, scraping or DoS of the resolver | Gateway per-user limiter (`createPerUserRateLimiter`), keyed by user or `ip:<addr>` for anonymous callers | ⚠️ See F1. Once the route is public, it needs an explicit per-IP limit. |
| T3 | Token leakage (Referer, logs, analytics, forwarding, screenshots) | Short default TTL (30 days), revocation, minimal view. Tokens are path parameters. | ⚠️ Request logs include the path. Redact `/api/share/*` in gateway logs (F3). |
| T4 | Over-exposure of escrow data | Explicit `select` allow-list in `resolveShareLink`; no participant addresses | ✅ Keep the allow-list; never spread the full escrow row. |
| T5 | Cross-tenant access | Tenant-scoped escrow lookup (section 3) | ✅ |
| T6 | Link outliving the relationship (dispute, party change, cancellation) | Creator can revoke. Links expire. | ⚠️ Links are not revoked automatically when an escrow is disputed or cancelled (F4). |
| T7 | Non-creator revoking or creating links | Create requires being a participant; revoke requires `createdBy === caller` | ✅ The other participant cannot revoke a link the counterparty created (F5). |
| T8 | Unbounded or invalid expiry | Default 30 days | ❌ `expiresInDays` is not validated (F2). |
| T9 | Cache poisoning / shared caches serving stale data after revocation | Resolver responses are not wrapped in `cacheResponse` | ✅ Keep it uncached, or cache for ≤ 60 s with the token in the key. |

### Open findings

- **F1:** `GET /api/share/:token` is registered as public in `server.js`, but
  `/share` is not in the gateway's `PUBLIC_ROUTES`. Unauthenticated callers
  therefore get `401`. Adding it to `PUBLIC_ROUTES` makes the resolver
  actually public; it then needs a dedicated per-IP limit (e.g. 30 req/min)
  in addition to the gateway limiter.
- **F2:** `expiresInDays` is passed to `parseInt` without bounds. Values like
  `"abc"` produce an invalid date (500), negative values create an expired
  link, and very large values create effectively permanent links. Validate it
  as an integer between 1 and 90.
- **F3:** tokens appear in request paths and may be logged by the gateway
  logger and reverse proxies. Mask the last path segment for `/api/share/*`.
- **F4:** consider revoking active links when an escrow is cancelled, and
  hiding milestone titles while disputed.
- **F5:** decide whether either participant should be able to revoke any link
  for their escrow.

---

## 5. Reviewer checklist

Use this for any PR touching share links, `resolveShareLink`, the certificate
QR flow, the gateway public-route list or tenant scoping.

- [ ] Tokens still come from `crypto.randomBytes` with ≥ 128 bits of entropy
      (currently 192). No `Math.random`, no ids or timestamps in tokens.
- [ ] The resolver still uses an explicit `select`. No new field added
      without checking it is safe for anonymous viewers (no addresses, emails,
      messages, evidence, dispute details or KYC data).
- [ ] Revoked, unknown and cross-tenant tokens return the same `404` body.
- [ ] Expired tokens return `410` and no escrow data.
- [ ] `expiresInDays` (or any new expiry input) is validated and capped.
- [ ] Any new query on `EscrowShareLink` is scoped through the escrow's tenant.
- [ ] Create requires being a participant; revoke rules are intentional.
- [ ] The resolver is rate-limited per IP and not cached beyond the revocation SLA.
- [ ] Tokens are not written to logs, analytics or error trackers.
- [ ] Tests cover: valid, expired, revoked, unknown, cross-tenant, and
      non-participant create.
