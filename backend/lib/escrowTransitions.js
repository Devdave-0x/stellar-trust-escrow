/**
 * Escrow status state machine.
 *
 * Escrow status is normally event-sourced from the blockchain (see
 * services/escrowIndexer.js), but admin bulk operations need an explicit,
 * validated transition table to prevent nonsensical status changes
 * (e.g. re-opening a Completed escrow).
 */

export const ESCROW_STATUSES = ['Active', 'Completed', 'Disputed', 'Cancelled'];

const TRANSITIONS = {
  Active: ['Completed', 'Disputed', 'Cancelled'],
  Disputed: ['Completed', 'Cancelled'],
  Completed: [],
  Cancelled: [],
};

export function isValidTransition(from, to) {
  return (TRANSITIONS[from] ?? []).includes(to);
}

export default { ESCROW_STATUSES, isValidTransition };
