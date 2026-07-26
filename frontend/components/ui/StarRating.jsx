/**
 * StarRating Component
 *
 * Displays a 5-star rating with full, half, and empty star states.
 * In interactive mode, hovering highlights stars and clicking emits onChange.
 * Each star is backed by a visually-hidden radio input for accessibility.
 *
 * @param {object}   props
 * @param {number}   props.value          - Current rating value (0–5, supports 0.5 increments)
 * @param {boolean}  [props.readonly]     - Disables interaction when true
 * @param {function} [props.onChange]     - Called with the new value when a star is clicked
 * @param {string}   [props.name]         - HTML name attribute for the radio group (auto-generated if omitted)
 */

'use client';

import { useState, useId } from 'react';

const TOTAL_STARS = 5;

/** Returns 'full' | 'half' | 'empty' for a given star slot based on rating value. */
function getStarType(starIndex, value) {
  const starValue = starIndex + 1;
  if (value >= starValue) return 'full';
  if (value >= starValue - 0.5) return 'half';
  return 'empty';
}

function StarIcon({ type }) {
  const common = 'w-6 h-6 transition-colors duration-100';

  if (type === 'full') {
    return (
      <svg className={`${common} text-yellow-400`} fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
      </svg>
    );
  }

  if (type === 'half') {
    return (
      <svg className={`${common} text-yellow-400`} viewBox="0 0 20 20" aria-hidden="true">
        {/* Full star path clipped to left half */}
        <defs>
          <clipPath id="half-clip">
            <rect x="0" y="0" width="10" height="20" />
          </clipPath>
        </defs>
        {/* Empty star base */}
        <path
          fill="currentColor"
          className="text-gray-300 dark:text-gray-600"
          d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"
        />
        {/* Filled left half */}
        <path
          fill="currentColor"
          clipPath="url(#half-clip)"
          d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"
        />
      </svg>
    );
  }

  // empty
  return (
    <svg className={`${common} text-gray-300 dark:text-gray-600`} fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
    </svg>
  );
}

export default function StarRating({ value = 0, readonly = false, onChange, name: nameProp }) {
  const uid = useId();
  const groupName = nameProp || `star-rating-${uid}`;
  const [hovered, setHovered] = useState(null);

  const displayValue = !readonly && hovered !== null ? hovered : value;

  const handleMouseEnter = (starValue) => {
    if (!readonly) setHovered(starValue);
  };

  const handleMouseLeave = () => {
    if (!readonly) setHovered(null);
  };

  const handleChange = (starValue) => {
    if (!readonly && onChange) onChange(starValue);
  };

  return (
    <div
      className="inline-flex items-center gap-0.5"
      role="group"
      aria-label={`Rating: ${value} out of ${TOTAL_STARS}`}
      onMouseLeave={handleMouseLeave}
    >
      {Array.from({ length: TOTAL_STARS }, (_, i) => {
        const starValue = i + 1;
        const starType = getStarType(i, displayValue);

        return (
          <label
            key={i}
            className={`relative inline-flex cursor-pointer ${readonly ? 'cursor-default' : 'cursor-pointer'}`}
            title={readonly ? undefined : `Rate ${starValue} star${starValue > 1 ? 's' : ''}`}
            onMouseEnter={() => handleMouseEnter(starValue)}
            onClick={() => !readonly && handleChange(starValue)}
          >
            {/* Visually hidden radio input for accessibility */}
            <input
              type="radio"
              name={groupName}
              value={starValue}
              checked={value === starValue}
              onChange={() => handleChange(starValue)}
              disabled={readonly}
              aria-label={`${starValue} star${starValue > 1 ? 's' : ''}`}
              className="sr-only"
            />
            <StarIcon type={starType} />
          </label>
        );
      })}
    </div>
  );
}
