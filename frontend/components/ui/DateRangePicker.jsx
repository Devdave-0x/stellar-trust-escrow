'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { cn } from '../../lib/utils';

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function isSameDay(a, b) {
  return a && b && a.toDateString() === b.toDateString();
}

function startOfDay(d) {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year, month) {
  return new Date(year, month, 1).getDay();
}

function Calendar({ value, onChange, minDate, maxDate, highlightFrom, highlightTo, label }) {
  const today = startOfDay(new Date());
  const initial = value ?? today;
  const [cursor, setCursor] = useState({ year: initial.getFullYear(), month: initial.getMonth() });
  const gridRef = useRef(null);

  const daysInMonth = getDaysInMonth(cursor.year, cursor.month);
  const firstDay = getFirstDayOfWeek(cursor.year, cursor.month);

  const isDisabled = (day) => {
    const d = startOfDay(new Date(cursor.year, cursor.month, day));
    if (minDate && d < startOfDay(minDate)) return true;
    if (maxDate && d > startOfDay(maxDate)) return true;
    return false;
  };

  const isInRange = (day) => {
    if (!highlightFrom || !highlightTo) return false;
    const d = startOfDay(new Date(cursor.year, cursor.month, day));
    return d > startOfDay(highlightFrom) && d < startOfDay(highlightTo);
  };

  const isSelected = (day) => {
    const d = new Date(cursor.year, cursor.month, day);
    return isSameDay(d, value);
  };

  const isRangeEdge = (day) => {
    const d = new Date(cursor.year, cursor.month, day);
    return isSameDay(d, highlightFrom) || isSameDay(d, highlightTo);
  };

  const prevMonth = () =>
    setCursor(({ year, month }) =>
      month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 },
    );

  const nextMonth = () =>
    setCursor(({ year, month }) =>
      month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 },
    );

  const handleDayKeyDown = (e, day) => {
    if (isDisabled(day)) return;
    let next = day;
    if (e.key === 'ArrowRight') next = day + 1;
    else if (e.key === 'ArrowLeft') next = day - 1;
    else if (e.key === 'ArrowDown') next = day + 7;
    else if (e.key === 'ArrowUp') next = day - 7;
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onChange(new Date(cursor.year, cursor.month, day));
      return;
    } else return;

    e.preventDefault();
    if (next < 1) {
      prevMonth();
      setTimeout(() => {
        const cells = gridRef.current?.querySelectorAll('[data-day]');
        cells?.[cells.length - 1]?.focus();
      }, 0);
    } else if (next > daysInMonth) {
      nextMonth();
      setTimeout(() => {
        gridRef.current?.querySelector('[data-day]')?.focus();
      }, 0);
    } else {
      gridRef.current?.querySelector(`[data-day="${next}"]`)?.focus();
    }
  };

  return (
    <div className="w-64 rounded-2xl border border-gray-700 bg-gray-900 p-4 shadow-xl" aria-label={label}>
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={prevMonth}
          aria-label="Previous month"
          className="rounded p-1 text-gray-400 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        >
          ‹
        </button>
        <span className="text-sm font-semibold text-white">
          {MONTHS[cursor.month]} {cursor.year}
        </span>
        <button
          type="button"
          onClick={nextMonth}
          aria-label="Next month"
          className="rounded p-1 text-gray-400 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        >
          ›
        </button>
      </div>

      {/* Day-of-week headers */}
      <div className="mb-1 grid grid-cols-7 text-center">
        {DAYS.map((d) => (
          <span key={d} className="text-xs font-medium text-gray-500">
            {d}
          </span>
        ))}
      </div>

      {/* Days grid */}
      <div className="grid grid-cols-7 gap-y-0.5" ref={gridRef}>
        {Array.from({ length: firstDay }).map((_, i) => (
          <span key={`blank-${i}`} />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
          const disabled = isDisabled(day);
          const selected = isSelected(day);
          const inRange = isInRange(day);
          const edge = isRangeEdge(day);

          return (
            <button
              key={day}
              type="button"
              data-day={day}
              disabled={disabled}
              aria-label={`${day} ${MONTHS[cursor.month]} ${cursor.year}`}
              aria-pressed={selected}
              onClick={() => !disabled && onChange(new Date(cursor.year, cursor.month, day))}
              onKeyDown={(e) => handleDayKeyDown(e, day)}
              className={cn(
                'h-7 w-7 rounded-full text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500',
                disabled && 'cursor-not-allowed opacity-30',
                !disabled && !selected && !inRange && !edge && 'text-gray-300 hover:bg-gray-700',
                (selected || edge) && 'bg-indigo-600 font-semibold text-white',
                inRange && !selected && !edge && 'rounded-none bg-indigo-900/50 text-indigo-200',
              )}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * @param {{ from: Date|null, to: Date|null }} value
 * @param {function} onChange  — called with { from: Date, to: Date }
 * @param {Date} [minDate]
 * @param {Date} [maxDate]
 */
export default function DateRangePicker({ value, onChange, minDate, maxDate }) {
  const [from, setFrom] = useState(value?.from ?? null);
  const [to, setTo] = useState(value?.to ?? null);
  const [activeInput, setActiveInput] = useState(null); // 'from' | 'to' | null
  const containerRef = useRef(null);

  const fmt = (d) => (d ? d.toLocaleDateString('en-CA') : '');

  const handleFrom = useCallback(
    (date) => {
      const next = startOfDay(date);
      setFrom(next);
      // If new start is after current end, clear end
      if (to && next > startOfDay(to)) setTo(null);
      setActiveInput('to');
    },
    [to],
  );

  const handleTo = useCallback(
    (date) => {
      const next = startOfDay(date);
      setTo(next);
      setActiveInput(null);
      if (from) onChange?.({ from: startOfDay(from), to: next });
    },
    [from, onChange],
  );

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setActiveInput(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={containerRef} className="relative inline-flex flex-col gap-2">
      {/* Inputs row */}
      <div className="flex items-center gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-400">Start date</label>
          <input
            readOnly
            type="text"
            value={fmt(from)}
            placeholder="YYYY-MM-DD"
            aria-label="Start date"
            onClick={() => setActiveInput((v) => (v === 'from' ? null : 'from'))}
            className="w-36 cursor-pointer rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          />
        </div>

        <span className="mt-5 text-gray-500">→</span>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-400">End date</label>
          <input
            readOnly
            type="text"
            value={fmt(to)}
            placeholder="YYYY-MM-DD"
            aria-label="End date"
            onClick={() => setActiveInput((v) => (v === 'to' ? null : 'to'))}
            className="w-36 cursor-pointer rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          />
        </div>
      </div>

      {/* Calendars */}
      {activeInput === 'from' && (
        <div className="absolute top-full z-10 mt-2 flex gap-3">
          <Calendar
            label="Start date calendar"
            value={from}
            onChange={handleFrom}
            minDate={minDate}
            maxDate={maxDate}
            highlightFrom={from}
            highlightTo={to}
          />
        </div>
      )}

      {activeInput === 'to' && (
        <div className="absolute top-full z-10 mt-2 flex gap-3">
          <Calendar
            label="End date calendar"
            value={to}
            onChange={handleTo}
            minDate={from ?? minDate}
            maxDate={maxDate}
            highlightFrom={from}
            highlightTo={to}
          />
        </div>
      )}
    </div>
  );
}
