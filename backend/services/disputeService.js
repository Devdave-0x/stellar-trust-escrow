const DISPUTE_EMPTY_STATE = {
  title: 'No disputes found',
  description: 'There are no dispute records available for the current query.',
  action: 'Adjust the dispute filters or create a dispute before retrying.',
};

/**
 * Standardized null or undefined check helper.
 */
export function isNil(val) {
  return val == null;
}

export function getDisputeEmptyState(query) {
  if (isNil(query)) {
    return DISPUTE_EMPTY_STATE;
  }
  return {
    ...DISPUTE_EMPTY_STATE,
    query,
  };
}

export function validateDisputeInput(escrowId, reason) {
  if (isNil(escrowId) || isNil(reason)) {
    throw new Error('Escrow ID and reason are required');
  }
  return true;
}

export default {
  isNil,
  getDisputeEmptyState,
  validateDisputeInput,
};
