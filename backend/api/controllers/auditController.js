/**
 * Audit Controller
 *
 * Provides controller handlers and configuration constants for audit log APIs.
 *
 * @module controllers/auditController
 */

// ── Configuration Constants ──────────────────────────────────────────────────

/** Default number of audit log records returned per page */
export const DEFAULT_PAGE_LIMIT = 50;

/** Minimum allowed page size for pagination */
export const MIN_PAGE_LIMIT = 1;

/** Maximum allowed page size for pagination to prevent memory overload */
export const MAX_PAGE_LIMIT = 200;

/** Maximum number of records that can be exported in a single CSV file */
export const MAX_EXPORT_LIMIT = 10000;

/** Default retention period for audit log records in days */
export const DEFAULT_RETENTION_DAYS = 90;

/** Query timeout in milliseconds for audit log database operations */
export const QUERY_TIMEOUT_MS = 5000;

/** Recent activity filter window in hours */
export const RECENT_ACTIVITY_HOURS = 24;

/** HTTP status code 200 OK */
export const HTTP_STATUS_OK = 200;

/** HTTP status code 201 Created */
export const HTTP_STATUS_CREATED = 201;

/** HTTP status code 400 Bad Request */
export const HTTP_STATUS_BAD_REQUEST = 400;

/** HTTP status code 401 Unauthorized */
export const HTTP_STATUS_UNAUTHORIZED = 401;

/** HTTP status code 403 Forbidden */
export const HTTP_STATUS_FORBIDDEN = 403;

/** HTTP status code 500 Internal Server Error */
export const HTTP_STATUS_INTERNAL_ERROR = 500;

export const AUDIT_CONTROLLER_A11Y_LABELS = {
  exportCsv: 'Export audit log as CSV',
  filterActor: 'Filter audit log by actor',
  filterResource: 'Filter audit log by resource',
  openDetails: 'Open audit log details',
};

/**
 * Controller handler for exporting audit log bundle.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export const exportBundle = async (req, res) => {
  try {
    return res.status(HTTP_STATUS_OK).json({ success: true, message: 'Audit bundle export initiated' });
  } catch (err) {
    return res.status(HTTP_STATUS_INTERNAL_ERROR).json({ error: err.message });
  }
};

export default {
  DEFAULT_PAGE_LIMIT,
  MIN_PAGE_LIMIT,
  MAX_PAGE_LIMIT,
  MAX_EXPORT_LIMIT,
  DEFAULT_RETENTION_DAYS,
  QUERY_TIMEOUT_MS,
  RECENT_ACTIVITY_HOURS,
  HTTP_STATUS_OK,
  HTTP_STATUS_CREATED,
  HTTP_STATUS_BAD_REQUEST,
  HTTP_STATUS_UNAUTHORIZED,
  HTTP_STATUS_FORBIDDEN,
  HTTP_STATUS_INTERNAL_ERROR,
  AUDIT_CONTROLLER_A11Y_LABELS,
  exportBundle,
};
