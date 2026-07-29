'use client';

import { useState } from 'react';
import { cn } from '../../lib/utils';

const TONE_STYLES = {
  neutral: 'text-gray-500',
  warning: 'text-amber-400',
  error: 'text-red-400',
};

function clampValue(value, maxLength) {
  if (typeof maxLength !== 'number') return value;
  return value.slice(0, maxLength);
}

function getTone(currentLength, maxLength) {
  if (typeof maxLength !== 'number' || maxLength <= 0) return 'neutral';
  if (currentLength >= maxLength) return 'error';
  if (currentLength / maxLength >= 0.8) return 'warning';
  return 'neutral';
}

export default function CharCountTextarea({
  value,
  defaultValue = '',
  onChange,
  maxLength,
  className,
  wrapperClassName,
  counterClassName,
  showCounter = true,
  id,
  ...rest
}) {
  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = useState(defaultValue);
  const currentValue = isControlled ? value : internalValue;
  const currentLength = currentValue?.length ?? 0;
  const tone = getTone(currentLength, maxLength);

  const handleChange = (event) => {
    const nextValue = clampValue(event.target.value, maxLength);
    if (event.target.value !== nextValue) {
      event.target.value = nextValue;
    }
    if (!isControlled) setInternalValue(nextValue);
    onChange?.(event);
  };

  return (
    <div className={cn('space-y-1', wrapperClassName)}>
      <textarea
        id={id}
        value={currentValue}
        onChange={handleChange}
        maxLength={maxLength}
        className={cn(className)}
        {...rest}
      />
      {showCounter && typeof maxLength === 'number' && (
        <div
          className={cn('text-right text-xs tabular-nums transition-colors', TONE_STYLES[tone], counterClassName)}
          aria-live="polite"
        >
          {currentLength}/{maxLength}
        </div>
      )}
    </div>
  );
}
