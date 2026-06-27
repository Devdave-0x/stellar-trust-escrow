## Summary

Adds copy-to-clipboard functionality for wallet addresses, escrow IDs, and transaction hashes across the UI. Builds a reusable `useCopyToClipboard` hook with clipboard API + `document.execCommand` fallback, and an enhanced `CopyButton` component with icon-only design, tooltip feedback, and keyboard accessibility.

## Changes

### New: `useCopyToClipboard` hook
- Uses `navigator.clipboard.writeText` with `document.execCommand('copy')` fallback for unsupported platforms
- Auto-dismisses "Copied" state after 2 seconds (configurable)
- Returns `{ copy, isCopied }`

### Rebuilt: `CopyButton` component
- Icon-only button using `Copy`/`Check` from lucide-react
- "Copied!" tooltip appears above the button and auto-dismisses
- Keyboard accessible: focusable via Tab, operable via Enter/Space
- Disabled state when no text is provided

### Updated: `TruncatedAddress` component
- Uses `useCopyToClipboard` hook (was inline `navigator.clipboard`)
- Now shows a dedicated copy icon button alongside the truncated address text
- Consistent `✓ Copied` visual feedback

### Updated: `WalletStatus` — `AddressWithTooltip`
- Switched from inline clipboard logic to `useCopyToClipboard` hook

### Places with new copy buttons

| Location | Content | Component |
|----------|---------|-----------|
| EscrowCard footer | Escrow ID (`#42`) | CopyButton |
| ActivityTimeline | Escrow ID (`Escrow #42`) | CopyButton |
| Escrow detail page | Wallet addresses (Client/Freelancer) | TruncatedAddress (now with copy icon) |
| WalletLedger expanded details | Transaction hash | CopyButton |
| TransactionHash component | Transaction hash | CopyButton *(pre-existing)* |
| WalletStatus dropdown | Wallet address | AddressWithTooltip (now uses hook) |
| Profile page | Wallet address | TruncatedAddress *(pre-existing)* |

## Files changed
| File | Change |
|------|--------|
| `frontend/hooks/useCopyToClipboard.js` | New hook |
| `frontend/components/ui/CopyButton.jsx` | Rebuilt with hook, tooltip, icon-only |
| `frontend/components/ui/TruncatedAddress.jsx` | Hook migration + copy icon |
| `frontend/components/ui/WalletStatus.jsx` | Hook migration |
| `frontend/components/escrow/EscrowCard.jsx` | +CopyButton for escrow ID |
| `frontend/components/dashboard/ActivityTimeline.jsx` | +CopyButton for escrow ID |
| `frontend/app/escrow/[id]/page.jsx` | PartyCard uses TruncatedAddress |
| `frontend/components/profile/WalletLedger.jsx` | +CopyButton for tx hash |

closes #41
