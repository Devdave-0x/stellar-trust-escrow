'use client';

import { useState, useRef, useCallback } from 'react';
import { cn } from '../../lib/utils';

/**
 * @param {{ question: string, answer: string }[]} items
 */
export default function Accordion({ items = [] }) {
  const [openIndex, setOpenIndex] = useState(null);
  const buttonRefs = useRef([]);

  const toggle = useCallback(
    (index) => setOpenIndex((prev) => (prev === index ? null : index)),
    [],
  );

  const handleKeyDown = (e, index) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = (index + 1) % items.length;
      buttonRefs.current[next]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = (index - 1 + items.length) % items.length;
      buttonRefs.current[prev]?.focus();
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggle(index);
    }
  };

  return (
    <div className="divide-y divide-gray-800 rounded-2xl border border-gray-800 bg-slate-950">
      {items.map((item, index) => {
        const isOpen = openIndex === index;
        const panelId = `accordion-panel-${index}`;
        const triggerId = `accordion-trigger-${index}`;

        return (
          <div key={index}>
            <button
              id={triggerId}
              ref={(el) => (buttonRefs.current[index] = el)}
              type="button"
              aria-expanded={isOpen}
              aria-controls={panelId}
              onClick={() => toggle(index)}
              onKeyDown={(e) => handleKeyDown(e, index)}
              className={cn(
                'flex w-full items-center justify-between px-6 py-4 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-inset',
                isOpen ? 'text-indigo-400' : 'text-white hover:text-indigo-300',
              )}
            >
              <span>{item.question}</span>
              <svg
                className={cn('ml-4 h-4 w-4 shrink-0 transition-transform duration-200', isOpen && 'rotate-180')}
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            <div
              id={panelId}
              role="region"
              aria-labelledby={triggerId}
              className="overflow-hidden transition-all duration-200 ease-in-out"
              style={{ maxHeight: isOpen ? '600px' : '0px' }}
            >
              <p className="px-6 pb-5 text-sm text-slate-400">{item.answer}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
