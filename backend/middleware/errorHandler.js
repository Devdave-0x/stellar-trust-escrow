/**
 * Error Handler Middleware
 *
 * Defines application-specific error classes and the global Express error
 * handler that converts them into consistent JSON responses.
 *
 * Error envelope:
 *   { error: string, code?: string }
 *
 * Stack traces are included in the `stack` field in development mode only
 * (NODE_ENV !== 'production') for unhandled 5xx errors.
 */

// ── Custom error classes ──────────────────────────────────────────────────────

/**
 * Base class for all application errors.
 * Carries an HTTP status code and an optional machine-readable code.
 */
export class AppError extends Error {
  /**
   * @param {string} message  Human-readable error description.
   * @param {number} statusCode  HTTP status code to send.
   * @param {string} [code]  Machine-readable error code (e.g. 'NOT_FOUND').
   */
  constructor(message, statusCode, code) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    if (code !== undefined) this.code = code;
    // Maintain proper prototype chain in transpiled environments
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * 422 Unprocessable Entity — the request is well-formed but contains invalid
 * data that fails business-rule validation.
 */
export class ValidationError extends AppError {
  constructor(message = 'Validation failed', code = 'VALIDATION_ERROR') {
    super(message, 422, code);
  }
}

/**
 * 404 Not Found — the requested resource does not exist.
 */
export class NotFoundError extends AppError {
  constructor(message = 'Resource not found', code = 'NOT_FOUND') {
    super(message, 404, code);
  }
}

/**
 * 401 Unauthorized — the request lacks valid authentication credentials.
 */
export class AuthError extends AppError {
  constructor(message = 'Unauthorized', code = 'UNAUTHORIZED') {
    super(message, 401, code);
  }
}

/**
 * 403 Forbidden — the requester is authenticated but lacks permission.
 */
export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden', code = 'FORBIDDEN') {
    super(message, 403, code);
  }
}

// ── Global error handler middleware ──────────────────────────────────────────

/**
 * Express 4-argument error handler.  Must be registered **after** all routes.
 *
 * Behaviour:
 * - Known AppError subclasses → their statusCode + code
 * - Unknown errors            → 500 (Internal server error)
 * - In non-production         → attaches `stack` to 5xx responses
 *
 * @param {Error}                    err
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} _next
 */
export function errorHandler(err, req, res, _next) {
  const statusCode = err.statusCode || 500;

  /** @type {{ error: string, code?: string, stack?: string }} */
  const body = {
    error: err.message || 'Internal server error',
  };

  if (err.code !== undefined) {
    body.code = err.code;
  }

  // Leak stack traces only in non-production environments and only for 5xx
  if (statusCode >= 500 && process.env.NODE_ENV !== 'production') {
    body.stack = err.stack;
  }

  res.status(statusCode).json(body);
}
