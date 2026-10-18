/**
 * Derive the display and action state from the authoritative escrow record and
 * the connected wallet. This is presentation gating only; contract and API
 * authorization remain the final authority for every state transition.
 */
export function getPaymentTokenAvailability(escrow = {}, walletAddress = null) {
  const role =
    walletAddress === escrow.clientAddress
      ? 'client'
      : walletAddress === escrow.freelancerAddress
        ? 'freelancer'
        : walletAddress === escrow.arbiterAddress
          ? 'arbiter'
          : 'observer';
  const isActive = String(escrow.status || '').toLowerCase() === 'active';
  const tokenStatus = String(escrow.paymentTokenStatus || '').toLowerCase();
  const isTokenAvailable = escrow.paymentTokenAvailable !== false && tokenStatus !== 'unavailable';
  const token = escrow.paymentToken || escrow.tokenSymbol || escrow.assetCode || 'Escrow payment token';

  const unavailableReason = !isActive
    ? 'This action is only available while the escrow is active.'
    : !isTokenAvailable
      ? 'The escrow payment token is currently unavailable.'
      : null;
  const disputeReason = unavailableReason ||
    (role === 'observer' || role === 'arbiter'
      ? 'Only the client or freelancer may raise a dispute.'
      : null);
  const cancelReason = unavailableReason ||
    (role !== 'client' ? 'Only the client may cancel this escrow.' : null);

  return {
    role,
    token,
    isActive,
    isTokenAvailable,
    canRaiseDispute: disputeReason === null,
    canCancel: cancelReason === null,
    disputeReason,
    cancelReason,
  };
}
