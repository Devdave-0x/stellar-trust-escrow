const DISPUTE_EMPTY_STATE = {
  title: 'No disputes found',
  description: 'There are no dispute records available for the current query.',
  action: 'Adjust the dispute filters or create a dispute before retrying.',
};

export function getDisputeEmptyState() {
  return DISPUTE_EMPTY_STATE;
}

export default {
  getDisputeEmptyState,
};
