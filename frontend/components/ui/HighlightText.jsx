/**
 * HighlightText Component
 *
 * Renders text with all occurrences of a search term wrapped in <mark> elements.
 * Matching is case-insensitive and regex special characters in the search term
 * are escaped before use.
 *
 * @param {object} props
 * @param {string} props.text      - The full text to display
 * @param {string} props.highlight - The search term to highlight
 */

'use client';

/**
 * Escapes special regex characters in a string so it can be used as a literal
 * pattern inside a RegExp constructor.
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export default function HighlightText({ text = '', highlight = '' }) {
  if (!highlight.trim()) {
    return <span>{text}</span>;
  }

  const safePattern = escapeRegex(highlight.trim());
  const regex = new RegExp(`(${safePattern})`, 'gi');
  const parts = text.split(regex);

  return (
    <span>
      {parts.map((part, index) =>
        regex.test(part) ? (
          <mark
            key={index}
            className="bg-yellow-200 dark:bg-yellow-700 text-inherit rounded-sm px-0.5"
          >
            {part}
          </mark>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </span>
  );
}
