/**
 * Oracle quote freshness validation for conversion endpoints.
 */

const DEFAULT_MAX_AGE_MS = parseInt(process.env.ORACLE_QUOTE_MAX_AGE_MS || '30000', 10);
const DEFAULT_MAX_SKEW_MS = parseInt(process.env.ORACLE_CLOCK_SKEW_MS || '5000', 10);

export function validateQuoteFreshness(quote, now = Date.now()) {
  if (!quote || typeof quote !== 'object') {
    return { ok: false, code: 'ORACLE_QUOTE_INVALID', reason: 'missing quote' };
  }
  const quotedAt = Date.parse(quote.quotedAt ?? quote.timestamp ?? '');
  if (Number.isNaN(quotedAt)) {
    return { ok: false, code: 'ORACLE_QUOTE_INVALID', reason: 'missing quotedAt' };
  }
  if (quotedAt - now > DEFAULT_MAX_SKEW_MS) {
    return { ok: false, code: 'ORACLE_QUOTE_FUTURE', reason: 'quote is in the future' };
  }
  if (now - quotedAt > DEFAULT_MAX_AGE_MS) {
    return { ok: false, code: 'ORACLE_QUOTE_STALE', reason: 'quote expired' };
  }
  return { ok: true, ageMs: now - quotedAt };
}

export async function getValidatedConversion(quote, convertFn) {
  const validation = validateQuoteFreshness(quote);
  if (!validation.ok) {
    const err = new Error(validation.reason);
    err.code = validation.code;
    throw err;
  }
  return convertFn(quote);
}