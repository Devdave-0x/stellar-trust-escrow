import { runOptimisticMilestoneAction } from '../../lib/escrow/optimisticMilestone';

const escrow = {
  id: '1',
  milestones: [
    { id: 1, status: 'Pending' },
    { id: 2, status: 'Pending' },
  ],
};

describe('runOptimisticMilestoneAction', () => {
  it('applies the optimistic status, then revalidates on success', async () => {
    const mutate = jest.fn().mockResolvedValue(undefined);
    const result = await runOptimisticMilestoneAction({
      escrow,
      mutate,
      milestoneId: 2,
      optimisticStatus: 'Submitted',
      action: jest.fn().mockResolvedValue(undefined),
    });

    expect(result).toEqual({ ok: true });
    const [optimistic, opts] = mutate.mock.calls[0];
    expect(optimistic.milestones).toEqual([
      { id: 1, status: 'Pending' },
      { id: 2, status: 'Submitted' },
    ]);
    expect(opts).toEqual({ revalidate: false });
    expect(mutate).toHaveBeenLastCalledWith(); // revalidate from the server
  });

  it('restores the previous state and returns the reason when the action is rejected', async () => {
    const mutate = jest.fn().mockResolvedValue(undefined);
    const result = await runOptimisticMilestoneAction({
      escrow,
      mutate,
      milestoneId: 1,
      optimisticStatus: 'Approved',
      action: jest.fn().mockRejectedValue(new Error('User declined the transaction')),
    });

    expect(result).toEqual({ ok: false, reason: 'User declined the transaction' });
    expect(mutate).toHaveBeenCalledTimes(2);
    expect(mutate).toHaveBeenLastCalledWith(escrow, { revalidate: false });
    // The original escrow object was never mutated in place.
    expect(escrow.milestones[0].status).toBe('Pending');
  });

  it('falls back to a generic reason when the error has no message', async () => {
    const result = await runOptimisticMilestoneAction({
      escrow,
      mutate: jest.fn().mockResolvedValue(undefined),
      milestoneId: 1,
      optimisticStatus: 'Approved',
      action: () => Promise.reject({}),
    });
    expect(result).toEqual({ ok: false, reason: 'Transaction failed' });
  });
});
