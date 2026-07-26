/**
 * SplitButton Component
 *
 * Combines a primary action button with a dropdown of secondary options.
 * Left side is the primary action; right side is a chevron that opens a dropdown.
 *
 * @param {object}   props
 * @param {string}   props.primaryLabel - Label for the primary action button
 * @param {Function} props.onPrimaryClick - Called when primary button is clicked
 * @param {Array<{label: string, onClick: Function}>} props.options - Dropdown options
 * @param {'primary'|'secondary'|'danger'|'ghost'} [props.variant='primary'] - Button variant
 * @param {'sm'|'md'|'lg'} [props.size='md'] - Button size
 * @param {boolean}  [props.isLoading] - Shows spinner on primary button
 * @param {boolean}  [props.disabled] - Disables the entire split button
 */

'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronDown } from 'lucide-react';
import Button from './Button';
import { cn } from '../../lib/utils';

export default function SplitButton({
  primaryLabel,
  onPrimaryClick,
  options = [],
  variant = 'primary',
  size = 'md',
  isLoading = false,
  disabled = false,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownAbove, setDropdownAbove] = useState(false);
  const containerRef = useRef(null);
  const dropdownRef = useRef(null);
  const chevronRef = useRef(null);
  const activeIndexRef = useRef(-1);

  const closeDropdown = useCallback(() => {
    setIsOpen(false);
    activeIndexRef.current = -1;
  }, []);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      if (e.key === 'Escape') {
        closeDropdown();
        chevronRef.current?.focus();
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        activeIndexRef.current = Math.min(activeIndexRef.current + 1, options.length - 1);
        const items = dropdownRef.current?.querySelectorAll('[role="menuitem"]');
        items?.[activeIndexRef.current]?.focus();
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        activeIndexRef.current = Math.max(activeIndexRef.current - 1, 0);
        const items = dropdownRef.current?.querySelectorAll('[role="menuitem"]');
        items?.[activeIndexRef.current]?.focus();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, closeDropdown, options.length]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        closeDropdown();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen, closeDropdown]);

  // Check viewport position when opening
  useEffect(() => {
    if (!isOpen || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    // Estimate dropdown height ~ 40px per option + 8px padding
    const estimatedHeight = options.length * 40 + 16;
    setDropdownAbove(spaceBelow < estimatedHeight && rect.top > estimatedHeight);
  }, [isOpen, options.length]);

  const handleChevronClick = useCallback(() => {
    setIsOpen((prev) => !prev);
    activeIndexRef.current = -1;
  }, []);

  const handleOptionClick = useCallback(
    (option) => {
      option.onClick();
      closeDropdown();
    },
    [closeDropdown],
  );

  const handleChevronKeyDown = useCallback(
    (e) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        setIsOpen(true);
        activeIndexRef.current = 0;
        // Focus first option after a tick
        setTimeout(() => {
          const items = dropdownRef.current?.querySelectorAll('[role="menuitem"]');
          items?.[0]?.focus();
        }, 50);
      }
    },
    [],
  );

  return (
    <div className="inline-flex relative" ref={containerRef}>
      {/* Primary action button */}
      <Button
        variant={variant}
        size={size}
        onClick={onPrimaryClick}
        isLoading={isLoading}
        disabled={disabled}
        className="rounded-r-none border-r-0"
      >
        {primaryLabel}
      </Button>

      {/* Chevron divider + dropdown trigger */}
      <button
        ref={chevronRef}
        type="button"
        onClick={handleChevronClick}
        onKeyDown={handleChevronKeyDown}
        disabled={disabled}
        aria-label="Show more options"
        aria-expanded={isOpen}
        aria-haspopup="true"
        className={cn(
          'inline-flex items-center justify-center rounded-r-lg border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 shrink-0',
          // Match button variant colors
          variant === 'primary' && 'bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-500',
          variant === 'secondary' && 'bg-gray-800 hover:bg-gray-700 text-gray-300 border-gray-700',
          variant === 'danger' && 'bg-red-900/30 hover:bg-red-900/50 text-red-400 border-red-800',
          variant === 'ghost' && 'bg-transparent hover:bg-gray-800 text-gray-400 border-transparent',
          // Size classes
          size === 'sm' && 'px-2',
          size === 'md' && 'px-2.5',
          size === 'lg' && 'px-3',
          disabled && 'opacity-50 cursor-not-allowed pointer-events-none',
        )}
      >
        <ChevronDown
          className={cn(
            'transition-transform duration-200',
            isOpen && 'rotate-180',
            size === 'sm' && 'w-3.5 h-3.5',
            size === 'md' && 'w-4 h-4',
            size === 'lg' && 'w-5 h-5',
          )}
          aria-hidden="true"
        />
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div
          ref={dropdownRef}
          role="menu"
          aria-label="Secondary options"
          className={cn(
            'absolute z-50 min-w-[180px] rounded-lg border border-gray-700 bg-gray-900 shadow-xl py-1 left-0',
            dropdownAbove ? 'bottom-full mb-1' : 'top-full mt-1',
          )}
        >
          {options.map((option, index) => (
            <button
              key={index}
              role="menuitem"
              type="button"
              onClick={() => handleOptionClick(option)}
              className="w-full text-left px-4 py-2.5 text-sm text-gray-200 hover:bg-gray-800 hover:text-white transition-colors focus-visible:outline-none focus-visible:bg-gray-800 focus-visible:text-white"
              tabIndex={-1}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
