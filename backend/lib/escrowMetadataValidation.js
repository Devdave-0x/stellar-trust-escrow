/**
 * Validation for the escrow `metadata` JSONB field: tenant-defined structured
 * data (freelance/real-estate/product-purchase specific fields).
 *
 * Rules: plain object, at most MAX_KEYS keys, values restricted to
 * string/number/boolean (no nesting, arrays, or null values).
 */

export const MAX_METADATA_KEYS = 20;

/**
 * @param {unknown} metadata
 * @returns {{ valid: true } | { valid: false, error: string }}
 */
export function validateEscrowMetadata(metadata) {
  if (metadata === undefined || metadata === null) return { valid: true };

  if (typeof metadata !== 'object' || Array.isArray(metadata)) {
    return { valid: false, error: 'metadata must be a JSON object' };
  }

  const keys = Object.keys(metadata);
  if (keys.length > MAX_METADATA_KEYS) {
    return { valid: false, error: `metadata must have at most ${MAX_METADATA_KEYS} keys` };
  }

  for (const key of keys) {
    const value = metadata[key];
    const type = typeof value;

    if (type !== 'string' && type !== 'number' && type !== 'boolean') {
      return {
        valid: false,
        error: `metadata.${key} must be a string, number, or boolean`,
      };
    }
    if (type === 'number' && !Number.isFinite(value)) {
      return { valid: false, error: `metadata.${key} must be a finite number` };
    }
  }

  return { valid: true };
}

export default { validateEscrowMetadata, MAX_METADATA_KEYS };
