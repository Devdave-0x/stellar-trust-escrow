# Accessibility — webhookService delivery status labels

## What changed
`webhookService.js` is the backend source of truth for webhook delivery
status data that the admin dashboard renders as icon-only status badges
(success checkmark, pending clock, failed warning, retrying arrows). Those
icons had no accompanying text, so screen reader users consuming the
dashboard couldn't tell what a badge meant.

Added:
- `DELIVERY_STATUS_LABELS` — a map from each delivery status
  (`pending` / `success` / `failed` / `retrying`) to an `ariaLabel` (for the
  frontend to set directly on the icon-only badge/button) and a
  human-readable `description` (for a tooltip).
- `getDeliveryStatusLabel(status)` — safe lookup helper with a fallback for
  unrecognized statuses.
- `getDeliveryHistory()` now attaches `statusLabel` to every delivery record
  it returns, so consumers get the accessible label alongside the raw status
  with no extra lookup.

Both are exported (named + default) for use by the frontend delivery-history
UI.

## Why
Accessible names for icon-only controls need to live wherever the status
values are defined, so every surface rendering delivery status (current or
future) gets a consistent `aria-label` instead of re-inventing one. No
existing behavior, response shape (beyond the additive `statusLabel` field),
or business logic changed.
