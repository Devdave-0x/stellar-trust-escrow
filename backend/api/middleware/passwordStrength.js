/**
 * Password strength validation middleware.
 *
 * Validates the `password` field in req.body against a set of rules and
 * returns structured feedback on failure rather than a generic 400.
 *
 * Rules:
 *   - Minimum 8 characters
 *   - At least one uppercase letter [A-Z]
 *   - At least one lowercase letter [a-z]
 *   - At least one digit [0-9]
 *   - At least one special character (!@#$%^&* etc.)
 *   - No leading or trailing whitespace
 *
 * On failure responds with:
 *   { error: 'Password does not meet strength requirements', rules: [...] }
 *
 * Each rule entry: { rule: string, passed: boolean, description: string }
 *
 * Usage:
 *   router.post('/register', validatePasswordStrength(), authController.register);
 *   router.post('/reset-password', validatePasswordStrength({ field: 'newPassword' }), authController.resetPassword);
 */

const RULES = [
  {
    rule: 'minLength',
    description: 'At least 8 characters',
    test: (p) => p.length >= 8,
  },
  {
    rule: 'uppercase',
    description: 'At least one uppercase letter (A–Z)',
    test: (p) => /[A-Z]/.test(p),
  },
  {
    rule: 'lowercase',
    description: 'At least one lowercase letter (a–z)',
    test: (p) => /[a-z]/.test(p),
  },
  {
    rule: 'digit',
    description: 'At least one digit (0–9)',
    test: (p) => /[0-9]/.test(p),
  },
  {
    rule: 'specialChar',
    description: 'At least one special character (!@#$%^&*()_+-=[]{}|;:,.<>?)',
    test: (p) => /[!@#$%^&*()\-_=+[\]{}|;:'",.<>?/\\`~]/.test(p),
  },
  {
    rule: 'noWhitespace',
    description: 'No leading or trailing whitespace',
    test: (p) => p === p.trim(),
  },
];

/**
 * @param {{ field?: string, optional?: boolean }} [options]
 *   field    — name of the body field to validate (default: 'password')
 *   optional — if true, skip validation when the field is absent (default: false)
 * @returns {import('express').RequestHandler}
 */
export function validatePasswordStrength(options = {}) {
  const { field = 'password', optional = false } = options;

  return (req, res, next) => {
    const password = req.body?.[field];

    if (password === undefined || password === null || password === '') {
      if (optional) return next();
      return res.status(400).json({
        error: 'Password does not meet strength requirements',
        rules: RULES.map((r) => ({ rule: r.rule, passed: false, description: r.description })),
      });
    }

    const results = RULES.map((r) => ({
      rule: r.rule,
      passed: r.test(password),
      description: r.description,
    }));

    const failed = results.filter((r) => !r.passed);
    if (failed.length > 0) {
      return res.status(400).json({
        error: 'Password does not meet strength requirements',
        rules: results,
      });
    }

    next();
  };
}

export default validatePasswordStrength;
