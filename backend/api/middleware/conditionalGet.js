import { createHash } from 'crypto';

/**
 * Generates a strong ETag from a JSON-serialisable body.
 * @param {unknown} body
 * @returns {string}  quoted ETag value, e.g. '"abc123"'
 */
function generateETag(body) {
  const hash = createHash('sha1')
    .update(typeof body === 'string' ? body : JSON.stringify(body))
    .digest('hex')
    .slice(0, 27);
  return `"${hash}"`;
}

/**
 * Express middleware that adds ETag and Last-Modified headers to GET/HEAD
 * responses and handles conditional requests (If-None-Match, If-Modified-Since).
 *
 * Usage:
 *   router.get('/resource', conditionalGet(), controller.get);
 *
 * The middleware intercepts res.json() to:
 *   1. Compute an ETag from the response body.
 *   2. Set Last-Modified from options.lastModifiedFn(req, body) or now.
 *   3. Return 304 Not Modified when the client's conditional headers match.
 *
 * @param {{ lastModifiedFn?: (req, body) => Date }} [options]
 * @returns {import('express').RequestHandler}
 */
export function conditionalGet(options = {}) {
  const { lastModifiedFn } = options;

  return (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();

    const originalJson = res.json.bind(res);

    res.json = function (body) {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        return originalJson(body);
      }

      const etag = generateETag(body);
      const lastModified = lastModifiedFn ? lastModifiedFn(req, body) : new Date();

      res.setHeader('ETag', etag);
      res.setHeader('Last-Modified', lastModified.toUTCString());
      res.setHeader('Cache-Control', res.getHeader('Cache-Control') || 'no-cache');

      // Check If-None-Match
      const ifNoneMatch = req.headers['if-none-match'];
      if (ifNoneMatch) {
        const tags = ifNoneMatch.split(',').map((t) => t.trim());
        if (tags.includes(etag) || tags.includes('*')) {
          return res.status(304).end();
        }
      }

      // Check If-Modified-Since (only when no If-None-Match present)
      if (!ifNoneMatch) {
        const ifModifiedSince = req.headers['if-modified-since'];
        if (ifModifiedSince) {
          const since = new Date(ifModifiedSince);
          if (!isNaN(since) && lastModified <= since) {
            return res.status(304).end();
          }
        }
      }

      return originalJson(body);
    };

    next();
  };
}

export default conditionalGet;
