/**
 * User Identity Middleware
 *
 * The platform identifies users by Stellar address rather than a session
 * system. Callers assert their identity via the `x-user-address` header;
 * this populates `req.userAddress` for downstream ownership checks.
 *
 * NOTE: this trusts the caller-supplied header. It is not a substitute for
 * real authentication (e.g. a signed challenge) — see Issue #221 for context.
 *
 * @module middleware/requireUser
 */

const STELLAR_ADDRESS_RE = /^G[A-Z2-7]{55}$/;

const requireUser = (req, res, next) => {
  const address = req.headers['x-user-address'];

  if (!address) {
    return res.status(401).json({ error: 'x-user-address header is required.' });
  }

  if (!STELLAR_ADDRESS_RE.test(address)) {
    return res.status(400).json({ error: 'x-user-address must be a valid Stellar address.' });
  }

  req.userAddress = address;
  next();
};

/** True if the request carries a valid admin API key, without rejecting the request. */
export const isAdminRequest = (req) => {
  const adminKey = process.env.ADMIN_API_KEY;
  const providedKey = req.headers['x-admin-api-key'];
  return Boolean(adminKey) && providedKey === adminKey;
};

export default requireUser;
