/**
 * TagInput Component
 *
 * Renders entered values as removable chips inside an input field.
 * Pressing Enter or comma adds a chip from the current input value.
 * Backspace when input is empty removes the last chip.
 * Clicking the × on a chip removes it.
 *
 * @param {object}   props
 * @param {string[]} [props.value=[]]     - Controlled tags array
 * @param {string[]} [props.defaultValue] - Uncontrolled initial tags
 * @param {(tags: string[]) => void} [props.onChange] - Called on every change
 * @param {number}   [props.maxTags]      - Maximum number of tags allowed
 * @param {string}   [props.placeholder]  - Input placeholder text
 * @param {string}   [props.className]    - Additional wrapper classes
 */

'use client';

import { useState, useRef, useCallback } from 'react';
import { cn } from '../../lib/utils';

export default function TagInput({
  value: controlledValue,
  defaultValue,
  onChange,
  maxTags,
  placeholder = 'Type and press Enter…',
  className,
}) {
  const isControlled = controlledValue !== undefined;
  const [internalTags, setInternalTags] = useState(defaultValue ?? []);
  const tags = isControlled ? controlledValue : internalTags;

  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef(null);

  const hasReachedMax = maxTags !== undefined && tags.length >= maxTags;

  const emitChange = useCallback(
    (newTags) => {
      if (!isControlled) setInternalTags(newTags);
      onChange?.(newTags);
    },
    [isControlled, onChange],
  );

  const addTag = useCallback(
    (raw) => {
      const trimmed = raw.trim();
      if (!trimmed) return;
      if (hasReachedMax) return;
      // Don't add duplicates
      if (tags.includes(trimmed)) return;

      const newTags = [...tags, trimmed];
      emitChange(newTags);
    },
    [tags, hasReachedMax, emitChange],
  );

  const removeTag = useCallback(
    (index) => {
      const newTags = tags.filter((_, i) => i !== index);
      emitChange(newTags);
    },
    [tags, emitChange],
  );

  const removeLastTag = useCallback(() => {
    if (tags.length === 0) return;
    const newTags = tags.slice(0, -1);
    emitChange(newTags);
  }, [tags, emitChange]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag(inputValue);
      setInputValue('');
    } else if (e.key === 'Backspace' && inputValue === '') {
      removeLastTag();
    }
  };

  const handleInput = (e) => {
    const val = e.target.value;
    // Check for comma
    if (val.includes(',')) {
      const parts = val.split(',');
      // Add all parts except the last one (which may be incomplete)
      parts.slice(0, -1).forEach((part) => addTag(part));
      setInputValue(parts[parts.length - 1].trimStart());
    } else {
      setInputValue(val);
    }
  };

  const focusInput = () => {
    inputRef.current?.focus();
  };

  return (
    <div className={cn('w-full', className)}>
      <div
        className={cn(
          'flex flex-wrap items-center gap-1.5 rounded-lg border px-3 py-2 transition-colors cursor-text',
          'bg-gray-900 border-gray-700',
          'focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500',
          hasReachedMax && 'opacity-60',
        )}
        onClick={focusInput}
        role="list"
        aria-label="Tag input"
      >
        {tags.map((tag, index) => (
          <span
            key={`${tag}-${index}`}
            role="listitem"
            className={cn(
              'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-sm font-medium',
              'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30',
              'animate-fade-in',
            )}
          >
            <span>{tag}</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                removeTag(index);
              }}
              className={cn(
                'ml-0.5 rounded-full p-0.5 transition-colors',
                'hover:bg-indigo-500/30 hover:text-indigo-200',
                'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500',
              )}
              aria-label={`Remove ${tag}`}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="w-3 h-3"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </span>
        ))}

        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          disabled={hasReachedMax}
          placeholder={tags.length === 0 ? placeholder : ''}
          className={cn(
            'flex-1 min-w-[120px] bg-transparent border-none outline-none text-sm',
            'text-gray-100 placeholder-gray-500',
            'disabled:cursor-not-allowed',
          )}
          aria-label={placeholder}
        />
      </div>

      {hasReachedMax && (
        <p className="mt-1 text-xs text-amber-400" role="alert">
          Maximum of {maxTags} tag{maxTags !== 1 ? 's' : ''} reached.
        </p>
      )}
    </div>
  );
}
