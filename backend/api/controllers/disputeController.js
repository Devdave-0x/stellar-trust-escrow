/**
 * Dispute Controller
 * Handles dispute listing and detail queries.
 */

/**
 * GET /api/disputes
 *
 * Returns all escrows currently in Disputed status.
 *
 * TODO (contributor — easy, Issue #26):
 * 1. Query escrows where status = 'Disputed'
 * 2. Include escrow summary + raised_at timestamp + raised_by address
 * 3. Paginate results
 */
const listDisputes = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    // TODO: implement
    res.status(501).json({ error: 'Not implemented — see Issue #26', page, limit });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * GET /api/disputes/:escrowId
 *
 * Returns dispute details for a specific escrow.
 * Includes: raised_by, raised_at, arbiter (if any), resolution (if resolved).
 *
 * TODO (contributor — easy, Issue #26)
 */
const getDispute = async (req, res) => {
  try {
    const { escrowId } = req.params;
    // TODO: implement
    res.status(501).json({ error: 'Not implemented — see Issue #26', escrowId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export default { listDisputes, getDispute };
