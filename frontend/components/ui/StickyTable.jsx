/**
 * StickyTable Component
 *
 * Wraps a data table and makes the <thead> sticky so column headers
 * remain visible when scrolling through long tables.
 *
 * The wrapper automatically applies sticky positioning to the first <thead>
 * inside its children and gives it a solid background for both light and dark modes.
 *
 * Usage:
 *   <StickyTable>
 *     <table>…</table>
 *   </StickyTable>
 *
 * @param {object}   props
 * @param {React.ReactNode} props.children - Table element with a <thead>
 */

'use client';

import { useRef, useEffect } from 'react';

export default function StickyTable({ children }) {
  const wrapperRef = useRef(null);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const thead = wrapper.querySelector('thead');
    if (!thead) return;

    // Apply sticky positioning
    thead.style.position = 'sticky';
    thead.style.top = '0';
    thead.style.zIndex = '10';

    // Ensure solid background for both themes
    thead.classList.add('bg-gray-50', 'dark:bg-gray-800');

    return () => {
      thead.style.position = '';
      thead.style.top = '';
      thead.style.zIndex = '';
      thead.classList.remove('bg-gray-50', 'dark:bg-gray-800');
    };
  }, []);

  return (
    <div
      ref={wrapperRef}
      className="w-full overflow-auto rounded-xl border border-white/10 bg-white/5 dark:bg-gray-900/50"
    >
      {children}
    </div>
  );
}
