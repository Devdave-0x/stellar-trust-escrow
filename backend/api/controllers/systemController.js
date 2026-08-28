/**
 * System Controller
 *
 * Admin-facing operational endpoints (shutdown/drain state, etc.).
 */

import respond from '../../lib/respond.js';
import { getShutdownState } from '../../lib/gracefulShutdown.js';

function getShutdownStatus(req, res) {
  return respond.success(res, getShutdownState());
}

export default { getShutdownStatus };
