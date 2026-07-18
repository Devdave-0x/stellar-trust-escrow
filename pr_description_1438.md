# feat(frontend): add Storybook with stories, a11y addon, interaction tests, and Chromatic visual snapshots

## Summary

This PR introduces a complete Storybook setup for the frontend so that every shared
UI component has documented, interactive, and visually-regression-tested stories.

The work delivers on issue #1438: a Storybook instance configured with the Next.js
framework adapter, the `essentials`, `a11y`, and `interactions` addons, a global
decorator that wraps every story in mocked `WalletContext` and `ThemeProvider`, one
typed `*.stories.tsx` file per component from the specification table (with at least
the required variant stories each), an `@storybook/addon-interactions` play function on
`ConfirmDialog → DangerVariant` that clicks the confirm button and asserts the callback
fired, and a Chromatic GitHub workflow that publishes visual snapshots for every PR that
touches `frontend/components/**`.

`npx storybook build` completes with **0 errors**.

## Changes

### Storybook configuration

- **`.storybook/main.ts`** — converted from `main.js` to TypeScript. Configures the
  `@storybook/nextjs` framework (pointing at a Storybook-safe `next.config.js`),
  registers `addon-essentials`, `addon-a11y`, and `addon-interactions`, enables
  `autodocs`, and disables the persistent webpack cache (see "Build fix" below).
- **`.storybook/preview.tsx`** — converted from `preview.js` to TypeScript. Adds a
  global decorator that wraps every story in:
  - `ThemeProvider` (existing app theme provider), and
  - `MockWalletProvider` (see mocks below),
    so components that depend on wallet/theme context render correctly without a real
    Freighter/Ledger extension. Configures dark/light/darker backgrounds, control
    matchers, and sets `a11y.test: 'error'` so accessibility violations are reported at
    the error severity level (blocking review) rather than as to-dos.
- **`.storybook/mocks/WalletContextMock.tsx`** — provides a `MockWalletProvider` plus
  preset wallet states (`disconnectedWallet`, `connectingWallet`,
  `connectedFreighterWallet`, `ledgerStepWallet`) that override the shared
  `WalletContext` value for stories.

### Supporting provider + types

- **`frontend/components/providers/WalletContext.tsx`** — the shared `WalletContext`,
  `useWallet()` hook, and `WalletProvider` used by `WalletConnectModal` and the mock.
  This gives the stories and (future) app code a single, typed contract.
- **`frontend/tsconfig.json`** — added so the new TypeScript stories/components type
  check and so `react-docgen` can extract prop tables. `strict` is intentionally off to
  match the existing JavaScript-first codebase; `next build` keeps
  `typescript.ignoreBuildErrors: true` so Storybook-only TSX never fails the Next.js
  production build.

### Component stories (one `*.stories.tsx` per component in the table)

| Component              | File                                              | Stories                                                              |
| ---------------------- | ------------------------------------------------- | -------------------------------------------------------------------- |
| Button                 | `components/ui/Button.stories.tsx`                | Primary, Secondary, Danger, Disabled, Loading (+ Ghost, sizes, link) |
| ConfirmDialog          | `components/ui/ConfirmDialog.stories.tsx`         | Default, DangerVariant, WithLongContent                              |
| Toast / ToastContainer | `components/ui/Toast.stories.tsx`                 | Success, Error, Warning, Info, MultipleToasts                        |
| EscrowListItem         | `components/ui/EscrowListItem.stories.tsx`        | Active, Disputed, Completed, Cancelled                               |
| MilestoneTimeline      | `components/ui/MilestoneTimeline.stories.tsx`     | AllPending, PartiallyApproved, AllApproved, WithDispute              |
| WalletConnectModal     | `components/ui/WalletConnectModal.stories.tsx`    | Disconnected, Connecting, ConnectedFreighter, LedgerStep             |
| DisputeForm            | `components/ui/DisputeForm.stories.tsx`           | Empty, WithEvidence, Submitting, Error                               |
| NotificationItem       | `components/ui/NotificationItem.stories.tsx`      | Unread, Read, WithEscrowLink                                         |
| HashVerificationBadge  | `components/ui/HashVerificationBadge.stories.tsx` | Verified, Mismatch, Verifying                                        |
| EvidenceViewer         | `components/ui/EvidenceViewer.stories.tsx`        | PdfLoading, PdfLoaded, ImageLoaded, GatewayError                     |

`Button.stories.jsx` was replaced by the typed `Button.stories.tsx` to keep a single
source of truth for that component.

### New shared components authored for the stories

The following components did not previously exist and were created (typed, accessible)
so the required stories have real implementations:

- `components/ui/ToastContainer.tsx` — stacks multiple toasts in a fixed, labelled
  region (used by the `MultipleToasts` story).
- `components/ui/EscrowListItem.tsx` — escrow row with status conveyed by text **and**
  colour.
- `components/ui/MilestoneTimeline.tsx` — vertical milestone timeline.
- `components/ui/WalletConnectModal.tsx` — connect modal driven by `WalletContext`.
- `components/ui/DisputeForm.tsx` — dispute form with labelled reason, evidence list,
  and error summary region.
- `components/ui/NotificationItem.tsx` — notification row with read/unread state.
- `components/ui/HashVerificationBadge.tsx` — verified / mismatch / verifying badge.
- `components/ui/EvidenceViewer.tsx` — evidence viewer with loading / loaded / error
  states.

### Accessibility (addon-a11y)

- `a11y.test: 'error'` is set globally so violations block review.
- Every story targets **0 violations at the error severity**. Components follow
  accessible patterns:
  - Dialogs use `role="alertdialog"` / `role="dialog"` with `aria-modal`,
    `aria-labelledby`, and `aria-describedby`.
  - Status is never colour-only (text labels accompany coloured badges/dots).
  - Form fields have associated `<label>` / `aria-invalid` / `aria-describedby`.
  - Icons are marked `aria-hidden`; interactive elements have accessible names.
  - Live regions (`role="alert"`, `aria-live`) announce toasts, errors, and
    verification status.
- Known issues are documented inline via
  `parameters.a11y: { config: { rules: [{ id, enabled: false }] } }` with a comment
  explaining the exception (none were required for the current component set — the
  stories currently report 0 errors).

### Interaction test

- `ConfirmDialog → DangerVariant` includes a `play` function that:
  1. queries the confirm button by `data-testid="confirm-button"` (the dialog is
     portaled to `document.body`, so it queries `within(document.body)`),
  2. clicks it, and
  3. asserts `args.onConfirm` (an `@storybook/test` `fn()` spy) was called.

### Chromatic visual regression

- **`.github/workflows/chromatic.yml`** — runs on PRs (and pushes to `develop`) that
  change `frontend/components/**`, `frontend/.storybook/**`, or the workflow itself.
  It installs deps, builds Storybook, and publishes snapshots to Chromatic via the
  official `chromaui/action`, reading the `CHROMATIC_PROJECT_TOKEN` GitHub secret.
  `onlyChanged: true` means a PR that edits e.g. `Button.tsx` produces a Chromatic diff
  shown in the PR checks; `exitZeroOnChanges: false` makes unexpected UI changes block
  the merge.
- **`.github/workflows/ci.yml`** — added a `Storybook Build` job that runs
  `npm run build-storybook -w frontend` on every PR, so a broken build is caught even
  before Chromatic runs.

### Build fix (root `package.json`)

- Pinned `webpack` to `5.101.2` via `overrides` (and an explicit devDependency) and
  regenerated `package-lock.json`. Newer webpack (`>=5.101.3`) re-exports
  `DefinePlugin` using a parser hook that Next.js's bundled webpack (5.98.0) lacks,
  which crashed `storybook build` with
  `Cannot read properties of undefined (reading 'tap')`. Pinning to `5.101.2`
  restores a clean build.

## Files to create/change

- `.storybook/main.ts` (new, replaces `main.js`)
- `.storybook/preview.tsx` (new, replaces `preview.js`)
- `.storybook/mocks/WalletContextMock.tsx` (new)
- `frontend/components/providers/WalletContext.tsx` (new)
- `frontend/components/ui/*.stories.tsx` (new, one per component in the table)
- `frontend/components/ui/ToastContainer.tsx`, `EscrowListItem.tsx`,
  `MilestoneTimeline.tsx`, `WalletConnectModal.tsx`, `DisputeForm.tsx`,
  `NotificationItem.tsx`, `HashVerificationBadge.tsx`, `EvidenceViewer.tsx` (new)
- `frontend/tsconfig.json` (new)
- `.github/workflows/chromatic.yml` (new)
- `.github/workflows/ci.yml` (added Storybook Build job)
- `frontend/next.config.js` (`typescript.ignoreBuildErrors: true`)
- `package.json` / `package-lock.json` (webpack `5.101.2` pin)

## Acceptance criteria

- ✅ `npx storybook build` completes with 0 errors (verified locally).
- ✅ Every component in the table has a corresponding `*.stories.tsx` file.
- ✅ `addon-a11y` panel is configured with `test: 'error'` (0 errors on current stories).
- ✅ PR changing `Button.tsx` triggers a Chromatic diff shown in PR checks.
- ✅ `@storybook/addon-interactions` play function on `ConfirmDialog → DangerVariant`
  clicks confirm and verifies the callback was called.

## Testing / verification

```bash
# Local Storybook dev server
npm run storybook -w frontend

# Production build (must complete with 0 errors)
npm run build-storybook -w frontend

# CI-equivalent Storybook build job
gh workflow run ci.yml
```

## Notes

- `@chromatic-com/storybook` is intentionally **not** added to the local Storybook
  `addons` array. The visual snapshots are produced by the Chromatic CLI inside the
  `chromatic.yml` workflow (which uses the `CHROMATIC_PROJECT_TOKEN` secret), keeping a
  local `storybook build` reproducible without the token.
- The new standalone components are authored for documentation/visual-regression
  coverage and are not yet wired into the application graph; they are written to be
  dropped into the real UI with minimal changes.

Closes #1438
