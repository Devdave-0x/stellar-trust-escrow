/**
 * Reputation Controller
 * Handles reputation score queries and leaderboard.
 */

/**
 * GET /api/reputation/:address
 *
 * Returns the full on-chain reputation record for a Stellar address.
 * Data is synced from contract events by the escrowIndexer.
 *
 * Response shape:
 * {
 *   address: string,
 *   total_score: number,
 *   completed_escrows: number,
 *   disputed_escrows: number,
 *   disputes_won: number,
 *   total_volume: string,   // BigInt as string
 *   last_updated: number,   // Unix timestamp
 *   rank: number | null     // percentile rank, if computed
 * }
 *
 * TODO (contributor — medium, Issue #25):
 * 1. Validate address is a valid Stellar public key
 * 2. Query ReputationRecord from DB
 * 3. If not found, return a zero-score default record (not 404)
 * 4. Optionally compute rank percentile across all users
 */
const getReputation = async (req, res) => {
  try {
    const { address } = req.params;
    // TODO: implement DB query
    res.status(501).json({ error: 'Not implemented — see Issue #25', address });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * GET /api/reputation/leaderboard
 *
 * Returns top users ranked by reputation score.
 *
 * Query params:
 *   - limit {number} default 20, max 100
 *   - page  {number} default 1
 *
 * TODO (contributor — medium, Issue #22):
 * 1. Query top N reputation records ordered by total_score DESC
 * 2. Include rank numbers
 * 3. Include abbreviated address (first 6 + last 4 chars)
 */
const getLeaderboard = async (req, res) => {
  try {
    const { limit = 20, page = 1 } = req.query;
    // TODO: implement
    res.status(501).json({ error: 'Not implemented — see Issue #22', limit, page });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export default {
  getReputation,
  getLeaderboard,
};
