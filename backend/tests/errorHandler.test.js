/**
 * Tests for middleware/errorHandler.js
 *
 * Covers:
 * - Each custom error class (statusCode, default message, default code)
 * - errorHandler middleware response shape for every error type
 * - Stack-trace behaviour: present in development, absent in production
 * - Standard error envelope: { error: string, code?: string }
 */

import { jest } from '@jest/globals';
import {
  AppError,
  ValidationError,
  NotFoundError,
  AuthError,
  ForbiddenError,
  errorHandler,
} from '../middleware/errorHandler.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build a minimal Express-like req/res/next triple.
 * `res.json` stores the last value passed to it so we can assert on it.
 */
function makeContext() {
  const res = {
    _status: null,
    _body: null,
    status(code) {
      this._status = code;
      return this;
    },
    json(body) {
      this._body = body;
      return this;
    },
  };
  const req = {};
  const next = jest.fn();
  return { req, res, next };
}

/**
 * Invoke errorHandler and return the captured status + body.
 */
function handle(err, nodeEnv = 'test') {
  const originalEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = nodeEnv;
  try {
    const { req, res, next } = makeContext();
    errorHandler(err, req, res, next);
    return { status: res._status, body: res._body, next };
  } finally {
    process.env.NODE_ENV = originalEnv;
  }
}

// ── Error class unit tests ────────────────────────────────────────────────────

describe('ValidationError', () => {
  it('has statusCode 422', () => {
    const err = new ValidationError();
    expect(err.statusCode).toBe(422);
  });

  it('has default message "Validation failed"', () => {
    const err = new ValidationError();
    expect(err.message).toBe('Validation failed');
  });

  it('has default code "VALIDATION_ERROR"', () => {
    const err = new ValidationError();
    expect(err.code).toBe('VALIDATION_ERROR');
  });

  it('accepts a custom message and code', () => {
    const err = new ValidationError('Amount must be positive', 'INVALID_AMOUNT');
    expect(err.message).toBe('Amount must be positive');
    expect(err.code).toBe('INVALID_AMOUNT');
    expect(err.statusCode).toBe(422);
  });

  it('is an instance of AppError and Error', () => {
    const err = new ValidationError();
    expect(err).toBeInstanceOf(AppError);
    expect(err).toBeInstanceOf(Error);
  });
});

describe('NotFoundError', () => {
  it('has statusCode 404', () => {
    expect(new NotFoundError().statusCode).toBe(404);
  });

  it('has default message "Resource not found"', () => {
    expect(new NotFoundError().message).toBe('Resource not found');
  });

  it('has default code "NOT_FOUND"', () => {
    expect(new NotFoundError().code).toBe('NOT_FOUND');
  });

  it('accepts a custom message', () => {
    const err = new NotFoundError('Escrow #42 not found');
    expect(err.message).toBe('Escrow #42 not found');
    expect(err.statusCode).toBe(404);
  });

  it('is an instance of AppError and Error', () => {
    const err = new NotFoundError();
    expect(err).toBeInstanceOf(AppError);
    expect(err).toBeInstanceOf(Error);
  });
});

describe('AuthError', () => {
  it('has statusCode 401', () => {
    expect(new AuthError().statusCode).toBe(401);
  });

  it('has default message "Unauthorized"', () => {
    expect(new AuthError().message).toBe('Unauthorized');
  });

  it('has default code "UNAUTHORIZED"', () => {
    expect(new AuthError().code).toBe('UNAUTHORIZED');
  });

  it('accepts a custom message', () => {
    const err = new AuthError('Token expired');
    expect(err.message).toBe('Token expired');
    expect(err.statusCode).toBe(401);
  });

  it('is an instance of AppError and Error', () => {
    const err = new AuthError();
    expect(err).toBeInstanceOf(AppError);
    expect(err).toBeInstanceOf(Error);
  });
});

describe('ForbiddenError', () => {
  it('has statusCode 403', () => {
    expect(new ForbiddenError().statusCode).toBe(403);
  });

  it('has default message "Forbidden"', () => {
    expect(new ForbiddenError().message).toBe('Forbidden');
  });

  it('has default code "FORBIDDEN"', () => {
    expect(new ForbiddenError().code).toBe('FORBIDDEN');
  });

  it('accepts a custom message', () => {
    const err = new ForbiddenError('Admins only');
    expect(err.message).toBe('Admins only');
    expect(err.statusCode).toBe(403);
  });

  it('is an instance of AppError and Error', () => {
    const err = new ForbiddenError();
    expect(err).toBeInstanceOf(AppError);
    expect(err).toBeInstanceOf(Error);
  });
});

// ── errorHandler middleware tests ─────────────────────────────────────────────

describe('errorHandler middleware', () => {
  describe('ValidationError → 422', () => {
    it('sets status 422', () => {
      const { status } = handle(new ValidationError());
      expect(status).toBe(422);
    });

    it('includes the error message in the envelope', () => {
      const { body } = handle(new ValidationError('Amount must be positive'));
      expect(body.error).toBe('Amount must be positive');
    });

    it('includes the code in the envelope', () => {
      const { body } = handle(new ValidationError('bad', 'INVALID_AMOUNT'));
      expect(body.code).toBe('INVALID_AMOUNT');
    });

    it('does not include a stack trace', () => {
      const { body } = handle(new ValidationError());
      expect(body.stack).toBeUndefined();
    });
  });

  describe('NotFoundError → 404', () => {
    it('sets status 404', () => {
      expect(handle(new NotFoundError()).status).toBe(404);
    });

    it('includes the error message', () => {
      const { body } = handle(new NotFoundError('Escrow not found'));
      expect(body.error).toBe('Escrow not found');
    });

    it('includes the code', () => {
      const { body } = handle(new NotFoundError());
      expect(body.code).toBe('NOT_FOUND');
    });

    it('does not include a stack trace', () => {
      expect(handle(new NotFoundError()).body.stack).toBeUndefined();
    });
  });

  describe('AuthError → 401', () => {
    it('sets status 401', () => {
      expect(handle(new AuthError()).status).toBe(401);
    });

    it('includes the error message', () => {
      const { body } = handle(new AuthError('Token invalid'));
      expect(body.error).toBe('Token invalid');
    });

    it('includes the code', () => {
      const { body } = handle(new AuthError());
      expect(body.code).toBe('UNAUTHORIZED');
    });

    it('does not include a stack trace', () => {
      expect(handle(new AuthError()).body.stack).toBeUndefined();
    });
  });

  describe('ForbiddenError → 403', () => {
    it('sets status 403', () => {
      expect(handle(new ForbiddenError()).status).toBe(403);
    });

    it('includes the error message', () => {
      const { body } = handle(new ForbiddenError('Admins only'));
      expect(body.error).toBe('Admins only');
    });

    it('includes the code', () => {
      const { body } = handle(new ForbiddenError());
      expect(body.code).toBe('FORBIDDEN');
    });

    it('does not include a stack trace', () => {
      expect(handle(new ForbiddenError()).body.stack).toBeUndefined();
    });
  });

  describe('unhandled / generic Error → 500', () => {
    it('sets status 500 for a plain Error', () => {
      expect(handle(new Error('boom')).status).toBe(500);
    });

    it('uses the error message when provided', () => {
      expect(handle(new Error('Database connection lost')).body.error).toBe(
        'Database connection lost',
      );
    });

    it('falls back to "Internal server error" when message is empty', () => {
      const err = new Error('');
      expect(handle(err).body.error).toBe('Internal server error');
    });

    it('does not include code when the error has none', () => {
      expect(handle(new Error('oops')).body.code).toBeUndefined();
    });

    it('honours a custom statusCode on an error object', () => {
      const err = Object.assign(new Error('custom'), { statusCode: 503 });
      expect(handle(err).status).toBe(503);
    });
  });

  // ── Stack-trace leakage ────────────────────────────────────────────────────

  describe('production mode — stack traces must not be leaked', () => {
    it('omits stack from 500 responses in production', () => {
      const { body } = handle(new Error('crash'), 'production');
      expect(body.stack).toBeUndefined();
    });

    it('omits stack from AppError with custom statusCode ≥ 500 in production', () => {
      const err = Object.assign(new Error('svc unavailable'), { statusCode: 503 });
      const { body } = handle(err, 'production');
      expect(body.stack).toBeUndefined();
    });

    it('omits stack from 4xx responses in production', () => {
      const { body } = handle(new NotFoundError(), 'production');
      expect(body.stack).toBeUndefined();
    });
  });

  describe('development mode — stack traces included in 5xx', () => {
    it('includes stack in 500 responses in development', () => {
      const { body } = handle(new Error('dev crash'), 'development');
      expect(typeof body.stack).toBe('string');
      expect(body.stack.length).toBeGreaterThan(0);
    });

    it('includes stack for AppError with statusCode ≥ 500 in development', () => {
      const err = Object.assign(new Error('svc down'), { statusCode: 502 });
      const { body } = handle(err, 'development');
      expect(typeof body.stack).toBe('string');
    });

    it('does NOT include stack for 4xx errors in development', () => {
      const { body } = handle(new NotFoundError(), 'development');
      expect(body.stack).toBeUndefined();
    });

    it('does NOT include stack for 4xx validation errors in development', () => {
      const { body } = handle(new ValidationError(), 'development');
      expect(body.stack).toBeUndefined();
    });
  });

  describe('test / non-production mode — stack traces included in 5xx', () => {
    it('includes stack in 500 responses when NODE_ENV=test', () => {
      // handle() defaults to 'test'
      const { body } = handle(new Error('test crash'));
      expect(typeof body.stack).toBe('string');
    });
  });

  // ── Error envelope shape ───────────────────────────────────────────────────

  describe('standard error envelope', () => {
    it('always has an "error" string key', () => {
      for (const err of [
        new ValidationError(),
        new NotFoundError(),
        new AuthError(),
        new ForbiddenError(),
        new Error('boom'),
      ]) {
        const { body } = handle(err);
        expect(typeof body.error).toBe('string');
      }
    });

    it('includes "code" only when the error carries one', () => {
      const withCode = handle(new ValidationError('bad', 'INVALID'));
      expect(withCode.body.code).toBe('INVALID');

      const withoutCode = handle(new Error('generic'));
      expect(withoutCode.body.code).toBeUndefined();
    });

    it('does not include unexpected keys in 4xx production responses', () => {
      const { body } = handle(new NotFoundError(), 'production');
      const keys = Object.keys(body);
      expect(keys).toEqual(expect.arrayContaining(['error', 'code']));
      expect(keys).not.toContain('stack');
    });

    it('does not call next()', () => {
      const { next } = handle(new NotFoundError());
      expect(next).not.toHaveBeenCalled();
    });
  });
});
