import { getPaymentTokenAvailability } from '../../app/escrow/[id]/paymentTokenAvailability';

const CLIENT = `G${'A'.repeat(55)}`;
const FREELANCER = `G${'B'.repeat(55)}`;
const ARBITER = `G${'C'.repeat(55)}`;

const activeEscrow = {
  status: 'Active',
  clientAddress: CLIENT,
  freelancerAddress: FREELANCER,
  arbiterAddress: ARBITER,
  paymentToken: 'USDC',
};

describe('getPaymentTokenAvailability', () => {
  it('permits the client to use active escrow actions with an available token', () => {
    expect(getPaymentTokenAvailability(activeEscrow, CLIENT)).toMatchObject({
      role: 'client',
      token: 'USDC',
      isTokenAvailable: true,
      canRaiseDispute: true,
      canCancel: true,
    });
  });

  it('blocks an observer from payment-related actions', () => {
    const availability = getPaymentTokenAvailability(activeEscrow, `G${'D'.repeat(55)}`);

    expect(availability.role).toBe('observer');
    expect(availability.canRaiseDispute).toBe(false);
    expect(availability.canCancel).toBe(false);
    expect(availability.disputeReason).toMatch(/client or freelancer/i);
  });

  it('blocks actions when the authoritative escrow state is no longer active', () => {
    const availability = getPaymentTokenAvailability({ ...activeEscrow, status: 'Released' }, CLIENT);

    expect(availability.isActive).toBe(false);
    expect(availability.canRaiseDispute).toBe(false);
    expect(availability.canCancel).toBe(false);
    expect(availability.cancelReason).toMatch(/active/i);
  });

  it('blocks actions when the payment token is unavailable', () => {
    const availability = getPaymentTokenAvailability(
      { ...activeEscrow, paymentTokenAvailable: false },
      FREELANCER,
    );

    expect(availability.canRaiseDispute).toBe(false);
    expect(availability.canCancel).toBe(false);
    expect(availability.disputeReason).toMatch(/token.*unavailable/i);
  });
});
