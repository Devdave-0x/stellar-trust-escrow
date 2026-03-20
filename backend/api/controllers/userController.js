/**
 * User Controller
 * Handles profile, history, and stats queries for Stellar addresses.
 */

/**
 * GET /api/users/:address
 *
 * Returns combined profile: reputation record + recent escrow summaries.
 *
 * TODO (contributor — medium, Issue #24):
 * 1. Validate that `address` is a valid Stellar public key (starts with G)
 * 2. Query reputation from DB
 * 3. Query recent escrows (last 5) from DB
 * 4. Return combined profile object
 */
const getUserProfile = async (req, res) => {
  try {
    const { address } = req.params;
    // TODO: validate address format
    // TODO: query and return profile
    res.status(501).json({ error: 'Not implemented — see Issue #24', address });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * GET /api/users/:address/escrows
 *
 * Returns paginated escrow list for a user (as client or freelancer).
 *
 * TODO (contributor — medium, Issue #24)
 */
const getUserEscrows = async (req, res) => {
  try {
    const { address } = req.params;
    const { role = 'all', status, page = 1, limit = 20 } = req.query;
    // TODO: implement
    res
      .status(501)
      .json({ error: 'Not implemented — see Issue #24', address, role, status, page, limit });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * GET /api/users/:address/stats
 *
 * Returns aggregated metrics for a user.
 * E.g. total_volume, completion_rate, avg_milestone_approval_time_hours
 *
 * TODO (contributor — medium, Issue #21)
 */
const getUserStats = async (req, res) => {
  try {
    res.status(501).json({ error: 'Not implemented — see Issue #21' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export default { getUserProfile, getUserEscrows, getUserStats };
