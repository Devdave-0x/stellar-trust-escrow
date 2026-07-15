const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const parseCursor = (cursor) => {
  if (!cursor) return null;
  try {
    return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
};

const encodeCursor = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');

const parseLimit = (raw) => {
  const n = parseInt(raw, 10);
  if (!n || n < 1) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
};

module.exports = { parseCursor, encodeCursor, parseLimit, DEFAULT_LIMIT };
