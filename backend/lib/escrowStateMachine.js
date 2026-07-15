const TRANSITIONS = {
  draft: ['funded'],
  funded: ['in_progress', 'cancelled', 'expired'],
  in_progress: ['release_requested', 'disputed', 'cancelled', 'expired'],
  release_requested: ['released', 'disputed'],
  disputed: ['resolved', 'cancelled'],
  resolved: [],
  released: [],
  cancelled: [],
  expired: [],
};

const transition = (escrow, action) => {
  const allowed = TRANSITIONS[escrow.status] ?? [];
  if (!allowed.includes(action)) {
    const err = new Error(`Cannot transition from '${escrow.status}' to '${action}'`);
    err.code = 'INVALID_TRANSITION';
    err.status = 409;
    throw err;
  }
  return { ...escrow, status: action };
};

const isTerminal = (status) => TRANSITIONS[status]?.length === 0;

module.exports = { transition, isTerminal, TRANSITIONS };
