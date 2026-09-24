# Announcements: Targeting, Windows, and Tenant Scoping

Admins can broadcast short announcements (maintenance windows, incidents, policy changes) to every tenant or to a single tenant. This document describes the rules the backend applies, gives admin examples, and covers the edge cases, especially overlapping announcements.

Source: `backend/api/controllers/announcementController.js`, routes in `backend/api/routes/adminRoutes.js` and `backend/api/routes/announcementRoutes.js`, model `Announcement` in `backend/database/schema.prisma`.

## Contents

- [Data model](#data-model)
- [Endpoints](#endpoints)
- [Targeting rules](#targeting-rules)
- [Active windows](#active-windows)
- [Ordering and priority](#ordering-and-priority)
- [Dismissal](#dismissal)
- [Tenant scoping](#tenant-scoping)
- [Admin examples](#admin-examples)
- [Edge cases](#edge-cases)
- [Not yet supported](#not-yet-supported)

## Data model

| Field                    | Type                           | Notes                                                       |
| ------------------------ | ------------------------------ | ----------------------------------------------------------- |
| `id`                     | integer                        | Auto-increment                                              |
| `title`                  | string                         | Required, trimmed, non-empty                                |
| `body`                   | string                         | Required, trimmed, non-empty                                |
| `target`                 | `all` \| `tenant`              | Defaults to `all`                                           |
| `tenantId`               | string (tenant cuid) or `null` | Set only when `target` is `tenant`; always `null` for `all` |
| `startsAt`               | timestamp                      | Defaults to the time of creation                            |
| `endsAt`                 | timestamp                      | Required; must be strictly after `startsAt`                 |
| `createdBy`              | string                         | Free text from the request body, defaults to `"admin"`      |
| `deletedAt`              | timestamp or `null`            | Set by soft delete                                          |
| `createdAt`, `updatedAt` | timestamp                      | Managed by the database                                     |

## Endpoints

| Method and path                                                       | Auth     | Purpose                                                |
| --------------------------------------------------------------------- | -------- | ------------------------------------------------------ |
| `POST /api/admin/announcements`                                       | Admin    | Create                                                 |
| `PATCH /api/admin/announcements/:id`                                  | Admin    | Partial update                                         |
| `DELETE /api/admin/announcements/:id`                                 | Admin    | Soft delete                                            |
| `GET /api/v1/announcements/active` (also `/api/announcements/active`) | User JWT | Announcements visible to the caller's tenant right now |

Admin routes use the admin session token (`Authorization: Bearer <token>` from `POST /api/admin/auth/login`) or the `x-admin-api-key` header.

## Targeting rules

| `target` | `tenantId`                              | Visible to       |
| -------- | --------------------------------------- | ---------------- |
| `all`    | must be omitted (stored as `null`)      | every tenant     |
| `tenant` | required; must be an existing tenant id | only that tenant |

- Creating or updating to `target: "tenant"` without a `tenantId` returns `400` with `tenantId is required when target is "tenant"`.
- A `tenantId` that does not match an existing tenant returns `404 Tenant not found`. The existence check deliberately bypasses tenant scoping so an admin can target any tenant.
- When `target` is `all`, any `tenantId` sent on create is ignored and stored as `null`.
- An announcement targets exactly one tenant or all of them. To reach a subset of tenants, create one `tenant` announcement per tenant.

## Active windows

An announcement is **active** when all of these hold at request time:

```
deletedAt IS NULL  AND  startsAt <= now  AND  now <= endsAt
```

- Both bounds are **inclusive**: an announcement is visible at exactly `startsAt` and at exactly `endsAt`.
- `endsAt` must be strictly after `startsAt`, on create and on every update (the check uses the merged old and new values).
- `startsAt` defaults to "now" on create, so an announcement without `startsAt` is live immediately.
- Scheduling in the future is supported: set `startsAt` ahead. The announcement is stored but not returned until then.
- Windows in the past are accepted. An announcement whose `endsAt` has already passed is created successfully but never shown.
- Timestamps are parsed with JavaScript `Date`. Send ISO 8601 with an explicit offset (`2026-10-01T09:00:00Z`) to avoid server-timezone surprises. An unparseable value returns `400` with `<field> must be a valid date`.

## Ordering and priority

`GET /announcements/active` returns every active announcement for the caller, ordered by **`startsAt` descending** (most recently started first).

There is no priority, severity, or pinning field. When several announcements are active at once, the only lever for ordering is `startsAt`: to put an announcement on top, give it the latest start time. Clients that can show only one announcement should show the first element.

## Dismissal

The backend has **no dismissal state**: there is no per-user "dismissed" record, and every active announcement is returned on every call until its window ends or it is deleted.

Clients that let users dismiss an announcement must store that locally, keyed by `id` **and** `updatedAt`, so that an edited announcement is shown again:

```js
const dismissKey = (a) => `announcement-dismissed:${a.id}:${a.updatedAt}`;

const visible = active.filter((a) => !localStorage.getItem(dismissKey(a)));
const dismiss = (a) => localStorage.setItem(dismissKey(a), '1');
```

At the time of writing, neither `frontend/` nor `mobile/` consumes this endpoint yet.

## Tenant scoping

- `/api` requests pass through `tenantMiddleware`, which resolves the caller's tenant and rejects the request (`404` no tenant matched, `403` tenant suspended or inactive) before the announcement handler runs. `listActive` therefore always has a tenant.
- `listActive` returns `target = all` announcements plus `target = tenant` announcements whose `tenantId` equals the caller's tenant. A tenant never sees another tenant's targeted announcements.
- Announcements are stored outside the per-tenant data partition: admin handlers and `listActive` run with tenant scoping bypassed and apply the targeting filter themselves.

## Admin examples

**Global maintenance notice, scheduled**

```bash
curl -sS -X POST https://api.example.com/api/admin/announcements \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
        "title": "Scheduled maintenance",
        "body": "Escrow creation is paused 02:00–03:00 UTC on 1 Oct.",
        "target": "all",
        "startsAt": "2026-09-30T12:00:00Z",
        "endsAt": "2026-10-01T03:00:00Z",
        "createdBy": "ops:jane"
      }'
```

**Tenant-specific notice, live now**

```bash
curl -sS -X POST https://api.example.com/api/admin/announcements \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
        "title": "Invoice export delayed",
        "body": "Monthly exports for your workspace will arrive by 18:00 UTC.",
        "target": "tenant",
        "tenantId": "clx0tenant000abc",
        "endsAt": "2026-09-25T18:00:00Z"
      }'
```

**End an announcement early** (keeps it in history, unlike delete)

```bash
curl -sS -X PATCH https://api.example.com/api/admin/announcements/42 \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "endsAt": "2026-09-24T12:05:00Z" }'
```

The new `endsAt` must still be after the existing `startsAt`.

**Widen a tenant announcement to everyone**

```bash
curl -sS -X PATCH https://api.example.com/api/admin/announcements/42 \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "target": "all" }'
```

Switching to `all` clears `tenantId`.

**Delete**

```bash
curl -sS -X DELETE https://api.example.com/api/admin/announcements/42 \
  -H "Authorization: Bearer $ADMIN_TOKEN"
# { "ok": true }
```

## Edge cases

**Overlapping announcements**

| Situation                                             | Result                                                                            | Recommendation                                                                                   |
| ----------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Two `all` announcements with overlapping windows      | Both returned; the one with the later `startsAt` first                            | If one supersedes the other, end the old one (`PATCH endsAt`) rather than relying on order       |
| An `all` and a `tenant` announcement overlap          | The tenant sees both, ordered by `startsAt`; other tenants see only the `all` one | Tenant-specific text should not contradict the global one; end or edit the global one if it does |
| Same `startsAt` on two active announcements           | Relative order is not guaranteed                                                  | Offset `startsAt` by a second to force an order                                                  |
| Many simultaneous announcements                       | All are returned; there is no limit or pagination                                 | Keep at most a few active per tenant; clients should cap what they render                        |
| A follow-up posted while the original is still active | Both are visible, newest first                                                    | End the original when posting the follow-up                                                      |

**Updates**

- `PATCH` is partial: only the fields sent are validated and changed. Empty `title` or `body` is rejected; omitting them keeps the current values.
- Sending `tenantId` alone on an `all` announcement has no effect (it is only applied when the resulting target is `tenant`).
- Changing `target` to `tenant` requires a valid `tenantId`, either in the same request or already stored.
- Edits are visible to clients immediately; there is no response caching on `listActive`.

**Deletion**

- Delete is a soft delete (`deletedAt` is set). A deleted announcement is never returned by `listActive`.
- `PATCH` or `DELETE` on a deleted announcement returns `404 Announcement not found`. There is no restore endpoint; create a new announcement instead.

**Validation errors**

All validation failures return `400` with every problem listed:

```json
{ "error": "Validation failed", "details": ["title is required", "endsAt is required"] }
```

## Not yet supported

- Priority or severity levels (ordering is by `startsAt` only).
- Server-side, per-user dismissal.
- Targeting a list of tenants, roles, or individual users.
- An admin endpoint to list or search announcements (including past and deleted ones); use the database for now.
- Recording the authenticated admin as the author: `createdBy` is whatever the request body says.
