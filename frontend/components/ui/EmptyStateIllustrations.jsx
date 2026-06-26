/**
 * EmptyStateIllustrations
 *
 * SVG illustrations for empty states across the app.
 * Each illustration is contextual to its use case.
 */

export function NoEscrowsIllustration({ className = 'w-24 h-24 opacity-40' }) {
  return (
    <svg
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Outer circle */}
      <circle cx="60" cy="60" r="56" stroke="#4F46E5" strokeWidth="2" strokeDasharray="6 4" />

      {/* Document body */}
      <rect x="35" y="28" width="50" height="64" rx="5" fill="#1E1B4B" stroke="#4F46E5" strokeWidth="1.5" />

      {/* Document fold */}
      <path d="M70 28 L85 43" stroke="#4F46E5" strokeWidth="1.5" />
      <path d="M70 28 L70 43 L85 43" fill="#312E81" stroke="#4F46E5" strokeWidth="1.5" strokeLinejoin="round" />

      {/* Lines on document */}
      <rect x="43" y="52" width="34" height="3" rx="1.5" fill="#4F46E5" opacity="0.5" />
      <rect x="43" y="61" width="26" height="3" rx="1.5" fill="#4F46E5" opacity="0.4" />
      <rect x="43" y="70" width="30" height="3" rx="1.5" fill="#4F46E5" opacity="0.3" />

      {/* Magnifying glass */}
      <circle cx="78" cy="83" r="12" fill="#0F172A" stroke="#6366F1" strokeWidth="2" />
      <circle cx="78" cy="83" r="7" stroke="#818CF8" strokeWidth="1.5" />
      <line x1="83" y1="88" x2="90" y2="95" stroke="#818CF8" strokeWidth="2.5" strokeLinecap="round" />

      {/* X inside magnifying glass */}
      <line x1="75" y1="80" x2="81" y2="86" stroke="#6366F1" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="81" y1="80" x2="75" y2="86" stroke="#6366F1" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function NoDisputesIllustration({ className = 'w-24 h-24 opacity-40' }) {
  return (
    <svg
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Outer circle */}
      <circle cx="60" cy="60" r="56" stroke="#10B981" strokeWidth="2" strokeDasharray="6 4" />

      {/* Scales body */}
      <rect x="48" y="50" width="24" height="8" rx="2" fill="#10B981" opacity="0.3" />

      {/* Left pan */}
      <rect x="35" y="60" width="20" height="12" rx="3" fill="#1E1B4B" stroke="#10B981" strokeWidth="1.5" />

      {/* Right pan */}
      <rect x="65" y="60" width="20" height="12" rx="3" fill="#1E1B4B" stroke="#10B981" strokeWidth="1.5" />

      {/* Left arm */}
      <line x1="45" y1="50" x2="35" y2="42" stroke="#10B981" strokeWidth="2" strokeLinecap="round" />

      {/* Right arm */}
      <line x1="75" y1="50" x2="85" y2="42" stroke="#10B981" strokeWidth="2" strokeLinecap="round" />

      {/* Checkmark on left pan */}
      <polyline
        points="40,66 44,70 52,62"
        stroke="#10B981"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Checkmark on right pan */}
      <polyline
        points="70,66 74,70 82,62"
        stroke="#10B981"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function NoNotificationsIllustration({ className = 'w-24 h-24 opacity-40' }) {
  return (
    <svg
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Outer circle */}
      <circle cx="60" cy="60" r="56" stroke="#F59E0B" strokeWidth="2" strokeDasharray="6 4" />

      {/* Bell body */}
      <path
        d="M60 28 C65 28 68 32 68 38 L68 50 C68 56 72 60 72 60 L48 60 C48 60 52 56 52 50 L52 38 C52 32 55 28 60 28"
        fill="#1E1B4B"
        stroke="#F59E0B"
        strokeWidth="1.5"
      />

      {/* Bell clapper */}
      <circle cx="60" cy="68" r="3" fill="#F59E0B" />

      {/* Bell stand */}
      <rect x="56" y="70" width="8" height="6" rx="2" fill="#F59E0B" opacity="0.3" />

      {/* Slash line through bell */}
      <line x1="42" y1="75" x2="78" y2="35" stroke="#F59E0B" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function SearchNoResultsIllustration({ className = 'w-24 h-24 opacity-40' }) {
  return (
    <svg
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Outer circle */}
      <circle cx="60" cy="60" r="56" stroke="#8B5CF6" strokeWidth="2" strokeDasharray="6 4" />

      {/* Search circle */}
      <circle cx="52" cy="48" r="16" fill="#1E1B4B" stroke="#8B5CF6" strokeWidth="2" />

      {/* Search handle */}
      <line x1="65" y1="61" x2="78" y2="74" stroke="#8B5CF6" strokeWidth="2.5" strokeLinecap="round" />

      {/* Magnifying glass internal cross */}
      <line x1="48" y1="44" x2="56" y2="52" stroke="#8B5CF6" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="56" y1="44" x2="48" y2="52" stroke="#8B5CF6" strokeWidth="1.5" strokeLinecap="round" />

      {/* Question mark */}
      <text x="85" y="50" fontSize="24" fontWeight="bold" fill="#8B5CF6">
        ?
      </text>
    </svg>
  );
}
