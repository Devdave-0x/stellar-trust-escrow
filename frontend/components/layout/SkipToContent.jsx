'use client';

/**
 * SkipToContent — visually hidden link that becomes visible on keyboard
 * focus, letting keyboard and screen-reader users bypass repeated header
 * navigation and jump straight to the page's main content.
 *
 * Must be the first focusable element on the page.
 */
export default function SkipToContent({ targetId = 'main-content' }) {
  return (
    <a
      href={`#${targetId}`}
      className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100]
                 focus:rounded-lg focus:bg-indigo-600 focus:px-4 focus:py-2 focus:text-sm
                 focus:font-medium focus:text-white focus:outline-none focus-visible:ring-2
                 focus-visible:ring-white focus-visible:ring-offset-2
                 focus-visible:ring-offset-indigo-600"
    >
      Skip to main content
    </a>
  );
}
