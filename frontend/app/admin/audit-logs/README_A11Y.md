# Accessibility fix — Admin Audit Logs page

## What changed
`page.jsx` rendered several icon-only / symbol-only interactive elements
(the "← Dashboard" link, the "← Prev" / "Next →" pagination buttons, and the
"⚠️" error banner) with no accessible label, so screen reader users had no
way to tell what they did.

- Added `aria-label` to the back-to-dashboard link, and to the Prev/Next
  pagination buttons ("Go to previous page" / "Go to next page").
- Marked the decorative arrow and warning-emoji glyphs `aria-hidden="true"`
  so screen readers don't announce raw symbols, while the existing visible
  text label is preserved for sighted users.
- Added `role="alert"` to the error banner and `aria-live="polite"` to the
  pagination counter so status changes are announced.
- Added a descriptive `aria-label` to the results `<table>`.

## Why
Icon/symbol-only controls without a text alternative are unusable with a
screen reader. These are additive `aria-*` attributes only — no markup,
styling, or behavior changed, so there is no visual regression.

## Verification
Recommend running an automated a11y linter (e.g. `axe-core`, `eslint-plugin-jsx-a11y`)
against this page to confirm all interactive elements now have accessible names.
