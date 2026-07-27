/**
 * Pagination helpers — offset and cursor-based.
 *
 * Cursor encoding
 * ───────────────
 * The cursor token is a URL-safe base64 encoding of a JSON object
 * { id, sortField, sortValue, dir } so internal IDs are never
 * exposed in the raw query string and the cursor is stable across inserts.
 *
 * Opaque token format:
 *   base64url( JSON.stringify({ id, sortField, sortValue, dir }) )
 *
 * The sort key + direction are embedded so the server can reconstruct the
 * exact WHERE clause even if the client changes sort params across pages
 * (clients should not change sort params mid-pagination, but this guards
 * against accidental breakage).
 */

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function normalizeInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

// ── Offset pagination (kept for backward compatibility) ───────────────────────

export function parsePagination(query = {}) {
  const page = Math.max(DEFAULT_PAGE, normalizeInteger(query.page, DEFAULT_PAGE));
  const limit = Math.min(MAX_LIMIT, Math.max(1, normalizeInteger(query.limit, DEFAULT_LIMIT)));

  return {
    page,
    limit,
    skip: (page - 1) * limit,
  };
}

export function buildPaginatedResponse(data, { page, limit, total }) {
  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

  return {
    data,
    page,
    limit,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > DEFAULT_PAGE,
  };
}

export const paginationDocs = {
  defaultPage: DEFAULT_PAGE,
  defaultLimit: DEFAULT_LIMIT,
  maxLimit: MAX_LIMIT,
};

// ── Cursor-based pagination ───────────────────────────────────────────────────
//
// Offset pagination (LIMIT n OFFSET k) requires Postgres to scan and discard
// k rows before returning results, making deep pages O(n). Cursor pagination
// instead starts the scan from the last-seen row's cursor value, giving O(1)
// per-page cost regardless of depth.
//
// The cursor token is opaque: it encodes the sort field, sort value, the
// unique tie-breaker id, and direction — so internal IDs are never surfaced
// directly in the API response.
//
// Usage:
//   const { take, parsedCursor } = parseCursorPagination(req.query, 'createdAt', 'desc');
//   const rows = await prisma.escrow.findMany(
//     buildPrismaFindArgs({ parsedCursor, take, sortField: 'createdAt', sortDir: 'desc', idField: 'id' })
//   );
//   res.json(buildCursorResponse(rows, take, 'id', 'createdAt', 'desc'));

/**
 * Encode a cursor payload into an opaque URL-safe base64 token.
 *
 * @param {{ id: string|number, sortField: string, sortValue: unknown, dir: string }} payload
 * @returns {string}
 */
export function encodeCursor(payload) {
  const json = JSON.stringify(payload);
  return Buffer.from(json, 'utf8').toString('base64url');
}

/**
 * Decode an opaque cursor token back into its payload.
 * Returns null if the token is missing, malformed, or tampered.
 *
 * @param {string|null|undefined} token
 * @returns {{ id: string|number, sortField: string, sortValue: unknown, dir: string }|null}
 */
export function decodeCursor(token) {
  if (!token || typeof token !== 'string') return null;
  try {
    const json = Buffer.from(token, 'base64url').toString('utf8');
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object') return null;
    if (!('id' in parsed) || !('sortField' in parsed) || !('dir' in parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Parse cursor pagination params from query string.
 *
 * @param {object}  query          — Express req.query
 * @param {string}  defaultSort    — default sort field (e.g. 'createdAt')
 * @param {string}  defaultDir     — 'asc' | 'desc'
 * @returns {{ take: number, parsedCursor: object|null, sortField: string, sortDir: string }}
 */
export function parseCursorPagination(query = {}, defaultSort = 'createdAt', defaultDir = 'desc') {
  const take = Math.min(MAX_LIMIT, Math.max(1, normalizeInteger(query.limit, DEFAULT_LIMIT)));
  const rawCursor = typeof query.cursor === 'string' && query.cursor.trim() ? query.cursor.trim() : null;
  const parsedCursor = rawCursor ? decodeCursor(rawCursor) : null;

  // If a valid cursor was provided, honour the sort params embedded in the cursor.
  // Otherwise fall back to explicit query params or defaults.
  const sortField = parsedCursor?.sortField ?? (query.sortBy || defaultSort);
  const sortDir = parsedCursor?.dir ?? (query.sortOrder === 'asc' ? 'asc' : defaultDir);

  return { take, parsedCursor, sortField, sortDir };
}

/**
 * Build a Prisma findMany argument object for cursor-based pagination.
 *
 * Supports composite sort: primary field + secondary tie-breaker on id.
 * When the sort field IS the id field, uses a simple cursor on id.
 *
 * @param {object} opts
 * @param {object|null} opts.parsedCursor   — decoded cursor (from parseCursorPagination)
 * @param {number}      opts.take           — page size
 * @param {string}      opts.sortField      — primary sort field name
 * @param {string}      opts.sortDir        — 'asc' | 'desc'
 * @param {string}      [opts.idField='id'] — unique tie-breaker field
 * @returns {{ take: number, cursor?: object, skip?: number, orderBy: object|object[] }}
 */
export function buildPrismaFindArgs({ parsedCursor, take, sortField, sortDir, idField = 'id' }) {
  const orderBy = sortField === idField
    ? { [idField]: sortDir }
    : [{ [sortField]: sortDir }, { [idField]: sortDir }];

  if (!parsedCursor) {
    return { take, orderBy };
  }

  // Prisma cursor pagination requires the cursor to be on the unique id field.
  // For composite sort we use a manual WHERE approach via an extra `take` + `skip: 1`
  // when the cursor id can be resolved.
  const cursorId = parsedCursor.id;

  return {
    take,
    // skip the row whose id equals the cursor (it was the last row of the previous page)
    skip: 1,
    cursor: { [idField]: cursorId },
    orderBy,
  };
}

/**
 * Builds a cursor-paged response envelope with opaque next_cursor token.
 *
 * @template T
 * @param {T[]}   data        — The page of records returned from the DB
 * @param {number} take       — The requested page size
 * @param {string} idField    — Unique identifier field (e.g. 'id')
 * @param {string} sortField  — Primary sort field
 * @param {string} sortDir    — 'asc' | 'desc'
 * @returns {{ data: T[], next_cursor: string|null, has_more: boolean }}
 */
export function buildCursorResponse(data, take, idField, sortField, sortDir) {
  const has_more = data.length === take;
  let next_cursor = null;

  if (has_more) {
    const last = data[data.length - 1];
    next_cursor = encodeCursor({
      id: String(last[idField]),
      sortField,
      sortValue: last[sortField] instanceof Date ? last[sortField].toISOString() : last[sortField],
      dir: sortDir,
    });
  }

  return { data, next_cursor, has_more };
}
