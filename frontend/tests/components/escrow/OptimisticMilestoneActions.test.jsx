import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OptimisticMilestoneActions from '../../../components/escrow/OptimisticMilestoneActions';

const milestone = { id: 'm1', title: 'Design mockups', status: 'Submitted', amount: 100 };

describe('OptimisticMilestoneActions', () => {
  it('shows Approve and Reject controls when submitted', () => {
    render(<OptimisticMilestoneActions milestone={milestone} onApprove={jest.fn()} onReject={jest.fn()} />);
    expect(screen.getByRole('button', { name: /approve/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reject/i })).toBeInTheDocument();
  });

  it('updates the label immediately on click, before the promise resolves', async () => {
    const user = userEvent.setup();
    let resolvePromise;
    const onApprove = jest.fn(
      () =>
        new Promise((resolve) => {
          resolvePromise = resolve;
        }),
    );

    render(<OptimisticMilestoneActions milestone={milestone} onApprove={onApprove} onReject={jest.fn()} />);

    await user.click(screen.getByRole('button', { name: /approve/i }));
    expect(screen.getByText('✓ Approved')).toBeInTheDocument();

    resolvePromise();
    await waitFor(() => expect(onApprove).toHaveBeenCalledWith('m1'));
  });

  it('rolls back to the action buttons and shows an error when the request fails', async () => {
    const user = userEvent.setup();
    const onReject = jest.fn(() => Promise.reject(new Error('server error')));

    render(<OptimisticMilestoneActions milestone={milestone} onApprove={jest.fn()} onReject={onReject} />);

    await user.click(screen.getByRole('button', { name: /reject/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('alert')).toHaveTextContent('server error');
    expect(screen.getByRole('button', { name: /approve/i })).toBeInTheDocument();
  });
});
