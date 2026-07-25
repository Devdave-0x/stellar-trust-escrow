/**
 * Session Controller
 *
 * Lets an authenticated user see every device they're logged in from and
 * revoke sessions individually or all-but-the-current-one. Mounted at both
 * /api/users/me/sessions and /api/auth/sessions.
 */

import sessionService from '../../services/sessionService.js';
import { logControllerError } from '../../config/logger.js';

/**
 * GET /api/users/me/sessions
 * List the authenticated user's active sessions, most recently active first,
 * with the session used for this request flagged via `current: true`.
 */
export const listSessions = async (req, res) => {
  try {
    const userId = req.user?.address;
    if (!userId) return res.status(401).json({ error: 'Authentication required' });

    const sessions = await sessionService.listSessions(userId, req.user?.jti);
    res.json({ data: sessions });
  } catch (err) {
    logControllerError('session.listSessions', err, req);
    res.status(500).json({ error: err.message });
  }
};

/**
 * DELETE /api/users/me/sessions/:id
 * Revoke a single session belonging to the authenticated user.
 */
export const revokeSession = async (req, res) => {
  try {
    const userId = req.user?.address;
    if (!userId) return res.status(401).json({ error: 'Authentication required' });

    const { id } = req.params;
    if (!id) return res.status(400).json({ error: 'Session id required' });

    const revoked = await sessionService.revokeSession(userId, id);
    if (!revoked) return res.status(404).json({ error: 'Session not found' });

    res.json({ ok: true });
  } catch (err) {
    logControllerError('session.revokeSession', err, req);
    res.status(500).json({ error: err.message });
  }
};

/**
 * DELETE /api/users/me/sessions
 * Revoke every session for the authenticated user except the one making
 * this request ("sign out everywhere else").
 */
export const revokeAllSessions = async (req, res) => {
  try {
    const userId = req.user?.address;
    if (!userId) return res.status(401).json({ error: 'Authentication required' });

    const result = await sessionService.revokeAllExcept(userId, req.user?.jti);
    res.json({ ok: true, revoked: result.count });
  } catch (err) {
    logControllerError('session.revokeAllSessions', err, req);
    res.status(500).json({ error: err.message });
  }
};

export default { listSessions, revokeSession, revokeAllSessions };
