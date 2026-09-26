/**
 * Optimistic milestone actions with clean rollback.
 *
 * The milestone is shown in its target status immediately. If signing,
 * broadcasting or confirmation fails, the escrow is restored to the exact
 * snapshot taken before the update and the failure reason is returned so the
 * caller can show it.
 *
 * @param {object}   opts
 * @param {object}   opts.escrow          current escrow data (SWR cache value)
 * @param {Function} opts.mutate          SWR bound mutate for that escrow
 * @param {string|number} opts.milestoneId
 * @param {string}   opts.optimisticStatus e.g. 'Submitted' | 'Approved'
 * @param {Function} opts.action          async work (build → sign → broadcast)
 * @returns {Promise<{ ok: true } | { ok: false, reason: string }>}
 */
export async function runOptimisticMilestoneAction({
  escrow,
  mutate,
  milestoneId,
  optimisticStatus,
  action,
}) {
  const snapshot = escrow;
  const optimistic = {
    ...escrow,
    milestones: (escrow?.milestones ?? []).map((m) =>
      String(m.id) === String(milestoneId) ? { ...m, status: optimisticStatus } : m,
    ),
  };

  await mutate(optimistic, { revalidate: false });

  try {
    await action();
  } catch (err) {
    await mutate(snapshot, { revalidate: false });
    return { ok: false, reason: err?.message || 'Transaction failed' };
  }

  // Confirmed: replace the optimistic value with server state.
  await mutate();
  return { ok: true };
}
