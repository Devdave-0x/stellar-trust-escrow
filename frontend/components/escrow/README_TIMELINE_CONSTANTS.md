# Refactor — TransactionStatusTimeline magic numbers

## What changed
`TransactionStatusTimeline.jsx` had several inline numeric literals with no
explanation of what they represented (icon stroke width, viewBox size, dot
diameter, transition duration, pulse-ring opacity, description line clamp,
timestamp font size, connector line offsets).

All of these were extracted into named, commented constants near the top of
the file:

- `ICON_STROKE_WIDTH`, `ICON_VIEWBOX_SIZE`, `ICON_SIZE_CLASS`
- `STEP_DOT_SIZE_CLASS`
- `TRANSITION_DURATION_MS`
- `PULSE_RING_OPACITY_CLASS`
- `DESCRIPTION_MAX_LINES_CLASS`
- `TIMESTAMP_FONT_SIZE_CLASS`
- `VERTICAL_CONNECTOR_LEFT_PX`, `VERTICAL_CONNECTOR_TOP_PX`, `HORIZONTAL_CONNECTOR_TOP_PX`

Each constant has a one-line comment explaining what it controls and why it
has that value.

## Why
Unexplained magic numbers make it hard to know whether a value is load-bearing
(e.g. sized to fit a sibling element) or arbitrary, and risky to change.

## Notes
Values that feed literal Tailwind class names (e.g. `h-4 w-4`, `opacity-30`,
`line-clamp-2`) were kept as full literal class-name constants rather than
built via string interpolation, since Tailwind's JIT scanner requires the
complete class name to appear verbatim in source — interpolating a number
into a class string would silently drop the style at build time. Numeric
pixel offsets that aren't Tailwind utilities (connector line position) are
applied via inline `style` instead. Behavior and appearance are unchanged.
