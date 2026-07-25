## Summary

Enhances the escrow summary card component (`EscrowCard`) for the dashboard with status-aware visual hierarchy, time-remaining information, and action-required highlights. The existing `Badge` component is extended to support the new `ReleaseRequested` and `Expired` statuses.

## Changes

### `Badge.jsx` — New status variants
- **`ReleaseRequested`** → amber background/border, hourglass icon
- **`Expired`** → grey background/border (same as Completed/Cancelled), hourglass emoji
- Updated JSDoc to reflect the colour map per issue requirements

### `EscrowCard.jsx` — Summary card redesign
- **Deadline / time remaining** — displays `"3d remaining"`, `"Due soon"`, or `"Past due"` with relative timestamp via `useRelativeTime`
- **Asset symbol** — renders the asset symbol (defaults to `USDC`) below the fiat amount
- **Action-required highlight** — subtle amber accent border (`border-amber-500/40`) when `status === "ReleaseRequested"` or `actionRequired` prop is set; also shows an "Action required" banner inside the card
- **Keyboard accessible** — `Enter`/`Space` activates card navigation
- **Responsive** — uses the parent's grid layout (`md:grid-cols-2` on dashboard, `md:grid-cols-2 lg:grid-cols-3` on explorer)

### i18n — New status labels across all 6 locales
- Added `releaseRequested` and `expired` keys to `escrow.status` in en, es, fr, de, ar, zh

### Explorer — Updated `normaliseEscrow`
- Passes through `deadline` and `assetSymbol` from the API response

## Files changed
| File | Change |
|------|--------|
| `frontend/components/ui/Badge.jsx` | +ReleaseRequested, +Expired statuses |
| `frontend/components/escrow/EscrowCard.jsx` | Time remaining, asset symbol, action highlight |
| `frontend/i18n/locales/en.json` | +status translations |
| `frontend/i18n/locales/es.json` | +status translations |
| `frontend/i18n/locales/fr.json` | +status translations |
| `frontend/i18n/locales/de.json` | +status translations |
| `frontend/i18n/locales/ar.json` | +status translations |
| `frontend/i18n/locales/zh.json` | +status translations |
| `frontend/app/explorer/page.jsx` | Pass deadline/assetSymbol to EscrowCard |

closes #42
