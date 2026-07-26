/**
 * Sidebar Component
 *
 * Collapsible sidebar navigation.
 * - Toggle button (hamburger icon) collapses to icon-only / expands to full labels
 * - Collapse state persisted to localStorage
 * - In collapsed mode, shows only icons with tooltips on hover
 * - On mobile (< 768px), hidden by default, shown as overlay with backdrop
 *
 * @param {object}        props
 * @param {Array<{href: string, label: string, icon: React.ReactNode}>} props.items - Nav items
 * @param {string}        [props.className]
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { cn } from '../../lib/utils';

const STORAGE_KEY = 'ste_sidebar_collapsed';
const MOBILE_BREAKPOINT = 768;

export default function Sidebar({ items, className }) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Detect mobile on mount and on resize
  useEffect(() => {
    const check = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    check();

    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Load persisted collapse state
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored !== null) {
        setIsCollapsed(stored === 'true');
      }
    } catch {
      // localStorage unavailable (e.g. private browsing)
    }
  }, []);

  // Persist collapse state
  const toggleCollapsed = useCallback(() => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const toggleMobile = useCallback(() => {
    setIsMobileOpen((prev) => !prev);
  }, []);

  const closeMobile = useCallback(() => {
    setIsMobileOpen(false);
  }, []);

  // Close mobile on Escape
  useEffect(() => {
    if (!isMobileOpen) return;

    const handler = (e) => {
      if (e.key === 'Escape') closeMobile();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isMobileOpen, closeMobile]);

  // Prevent body scroll when mobile overlay is open
  useEffect(() => {
    if (isMobileOpen) {
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobileOpen]);

  const sidebarContent = (
    <div
      className={cn(
        'flex flex-col h-full bg-gray-900 border-r border-gray-800 transition-all duration-300',
        isCollapsed && !isMobile ? 'w-16' : 'w-60',
        className,
      )}
      role="navigation"
      aria-label="Sidebar navigation"
    >
      {/* Toggle button */}
      <div
        className={cn(
          'flex items-center h-16 px-3 border-b border-gray-800',
          isCollapsed && !isMobile ? 'justify-center' : 'justify-between',
        )}
      >
        {(!isCollapsed || isMobile) && (
          <span className="font-bold text-white text-sm truncate">
            StellarTrust<span className="text-indigo-400">Escrow</span>
          </span>
        )}

        <button
          type="button"
          onClick={toggleCollapsed}
          className={cn(
            'p-1.5 rounded-lg transition-colors text-gray-400 hover:text-white hover:bg-gray-800',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500',
          )}
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d={isCollapsed ? 'M13 5l7 7-7 7M5 5l7 7-7 7' : 'M11 19l-7-7 7-7M19 19l-7-7 7-7'}
            />
          </svg>
        </button>
      </div>

      {/* Nav items */}
      <nav className="flex flex-col gap-1 p-3 flex-1">
        {items.map(({ href, label, icon }) => (
          <Link
            key={href}
            href={href}
            onClick={isMobile ? closeMobile : undefined}
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
              'text-gray-400 hover:text-white hover:bg-gray-800',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500',
            )}
            title={isCollapsed && !isMobile ? label : undefined}
          >
            {icon && <span className="w-5 h-5 flex-shrink-0">{icon}</span>}
            {(!isCollapsed || isMobile) && <span className="truncate">{label}</span>}
          </Link>
        ))}
      </nav>

      {/* Bottom spacer */}
      <div className="p-3 border-t border-gray-800" />
    </div>
  );

  /* ── Mobile: hidden by default, overlay on toggle ── */
  if (isMobile) {
    return (
      <>
        {/* Mobile hamburger trigger */}
        <button
          type="button"
          onClick={toggleMobile}
          className={cn(
            'fixed top-4 left-4 z-50 p-2 rounded-lg transition-colors',
            'bg-gray-900 border border-gray-700 text-gray-400 hover:text-white',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500',
          )}
          aria-label="Open navigation menu"
          aria-expanded={isMobileOpen}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        {/* Backdrop */}
        <div
          aria-hidden="true"
          onClick={closeMobile}
          className={cn(
            'fixed inset-0 z-40 bg-black/60 transition-opacity duration-300',
            isMobileOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
          )}
        />

        {/* Overlay sidebar */}
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
          className={cn(
            'fixed top-0 left-0 z-50 h-full transition-transform duration-300 ease-in-out',
            isMobileOpen ? 'translate-x-0 visible' : '-translate-x-full invisible',
          )}
        >
          {sidebarContent}
        </div>
      </>
    );
  }

  /* ── Desktop: inline sidebar ── */
  return sidebarContent;
}
