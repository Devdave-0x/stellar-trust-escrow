'use client';

import { useMemo, useState } from 'react';

/**
 * Default asset precision for Stellar assets (XLM stroops = 7 decimals).
 */
export const DEFAULT_PRECISION = 7;

/**
 * Convert a user-entered decimal amount string into integer stroops (or
 * asset units at the given precision) without any floating-point conversion.
 *
 * The amount is parsed as a string, split into integer and fractional parts,
 * and the fractional part is right-padded to the asset precision. The result
 * is built via string concatenation and returned as a BigInt so that maximum
 * precision values round-trip exactly.
 *
 * @param {string} amount - The user-entered amount, e.g. "12.3456789".
 * @param {number} [precision=DEFAULT_PRECISION] - Number of decimal places.
 * @returns {bigint} The integer value in the smallest asset unit.
 * @throws {Error} If the amount is malformed or has too many decimals.
 */
export function amountToStroops(amount, precision = DEFAULT_PRECISION) {
  if (typeof amount !== 'string') {
    throw new Error('Amount must be a string');
  }

  const trimmed = amount.trim();
  if (trimmed === '') {
    throw new Error('Amount is required');
  }

  if (!/^\d*(\.\d*)?$/.test(trimmed) || trimmed === '.') {
    throw new Error('Amount must be a valid number');
  }

  const [rawInt = '', rawFrac = ''] = trimmed.split('.');

  if (rawFrac.length > precision) {
    throw new Error(
      `Amount supports at most ${precision} decimal place${precision === 1 ? '' : 's'}`
    );
  }

  const intPart = rawInt === '' ? '0' : rawInt;
  const fracPart = rawFrac.padEnd(precision, '0');

  // Build the integer string without Number/parseFloat.
  const combined = `${intPart}${fracPart}`.replace(/^0+(?=\d)/, '');

  return BigInt(combined === '' ? '0' : combined);
}

/**
 * Convert an integer stroop (or smallest asset unit) value back into a
 * decimal amount string at the given precision, preserving exact precision.
 *
 * @param {bigint|string|number} stroops - The integer value in smallest units.
 * @param {number} [precision=DEFAULT_PRECISION] - Number of decimal places.
 * @returns {string} The decimal amount string, e.g. "12.3456789".
 */
export function stroopsToAmount(stroops, precision = DEFAULT_PRECISION) {
  let value;
  if (typeof stroops === 'bigint') {
    value = stroops;
  } else if (typeof stroops === 'string') {
    if (!/^-?\d+$/.test(stroops.trim())) {
      throw new Error('Stroops must be an integer');
    }
    value = BigInt(stroops.trim());
  } else if (typeof stroops === 'number') {
    if (!Number.isInteger(stroops)) {
      throw new Error('Stroops must be an integer');
    }
    value = BigInt(stroops);
  } else {
    throw new Error('Stroops must be a bigint, integer string, or integer number');
  }

  const negative = value < 0n;
  const abs = negative ? -value : value;

  const digits = abs.toString().padStart(precision + 1, '0');
  const intPart = digits.slice(0, digits.length - precision) || '0';
  const fracPart = precision > 0 ? digits.slice(digits.length - precision) : '';

  const result = precision > 0 ? `${intPart}.${fracPart}` : intPart;
  return negative ? `-${result}` : result;
}

/**
 * Validate a user-entered amount string against the asset precision.
 *
 * @param {string} amount
 * @param {number} [precision=DEFAULT_PRECISION]
 * @returns {{ valid: boolean, error: string|null, stroops: bigint|null }}
 */
export function validateAmount(amount, precision = DEFAULT_PRECISION) {
  try {
    const stroops = amountToStroops(amount, precision);
    return { valid: true, error: null, stroops };
  } catch (err) {
    return { valid: false, error: err.message, stroops: null };
  }
}

/**
 * EscrowForm renders an amount input that preserves exact token precision.
 *
 * The amount is validated as a string before submission; if it has more
 * decimals than the asset supports, submission is blocked with an inline
 * error before any signing occurs.
 *
 * @param {object} props
 * @param {number} [props.precision=DEFAULT_PRECISION] - Asset decimal precision.
 * @param {string} [props.assetCode='XLM'] - Asset code shown in the label.
 * @param {(stroops: bigint, amount: string) => void|Promise<void>} [props.onSubmit]
 *   Called with the exact integer stroop value and the normalized amount string.
 * @param {string} [props.submitLabel='Create Escrow']
 */
export default function EscrowForm({
  precision = DEFAULT_PRECISION,
  assetCode = 'XLM',
  onSubmit,
  submitLabel = 'Create Escrow',
}) {
  const [amount, setAmount] = useState('');
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  const validation = useMemo(() => {
    if (amount.trim() === '') {
      return { valid: false, error: null, stroops: null };
    }
    return validateAmount(amount, precision);
  }, [amount, precision]);

  const showError = touched && !validation.valid && validation.error;

  const handleChange = (event) => {
    setAmount(event.target.value);
    setSubmitError(null);
  };

  const handleBlur = () => {
    setTouched(true);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setTouched(true);
    setSubmitError(null);

    const result = validateAmount(amount, precision);
    if (!result.valid) {
      // Block submission before any signing occurs.
      return;
    }

    if (typeof onSubmit !== 'function') {
      return;
    }

    try {
      setSubmitting(true);
      const normalized = stroopsToAmount(result.stroops, precision);
      await onSubmit(result.stroops, normalized);
    } catch (err) {
      setSubmitError(err?.message || 'Failed to submit escrow');
    } finally {
      setSubmitting(false);
    }
  };

  const disabled = submitting || !validation.valid;

  return (
    <form className="escrow-form" onSubmit={handleSubmit} noValidate>
      <label className="escrow-form__label" htmlFor="escrow-amount">
        Amount ({assetCode})
      </label>
      <input
        id="escrow-amount"
        className="escrow-form__input"
        type="text"
        inputMode="decimal"
        autoComplete="off"
        placeholder={`0.${'0'.repeat(precision)}`}
        value={amount}
        onChange={handleChange}
        onBlur={handleBlur}
        aria-invalid={showError ? 'true' : 'false'}
        aria-describedby={showError ? 'escrow-amount-error' : undefined}
      />
      <p className="escrow-form__hint">
        Up to {precision} decimal place{precision === 1 ? '' : 's'}.
      </p>
      {showError && (
        <p id="escrow-amount-error" className="escrow-form__error" role="alert">
          {validation.error}
        </p>
      )}
      {submitError && (
        <p className="escrow-form__error" role="alert">
          {submitError}
        </p>
      )}
      <button
        className="escrow-form__submit"
        type="submit"
        disabled={disabled}
      >
        {submitting ? 'Submitting…' : submitLabel}
      </button>
    </form>
  );
}