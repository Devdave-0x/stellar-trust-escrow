# Dispute Timeline Data Contract

This document is the shared contract for the dispute timeline consumed by the backend, frontend, and mobile clients, and for how on-chain contract events feed it. It describes the current implementation in `backend/services/disputeTimelineService.js` and `backend/workers/escrowIndexer.js`.

The timeline is **derived, not stored**. There is no timeline table: every request aggregates events from the `disputes`, `dispute_evidence`, `dispute_appeals`, and `escrows` tables.

## Contents

- [Endpoint](#endpoint)
- [Event envelope](#event-envelope)
- [Event types](#event-types)
- [Ordering rules](#ordering-rules)
- [Source of each event](#source-of-each-event)
- [On-chain events and indexing](#on-chain-events-and-indexing)
- [Anomaly handling](#anomaly-handling)
- [Compatibility rules](#compatibility-rules)
- [Consumer checklist](#consumer-checklist)

## Endpoint

```
GET /api/disputes/:id/timeline
```

- `:id` is the numeric **dispute id** (not the escrow id). A non-numeric id returns `400 VALIDATION_ERROR`.
- The lookup is scoped to the caller's tenant. A dispute in another tenant, or one that does not exist, returns `404 NOT_FOUND`.
- Responses are cached (`TTL.DETAIL`) under the tag `dispute:<id>`. Writes that invalidate that tag make new events visible; otherwise expect up to one cache TTL of staleness.

Success response (standard envelope from `backend/lib/respond.js`):

```json
{
  "data": {
    "events": [
      {
        "event_type": "filed",
        "actor": "GCLIENT...",
        "timestamp": "2026-01-02T00:00:00.000Z",
        "metadata": { "disputeId": 7, "escrowId": "42" }
      }
    ]
  },
  "meta": { "requestId": "…", "timestamp": "2026-09-24T10:00:00.000Z" }
}
```

## Event envelope

Every event has exactly these four top-level fields:

| Field        | Type              | Required | Notes                                                                                    |
| ------------ | ----------------- | -------- | ---------------------------------------------------------------------------------------- |
| `event_type` | string (enum)     | yes      | One of the values in [Event types](#event-types).                                        |
| `actor`      | string            | yes      | Stellar address (`G...`) of who caused the event, or the literal `"system"`.             |
| `timestamp`  | string (ISO 8601) | yes      | UTC, millisecond precision, serialized from a database `DateTime`.                       |
| `metadata`   | object            | yes      | Type-specific payload. Always an object, never `null`. Fields are listed per type below. |

Numeric identifiers that are `BigInt` in the database (escrow ids) are serialized as **strings**. Amounts (`clientAmount`, `freelancerAmount`) are stored as strings and must be treated as decimal strings, never parsed into floating point.

## Event types

The tie-break rank is used only when two events have the same timestamp (see [Ordering rules](#ordering-rules)).

<!-- drift:dispute-timeline-event-types:start -->

| `event_type`         | Tie-break rank | `actor`                             | `metadata` fields                                                                            |
| -------------------- | -------------- | ----------------------------------- | -------------------------------------------------------------------------------------------- |
| `filed`              | 0              | Address that raised the dispute     | `disputeId` (number), `escrowId` (string)                                                    |
| `evidence_submitted` | 1              | Address that submitted the evidence | `evidenceId` (number), `evidenceType` (string), `role` (string)                              |
| `arbiter_assigned`   | 2              | Arbiter address                     | `arbiterAddress` (string)                                                                    |
| `arbiter_ruling`     | 3              | Address that resolved the dispute   | `resolutionType` (string or null), `resolution` (string or null)                             |
| `appeal_filed`       | 4              | Address that filed the appeal       | `appealId` (number), `reason` (string), `status` (string)                                    |
| `resolved`           | 5              | Resolver address, or `"system"`     | `resolution`, `resolutionType`, `autoResolved` (boolean), `clientAmount`, `freelancerAmount` |

<!-- drift:dispute-timeline-event-types:end -->

Field value sets:

- `evidenceType`: `text` | `url` | `hash` | `file` | `image`
- `role`: `client` | `freelancer` | `arbiter` | `admin`
- `resolutionType`: `AUTO` | `MANUAL` | `ESCALATED` (or `null` if not recorded)
- appeal `status`: defaults to `pending`; other values are set by the appeal review flow

The table above is checked against the service's `EVENT_ORDER` by `backend/tests/disputeTimelineDocs.test.js`. Adding, removing, or re-ranking an event type in code without updating this table fails that test.

## Ordering rules

1. Events are sorted by `timestamp` ascending (oldest first).
2. Events with an identical timestamp are ordered by tie-break rank, lowest first. In practice this matters for `arbiter_ruling` and `resolved`, which share the dispute's `resolvedAt`: the ruling always comes before the resolution.
3. Among events with the same timestamp **and** the same type (for example two evidence items stamped in the same millisecond), relative order is the database return order and is **not guaranteed**. Clients must not depend on it.
4. `arbiter_assigned` uses the escrow's `createdAt`, because the arbiter is fixed at escrow creation. It therefore usually appears **before** `filed`. This is expected, not an anomaly.

## Source of each event

| `event_type`         | Emitted when                                                           | Source                                    |
| -------------------- | ---------------------------------------------------------------------- | ----------------------------------------- |
| `filed`              | Always (one per dispute)                                               | `disputes.raised_by_address`, `raised_at` |
| `evidence_submitted` | Once per evidence row                                                  | `dispute_evidence`                        |
| `arbiter_assigned`   | The escrow has an `arbiterAddress`                                     | `escrows.arbiter_address`, `created_at`   |
| `appeal_filed`       | Once per appeal row                                                    | `dispute_appeals`                         |
| `arbiter_ruling`     | `resolvedAt` is set **and** `resolvedBy` is present and not `"system"` | `disputes.resolved_by`, `resolved_at`     |
| `resolved`           | `resolvedAt` is set                                                    | `disputes.*` resolution columns           |

Cardinality per dispute: exactly one `filed`; at most one `arbiter_assigned`, `arbiter_ruling`, and `resolved`; zero or more `evidence_submitted` and `appeal_filed`.

## On-chain events and indexing

The escrow contract emits these dispute-related events (see `docs/event-schema.md` and `contracts/escrow_contract/src/events.rs`):

| Contract event          | Topic     | Data                                                               | Indexer behaviour                                                                                                                    |
| ----------------------- | --------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| Dispute raised          | `dis_rai` | `Address raised_by`                                                | Sets escrow status to `Disputed` and upserts a `disputes` row (`raisedByAddress`, `raisedAt` = ledger close time). Produces `filed`. |
| Dispute resolved        | `dis_res` | `(i128 client_amount, i128 freelancer_amount)`                     | Sets escrow status to `Completed`. **Does not** update the `disputes` row (see anomalies).                                           |
| Dispute timeout claimed | `dis_to`  | `(Address claimed_by, i128 client_amount, i128 freelancer_amount)` | Not handled; logged as an unknown topic.                                                                                             |
| Escalated to governance | `gov_esc` | `(Address initiator, u64 proposal_id, i128 amount)`                | Not handled; logged as an unknown topic.                                                                                             |
| Milestone disputed      | `mil_dis` | `(u32 milestone_id, Address raised_by)`                            | Not handled by the timeline.                                                                                                         |

Resolution, evidence, and appeal data reach the timeline through the backend API (dispute resolution, evidence upload, and appeal endpoints), not through the indexer.

## Anomaly handling

Clients must render the timeline defensively. These situations occur with the current implementation:

| Situation                                                                         | What the API returns                                                  | Client handling                                                                                          |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Dispute resolved on-chain (`dis_res`) but never through the API                   | No `arbiter_ruling` or `resolved` event; escrow status is `Completed` | If the escrow is `Completed` but there is no `resolved` event, show "Resolved on-chain" without amounts. |
| Timeout claimed (`dis_to`) or governance escalation (`gov_esc`)                   | No timeline event for it                                              | Do not infer these from the timeline; read escrow status separately.                                     |
| `arbiter_assigned` earlier than `filed`                                           | Normal ordering (arbiter fixed at escrow creation)                    | Render as-is; label it "Arbiter assigned at escrow creation" if needed.                                  |
| Escrow has no arbiter                                                             | No `arbiter_assigned` event                                           | Treat as optional.                                                                                       |
| Auto-resolution (`resolvedBy` is `"system"` or missing)                           | `resolved` only, `actor` is `"system"`, no `arbiter_ruling`           | Show as automatic resolution.                                                                            |
| Indexed dispute with an empty raiser                                              | `filed.actor` is `""`                                                 | Show "Unknown" instead of an empty address.                                                              |
| Evidence or appeal timestamp earlier than `filed` (clock skew or backfilled data) | Sorted strictly by timestamp, so it appears before `filed`            | Do not reorder on the client; display the timestamps as returned.                                        |
| Unknown `event_type`                                                              | Possible after a future server release                                | Ignore or render generically; never crash (see compatibility rules).                                     |
| Dispute not found / other tenant                                                  | `404 NOT_FOUND`                                                       | Show "dispute not found"; do not retry.                                                                  |

## Compatibility rules

These rules keep backend, frontend, and mobile releases independently deployable.

**Server (producer) must:**

1. Keep the four envelope fields and their types stable. Renaming or removing one is a breaking change requiring a new API version.
2. Never change the meaning or type of an existing `metadata` field. Add new fields instead.
3. Only add new `event_type` values with a new tie-break rank, and update this document and `EVENT_ORDER` in the same change (the drift test enforces it).
4. Keep ordering deterministic under the rules above.
5. Serialize `BigInt` ids and amounts as strings.

**Clients (consumers) must:**

1. Ignore unknown `event_type` values and unknown `metadata` fields.
2. Treat every `metadata` field as optional and possibly `null`.
3. Use the server's order rather than re-sorting (re-sorting by timestamp alone loses the tie-break).
4. Parse `timestamp` as ISO 8601 UTC and format it in the viewer's locale.
5. Treat amounts as decimal strings.

**Breaking change process:** introduce the new shape under a new API version (see `docs/api-versioning.md`), run both side by side for at least one mobile release cycle, then deprecate the old one.

## Consumer checklist

- [ ] Handles an empty or single-event timeline (`filed` only).
- [ ] Ignores unknown `event_type` values.
- [ ] Shows `"system"` actors as automatic actions.
- [ ] Handles a `Completed` escrow with no `resolved` event.
- [ ] Does not re-sort events.
- [ ] Does not parse amounts as floats.
