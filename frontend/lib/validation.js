/** Matches a valid Stellar public (G-address): G + 55 Base32 chars (A-Z, 2-7). */
const STELLAR_ADDRESS_RE = /^G[A-Z2-7]{55}$/;

/**
 * Returns true if the given string is a valid Stellar G-address.
 * Trims whitespace before checking so copy-paste errors are handled gracefully.
 *
 * @param {string} address
 * @returns {boolean}
 */
export function isValidStellarAddress(address) {
  if (typeof address !== 'string') return false;
  return STELLAR_ADDRESS_RE.test(address.trim());
}

/**
 * Returns the UTF-8 byte length of a string, matching the Soroban contract's
 * byte-based length constraints rather than JavaScript character count.
 *
 * @param {string} value
 * @returns {number}
 */
export function utf8ByteLength(value) {
  if (typeof value !== 'string') return 0;
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(value).length;
  }
  // Fallback for environments without TextEncoder (e.g. older Node).
  if (typeof Buffer !== 'undefined') {
    return Buffer.byteLength(value, 'utf8');
  }
  // Manual fallback: count UTF-8 bytes per code point.
  let bytes = 0;
  for (const ch of value) {
    const code = ch.codePointAt(0);
    if (code <= 0x7f) bytes += 1;
    else if (code <= 0x7ff) bytes += 2;
    else if (code <= 0xffff) bytes += 3;
    else bytes += 4;
  }
  return bytes;
}

/**
 * Validates that a string's UTF-8 byte length is within the given bounds,
 * matching the Soroban contract's byte-length constraints.
 *
 * @param {string} value
 * @param {object} [options]
 * @param {number} [options.maxBytes] Maximum allowed UTF-8 byte length.
 * @param {number} [options.minBytes] Minimum allowed UTF-8 byte length.
 * @param {string} [options.field] Field name used in error messages.
 * @param {boolean} [options.required] Whether an empty value is an error.
 * @returns {{ valid: boolean, error: string | null }}
 */
export function validateByteLength(value, options = {}) {
  const {
    maxBytes,
    minBytes,
    field = 'value',
    required = false,
  } = options;

  const str = typeof value === 'string' ? value : '';

  if (str.length === 0) {
    if (required) {
      return { valid: false, error: `${field} is required.` };
    }
    return { valid: true, error: null };
  }

  const bytes = utf8ByteLength(str);

  if (typeof minBytes === 'number' && bytes < minBytes) {
    return {
      valid: false,
      error: `${field} must be at least ${minBytes} bytes (currently ${bytes}).`,
    };
  }

  if (typeof maxBytes === 'number' && bytes > maxBytes) {
    return {
      valid: false,
      error: `${field} must be at most ${maxBytes} bytes (currently ${bytes}).`,
    };
  }

  return { valid: true, error: null };
}

/**
 * Validates a set of fields against their byte-length constraints and returns
 * a map of field-level errors. Fields without errors are omitted from the map.
 *
 * @param {Record<string, string>} values
 * @param {Record<string, { maxBytes?: number, minBytes?: number, required?: boolean }>} constraints
 * @returns {Record<string, string>}
 */
export function validateFieldsByteLength(values, constraints) {
  const errors = {};
  for (const [field, options] of Object.entries(constraints)) {
    const result = validateByteLength(values[field], { ...options, field });
    if (!result.valid) {
      errors[field] = result.error;
    }
  }
  return errors;
}