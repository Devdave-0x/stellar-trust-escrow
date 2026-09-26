# Release Checklist: Contract and Backend Compatibility

Use this checklist before releasing changes that touch contract events, backend
indexing, OpenAPI fields, frontend types, or mobile cache schemas.

## Contract Events

- Event names and payload fields are documented.
- Indexer mappers handle both old and new event shapes during rollout.
- Event replay remains idempotent.

## Backend and OpenAPI

- OpenAPI schemas match serialized API responses.
- Webhook payload docs are updated.
- Background workers can parse historical and new records.
- Any migration has a rollback note.

## Frontend and Mobile

- Shared types or schemas are updated.
- Mobile cache schema changes include a migration or cache version bump.
- Empty, loading, and stale-cache states are reviewed.

## Release Gate

- Record contract address, backend commit, frontend commit, mobile build, and
  migration id in the release notes.
- Confirm monitoring dashboards and audit verification reports are reachable.
- Pause queue workers before rollback if event shape changed.
