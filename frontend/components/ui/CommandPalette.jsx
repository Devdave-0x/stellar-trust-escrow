'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

const PAGES = [
  { label: 'Dashboard', route: '/dashboard' },
  { label: 'My Escrows', route: '/escrow' },
  { label: 'Disputes', route: '/dispute' },
  { label: 'Explorer', route: '/explorer' },
  { label: 'Governance', route: '/governance' },
  { label: 'Profile', route: '/profile' },
  { label: 'Settings', route: '/settings' },
];

const RECENT_ESCROWS_KEY = 'recentEscrows';

function getRecentEscrows() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(RECENT_ESCROWS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.map((entry) => ({
      label: entry.label || `Escrow #${entry.id}`,
      route: entry.route || `/escrow/${entry.id}`,
    }));
  } catch {
    return [];
  }
}

function isTypingInInput(target) {
  if (!target) return false;
  const tag = target.tagName?.toLowerCase();
  return tag === 'input' || tag === 'textarea' || target.isContentEditable;
}

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);
  const router = useRouter();

  const items = useMemo(() => [...PAGES, ...getRecentEscrows()], [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => item.label.toLowerCase().includes(q));
  }, [items, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, open]);

  useEffect(() => {
    function handleGlobalKeyDown(event) {
      const isCmdK = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k';
      if (isCmdK) {
        if (isTypingInInput(event.target)) return;
        event.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery('');
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const close = useCallback(() => setOpen(false), []);

  const navigateTo = useCallback(
    (item) => {
      if (!item) return;
      router.push(item.route);
      close();
    },
    [router, close]
  );

  const handleKeyDown = useCallback(
    (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveIndex((prev) => (results.length ? (prev + 1) % results.length : 0));
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex((prev) => (results.length ? (prev - 1 + results.length) % results.length : 0));
      } else if (event.key === 'Enter') {
        event.preventDefault();
        navigateTo(results[activeIndex]);
      }
    },
    [results, activeIndex, close, navigateTo]
  );

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      className="fixed inset-0 z-[200] flex items-start justify-center bg-black/50 pt-24"
      onClick={close}
    >
      <div
        className="w-full max-w-lg rounded-lg bg-gray-900 shadow-xl border border-gray-700"
        onClick={(event) => event.stopPropagation()}
      >
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search pages and recent escrows..."
          aria-label="Command palette search"
          className="w-full bg-transparent border-b border-gray-700 px-4 py-3 text-gray-100 outline-none"
        />
        <ul role="listbox" className="max-h-80 overflow-y-auto py-2">
          {results.length === 0 && (
            <li className="px-4 py-2 text-gray-400 text-sm">No results</li>
          )}
          {results.map((item, index) => (
            <li
              key={`${item.label}-${item.route}`}
              role="option"
              aria-selected={index === activeIndex}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => navigateTo(item)}
              className={`px-4 py-2 cursor-pointer text-sm ${
                index === activeIndex ? 'bg-blue-600 text-white' : 'text-gray-200'
              }`}
            >
              {item.label}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
