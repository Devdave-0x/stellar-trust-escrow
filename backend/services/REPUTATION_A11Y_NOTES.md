# Accessibility follow-up: reputationService badge icons

`backend/services/reputationService.js` is a server-side data/scoring
module — it does not render any HTML, JSX, or buttons itself, so there is
no DOM markup in this file to attach `aria-label` attributes to directly.

What was implemented instead:

- Added a `BADGE_ICONS` map and `getBadgeIcon(badge)` helper that pairs
  each badge tier's icon glyph (⭐ ✅ ✔️ 🏆 💎) with an explicit
  `ariaLabel` string (e.g. `"Expert member badge"`).
- Exported both from the module (named and default exports) so any
  consumer that renders a badge as an icon-only element — the frontend
  badge chip component, PDF exports (`pdfGenerator.js`), or email
  templates — has a single source of truth for the accessible label
  instead of re-deriving text from the raw glyph or omitting it.

Action required in the consuming UI components: wire `getBadgeIcon(badge).ariaLabel`
into the `aria-label` attribute of whatever icon-only element renders the
badge, and verify with an axe scan once that markup exists. That part is
tracked separately since it lives outside this backend service file.
