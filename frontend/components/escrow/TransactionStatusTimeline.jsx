'use client';

/**
 * TransactionStatusTimeline — Animated transaction status stepper
 *
 * Renders a vertical (mobile) or horizontal (≥ md) progress timeline
 * for an escrow transaction, with CSS-transition animations between
 * steps, full ARIA support, and Tailwind dark-mode classes.
 *
 * Usage:
 *   <TransactionStatusTimeline
 *     steps={[
 *       { id: 'created',   label: 'Created',    description: 'Escrow initialised' },
 *       { id: 'funded',    label: 'Funded',     description: 'XLM deposited' },
 *       { id: 'active',    label: 'Active',     description: 'Work in progress' },
 *       { id: 'completed', label: 'Completed',  description: 'Funds released' },
 *     ]}
 *     currentStep="active"
 *     error={false}
 *   />
 *
 * Issue #25
 */

// ─── Layout / animation constants ───────────────────────────────────
// Icon stroke weight for the check/x glyphs (visually balances the 32px dot).
const ICON_STROKE_WIDTH = 2.5;
// Icon glyphs are drawn on a 24x24 viewBox regardless of rendered size.
const ICON_VIEWBOX_SIZE = 24;
// Rendered icon size in Tailwind units (h-4 w-4 = 16px), fits inside the 32px step dot.
const ICON_SIZE_CLASS = 'h-4 w-4';
// Step dot diameter in Tailwind units (h-8 w-8 = 32px).
const STEP_DOT_SIZE_CLASS = 'h-8 w-8';
// Duration for connector/colour transitions between step states, in ms.
const TRANSITION_DURATION_MS = 500;
// Opacity of the pulsing ring animation on the active step (30%).
const PULSE_RING_OPACITY_CLASS = 'opacity-30';
// Max lines shown for a step's description before truncating (kept as a literal
// Tailwind class below — `line-clamp-2` — so the JIT scanner can detect it).
const DESCRIPTION_MAX_LINES_CLASS = 'line-clamp-2';
// Font size for the step timestamp, in px (10px = text-[10px]).
const TIMESTAMP_FONT_SIZE_CLASS = 'text-[10px]';
// Vertical connector line offsets (px): aligned to the center/bottom of the 32px dot.
const VERTICAL_CONNECTOR_LEFT_PX = 15;
const VERTICAL_CONNECTOR_TOP_PX = 32;
// Horizontal connector line vertical offset (px), centers it on the dot.
const HORIZONTAL_CONNECTOR_TOP_PX = 16;

// ─── Status colours ─────────────────────────────────────────────────
const STEP_STATE = {
  completed: {
    ring: 'ring-emerald-500',
    bg: 'bg-emerald-500',
    text: 'text-emerald-600 dark:text-emerald-400',
    connector: 'bg-emerald-500',
    iconPath:
      'M4.5 12.75l6 6 9-13.5', // check
  },
  current: {
    ring: 'ring-brand-500',
    bg: 'bg-brand-500',
    text: 'text-brand-600 dark:text-brand-400',
    connector: 'bg-gray-200 dark:bg-gray-700',
    iconPath: null,
  },
  error: {
    ring: 'ring-red-500',
    bg: 'bg-red-500',
    text: 'text-red-600 dark:text-red-400',
    connector: 'bg-gray-200 dark:bg-gray-700',
    iconPath:
      'M6 18 18 6M6 6l12 12', // X
  },
  upcoming: {
    ring: 'ring-gray-300 dark:ring-gray-600',
    bg: 'bg-white dark:bg-gray-800',
    text: 'text-gray-400 dark:text-gray-500',
    connector: 'bg-gray-200 dark:bg-gray-700',
    iconPath: null,
  },
};

function CheckIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox={`0 0 ${ICON_VIEWBOX_SIZE} ${ICON_VIEWBOX_SIZE}`}
      strokeWidth={ICON_STROKE_WIDTH}
      stroke="currentColor"
      aria-hidden="true"
      className={ICON_SIZE_CLASS}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox={`0 0 ${ICON_VIEWBOX_SIZE} ${ICON_VIEWBOX_SIZE}`}
      strokeWidth={ICON_STROKE_WIDTH}
      stroke="currentColor"
      aria-hidden="true"
      className={ICON_SIZE_CLASS}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
    </svg>
  );
}

// Pulsing ring for the current active step
function PulseRing() {
  return (
    <span
      className={`absolute inset-0 rounded-full animate-ping ${PULSE_RING_OPACITY_CLASS} bg-brand-500`}
      aria-hidden="true"
    />
  );
}

// ─── Single step node ───────────────────────────────────────────────
function StepNode({ step, state, stepNumber, isLast, orientation }) {
  const cfg = STEP_STATE[state];
  const isVertical = orientation === 'vertical';

  return (
    <li
      className={`relative flex ${isVertical ? 'flex-row gap-4' : 'flex-col items-center gap-2'} ${
        !isLast && !isVertical ? 'flex-1' : ''
      }`}
      aria-current={state === 'current' ? 'step' : undefined}
    >
      {/* ── Connector line (before the dot on vertical; below on horizontal) ── */}
      {!isLast && (
        <div
          aria-hidden="true"
          className={`
            absolute transition-colors
            ${
              isVertical
                ? `w-0.5 bottom-0 ${cfg.connector}`
                : `left-1/2 w-full h-0.5 ${cfg.connector}`
            }
          `}
          style={{
            transitionDuration: `${TRANSITION_DURATION_MS}ms`,
            ...(isVertical
              ? { left: `${VERTICAL_CONNECTOR_LEFT_PX}px`, top: `${VERTICAL_CONNECTOR_TOP_PX}px` }
              : { top: `${HORIZONTAL_CONNECTOR_TOP_PX}px` }),
          }}
        />
      )}

      {/* ── Step dot ───────────────────────────────── */}
      <div className={`relative flex-shrink-0 ${isVertical ? '' : 'z-10'}`}>
        <div
          className={`
            relative ${STEP_DOT_SIZE_CLASS} rounded-full flex items-center justify-center
            ring-2 transition-all
            ${cfg.ring} ${cfg.bg}
          `}
          style={{ transitionDuration: `${TRANSITION_DURATION_MS}ms` }}
        >
          {state === 'current' && <PulseRing />}
          {state === 'completed' && (
            <span className="text-white">
              <CheckIcon />
            </span>
          )}
          {state === 'error' && (
            <span className="text-white">
              <XIcon />
            </span>
          )}
          {(state === 'upcoming' || state === 'current') && (
            <span
              className={`text-xs font-bold ${
                state === 'current' ? 'text-white' : 'text-gray-400 dark:text-gray-500'
              }`}
            >
              {stepNumber}
            </span>
          )}
        </div>
      </div>

      {/* ── Label & description ─────────────────────── */}
      <div className={`${isVertical ? 'pb-6 min-w-0' : 'text-center mt-1'}`}>
        <p className={`text-sm font-semibold transition-colors duration-300 ${cfg.text}`}>
          {step.label}
        </p>
        {step.description && (
          <p
            className={`mt-0.5 text-xs text-gray-500 dark:text-gray-400 ${DESCRIPTION_MAX_LINES_CLASS}`}
          >
            {step.description}
          </p>
        )}
        {step.timestamp && (
          <time
            dateTime={new Date(step.timestamp).toISOString()}
            className={`mt-0.5 block ${TIMESTAMP_FONT_SIZE_CLASS} text-gray-400 dark:text-gray-500 tabular-nums`}
          >
            {new Date(step.timestamp).toLocaleString()}
          </time>
        )}
      </div>
    </li>
  );
}

// ─── Main component ─────────────────────────────────────────────────
/**
 * @param {{
 *   steps: Array<{
 *     id: string,
 *     label: string,
 *     description?: string,
 *     timestamp?: string | number,
 *   }>,
 *   currentStep: string,
 *   error?: boolean,
 *   orientation?: 'vertical' | 'horizontal',
 *   className?: string,
 * }} props
 */
export default function TransactionStatusTimeline({
  steps = [],
  currentStep,
  error = false,
  orientation,
  className = '',
}) {
  // Auto-switch to vertical on narrow containers via CSS; caller can override
  const resolvedOrientation = orientation ?? 'vertical';

  const currentIndex = steps.findIndex((s) => s.id === currentStep);

  function getState(index) {
    if (error && index === currentIndex) return 'error';
    if (index < currentIndex) return 'completed';
    if (index === currentIndex) return 'current';
    return 'upcoming';
  }

  return (
    <nav
      aria-label="Transaction status timeline"
      className={`w-full ${className}`}
    >
      {/* Horizontal layout hidden on mobile, shown on md+ unless forced vertical */}
      <ol
        className={`
          ${resolvedOrientation === 'horizontal'
            ? 'hidden md:flex items-start gap-0'
            : 'hidden'}
        `}
        role="list"
      >
        {steps.map((step, i) => (
          <StepNode
            key={step.id}
            step={step}
            state={getState(i)}
            stepNumber={i + 1}
            isLast={i === steps.length - 1}
            orientation="horizontal"
          />
        ))}
      </ol>

      {/* Vertical layout — always shown on mobile; hidden on md+ if horizontal */}
      <ol
        className={`
          flex flex-col
          ${resolvedOrientation === 'horizontal' ? 'md:hidden' : ''}
        `}
        role="list"
      >
        {steps.map((step, i) => (
          <StepNode
            key={step.id}
            step={step}
            state={getState(i)}
            stepNumber={i + 1}
            isLast={i === steps.length - 1}
            orientation="vertical"
          />
        ))}
      </ol>
    </nav>
  );
}

// ─── Default escrow step presets ────────────────────────────────────
export const ESCROW_STEPS = [
  { id: 'created',   label: 'Created',    description: 'Escrow contract initialised on Stellar' },
  { id: 'funded',    label: 'Funded',     description: 'XLM deposited into escrow account' },
  { id: 'active',    label: 'Active',     description: 'Work in progress' },
  { id: 'completed', label: 'Completed',  description: 'Funds released to recipient' },
];

export const DISPUTE_STEPS = [
  { id: 'created',   label: 'Created',    description: 'Escrow contract initialised' },
  { id: 'funded',    label: 'Funded',     description: 'XLM deposited' },
  { id: 'disputed',  label: 'Disputed',   description: 'Dispute raised — awaiting arbitration' },
  { id: 'resolved',  label: 'Resolved',   description: 'Arbitrator decision applied' },
];
