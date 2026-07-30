/**
 * Badge Component
 *
 * Displays a colored status pill for EscrowStatus and milestone states.
 *
 * @param {object} props
 * @param {string} [props.status] — EscrowStatus or MilestoneStatus value
 * @param {string} [props.variant] — alias for status (e.g. 'success' maps to green)
 * @param {'sm'|'md'} [props.size='md']
 * @param {React.ReactNode} [props.children] — label override (used when variant is passed)
 */

// Escrow status colors per acceptance criteria:
//   Active → green, Completed → blue, Disputed → red, Cancelled → gray
//
// The 20%-tint backgrounds resolve to pale colours on a light surface, so each
// tone pairs a dark light-mode text colour with the original dark-mode one.
// Without that, e.g. text-green-400 on bg-green-500/20 over white measured
// 1.5:1 against the 4.5:1 required by WCAG 1.4.3.
const TONES = {
  green: 'bg-green-500/20 text-green-800 border-green-500/30 dark:text-green-300',
  blue: 'bg-blue-500/20 text-blue-800 border-blue-500/30 dark:text-blue-300',
  red: 'bg-red-500/20 text-red-800 border-red-500/30 dark:text-red-300',
  gray: 'bg-gray-500/20 text-gray-800 border-gray-500/40 dark:bg-gray-700/50 dark:text-gray-300',
  indigo: 'bg-indigo-500/20 text-indigo-800 border-indigo-500/30 dark:text-indigo-300',
  purple: 'bg-purple-500/20 text-purple-800 border-purple-500/30 dark:text-purple-300',
  amber: 'bg-amber-500/20 text-amber-900 border-amber-500/30 dark:text-amber-200',
};

const STATUS_STYLES = {
  // Escrow statuses
  Active: TONES.green,
  Completed: TONES.blue,
  Disputed: TONES.red,
  Cancelled: TONES.gray,

  // Milestone statuses
  Pending: TONES.gray,
  Submitted: TONES.blue,
  Approved: TONES.green,
  Rejected: TONES.red,

  // Reputation badges
  NEW: TONES.gray,
  TRUSTED: TONES.blue,
  VERIFIED: TONES.indigo,
  EXPERT: TONES.purple,
  ELITE: TONES.amber,

  // KYC statuses
  Init: TONES.blue,
  Processing: TONES.amber,
  Declined: TONES.red,

  // Generic variants (used by accessibility tests and generic callers)
  success: TONES.green,
  warning: TONES.amber,
  danger: TONES.red,
  info: TONES.blue,
  default: TONES.gray,
};

const ICONS = {
  Active: '🔒',
  Completed: '✅',
  Disputed: '⚠️',
  Cancelled: '✕',
  Pending: '○',
  Submitted: '📤',
  Approved: '✓',
  Rejected: '✗',
  TRUSTED: '🔵',
  VERIFIED: '💜',
  EXPERT: '⭐',
  ELITE: '🏆',
  Init: '🔄',
  Processing: '⏳',
  Declined: '❌',
};

export default function Badge({ status, variant, size = 'md', children }) {
  const key = status || variant;
  const styles = STATUS_STYLES[key] || TONES.gray;
  const icon = ICONS[key] || '';
  const sizeClass = size === 'sm' ? 'text-xs px-1.5 py-0.5' : 'text-xs px-2 py-1';
  const label = children ?? key;

  /*
    A badge is static content, not a live region. It previously carried
    role="status" (which implies aria-live="polite"), so a list of escrow cards
    announced every badge on render. The context that role was standing in for
    is now given by visually hidden text instead, which also avoids putting
    aria-label on a generic <span> — where naming is prohibited.
  */
  return (
    <span
      className={`inline-flex items-center gap-1 font-medium border rounded-full ${sizeClass} ${styles}`}
    >
      {icon && (
        <span aria-hidden="true" className="text-[10px]">
          {icon}
        </span>
      )}
      <span className="sr-only">Status: </span>
      {label}
    </span>
  );
}
