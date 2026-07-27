import { randomUUID } from 'crypto';

/**
 * Build a standard success envelope.
 *
 * Shape:
 *   { data: <payload>, meta: { requestId, timestamp[, pagination] } }
 *
 * @param {import('express').Response} res
 * @param {*} data - payload to include under `data`
 * @param {object} [opts]
 * @param {number}  [opts.status=200]      - HTTP status code
 * @param {number}  [opts.created=false]   - use 201 for resource creation
 * @param {object}  [opts.pagination]      - { cursor, hasMore, total } for list responses
 */
export function success(res, data, { status, created = false, pagination } = {}) {
  const statusCode = status ?? (created ? 201 : 200);
  const meta = {
    requestId: res.req?.id ?? randomUUID(),
    timestamp: new Date().toISOString(),
  };
  if (pagination) meta.pagination = pagination;
  return res.status(statusCode).json({ data, meta });
}

/**
 * Build a standard error envelope.
 *
 * Shape:
 *   { error: { code, message[, fields] } }
 *
 * @param {import('express').Response} res
 * @param {number} status    - HTTP status code
 * @param {string} code      - machine-readable error code (e.g. 'VALIDATION_ERROR')
 * @param {string} message   - human-readable description
 * @param {Array}  [fields]  - per-field validation errors [{ field, message }]
 */
export function error(res, status, code, message, fields) {
  const body = { error: { code, message } };
  if (fields) body.error.fields = fields;
  return res.status(status).json(body);
}

export default { success, error };
