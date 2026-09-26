# Mobile Offline Cache Compatibility Guide

The mobile app (`mobile/`) stores API responses in SQLite so screens keep
working without a network connection. The cached JSON can be much older than
the backend that is live when the app next opens. This guide defines how to
change API payloads without breaking cached data. It complements
[`api-versioning.md`](./api-versioning.md), which covers online clients.

---

## 1. How the cache works today

`mobile/services/offlineCache.ts`:

- `escrow_cache(id, data, entity_type, cached_at)`: `data` is the API
  response object stored verbatim with `JSON.stringify`.
- `cache_meta.schema_version` vs `CACHE_VERSION` (currently `1`): when the
  app's `CACHE_VERSION` is higher than the stored value, the whole
  `escrow_cache` table is dropped and recreated.
- TTLs per `entity_type`: `escrow` 5 min, `milestone` 2 min, `reputation`
  30 min, default 5 min. Expired rows are deleted on read.
- Unparseable rows are deleted on read ("corrupted cache entry").
- `useEscrows` writes every escrow from `GET /api/escrows` into the cache and
  reads `getCachedEscrows('escrow')` when offline or when the request fails.

The cached shape is the mobile `Escrow` / `Milestone` interfaces in
`mobile/lib/api.ts`. There is no per-row payload version, so the only
compatibility lever is `CACHE_VERSION`.

> `offlineCache.ts` currently contains two cache implementations (a second
> module using `ste_offline.db` / `escrows` is appended after the first).
> Treat the `escrow_cache` implementation above as the one in use, and
> remove the duplicate before relying on this guide for new cache types.

---

## 2. Required fields

Cached objects are rendered offline without re-fetching, so these fields must
always be present with the same type and meaning. Removing or retyping any of
them is a breaking change for the offline cache.

| Entity | Required fields |
| --- | --- |
| Escrow | `id` (string), `clientAddress`, `freelancerAddress`, `tokenAddress`, `totalAmount` (decimal string), `remainingBalance` (decimal string), `status` (`Active` \| `Completed` \| `Disputed` \| `Cancelled`), `createdAt`, `updatedAt` (ISO 8601) |
| Milestone | `id` (number), `milestoneIndex`, `escrowId` (string), `title`, `amount` (decimal string), `status` |

Rules:

- Amounts stay **decimal strings** (i128-safe), never numbers.
- Ids that can exceed 2^53 (escrow ids are `BigInt` on the backend) stay strings.
- Timestamps stay ISO 8601 UTC strings.
- New enum values (e.g. a new escrow `status`) must be handled by the app with
  a fallback ("Unknown status") **before** the backend starts sending them.

---

## 3. Change classification

| Change | Online clients | Offline cache | Action |
| --- | --- | --- | --- |
| Add an optional field | Non-breaking | Non-breaking: old rows lack it, so the app must treat it as optional | Ship. Mark the field optional (`?`) in `mobile/lib/api.ts`. |
| Add a field the app will **require** | Non-breaking | **Breaking** for old rows | Bump `CACHE_VERSION` in the app release that starts requiring it |
| Remove / rename a required field | Breaking (new API version) | Breaking | New API version (`api-versioning.md`) **and** bump `CACHE_VERSION` |
| Change a field's type or format | Breaking | Breaking | Same as above |
| Change a field's meaning (e.g. units) | Breaking | Breaking, and silently wrong | Rename the field instead; never reuse a name with new semantics |
| Add an enum value | Non-breaking if clients have a fallback | Non-breaking | App fallback first, backend second |
| Change TTLs | n/a | Non-breaking | Ship |

---

## 4. Deprecation policy

1. **Announce:** mark the field deprecated in the OpenAPI spec and in
   `mobile/lib/api.ts` (`/** @deprecated */`). Versioned endpoints send
   `Deprecation`, `Sunset` and `Link` headers via
   `backend/api/middleware/deprecation.js`.
2. **Dual-write:** the backend keeps sending the old field alongside the new
   one for at least **two mobile releases or 90 days**, whichever is longer.
   Mobile users update slowly, and cached rows outlive the app version that
   wrote them.
3. **Migrate the app:** a mobile release reads the new field, falling back to
   the old one for rows cached earlier.
4. **Bump the cache:** the release that stops reading the old field bumps
   `CACHE_VERSION`, so old rows are dropped rather than misread.
5. **Remove:** the backend drops the old field only after the sunset date,
   and only once analytics show the old app versions are below the agreed
   threshold.

The mobile app currently calls unversioned `/api/escrows`. Move it to
`/api/v1/escrows` before the first breaking change so deprecation headers
apply to it.

---

## 5. Migration examples

### 5.1 Adding an optional field (no cache bump)

Backend adds `title` to escrow responses.

```ts
// mobile/lib/api.ts
export interface Escrow {
  // ...
  title?: string; // optional: rows cached before this release lack it
}

// render
<Text>{escrow.title ?? `Escrow #${escrow.id}`}</Text>
```

### 5.2 Renaming a field (dual-write + cache bump)

`briefHash` becomes `briefCid`.

1. Backend: send both `briefHash` and `briefCid` (same value).
2. Mobile release N reads both:
   ```ts
   const cid = escrow.briefCid ?? escrow.briefHash;
   ```
3. Mobile release N+2 reads only `briefCid` and bumps the cache:
   ```ts
   const CACHE_VERSION = 2; // drops rows that only have briefHash
   ```
4. Backend removes `briefHash` after the sunset date.

### 5.3 Changing a type (new field name)

`deadline` changing from an ISO string to a ledger number must not reuse the
name. Add `deadlineLedger: number`, dual-write, then deprecate `deadline`
following 5.2.

---

## 6. Test expectations

Any PR that changes an escrow or milestone response, or `offlineCache.ts`,
must include:

- [ ] **Old-row read test:** a fixture JSON captured from the previous
      response shape, written with `cacheEscrow`, read back with
      `getCachedEscrow` and rendered without crashing (missing new fields
      handled).
- [ ] **Cache bump test** (when `CACHE_VERSION` changes): start with
      `schema_version` = old value and existing rows. After init, the rows are
      gone and `schema_version` = new value.
- [ ] **Backend contract test:** the required fields in section 2 are present
      with the right types in `GET /api/escrows` and `GET /api/escrows/:id`.
- [ ] **Corrupted row test:** invalid JSON in `data` is deleted, not thrown.
- [ ] The OpenAPI spec and `mobile/lib/api.ts` are updated in the same PR.
