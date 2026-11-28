import { screen, fireEvent, waitFor } from '@testing-library/react';
import MilestoneList from '../../../components/escrow/MilestoneList';
import { renderWithAppProviders } from '../../test-utils';

const milestones = [
  {
    id: 0,
    title: 'Design Mockups',
    amount: '500 USDC',
    status: 'Approved',
    submittedAt: '2025-03-01',
  },
  {
    id: 1,
    title: 'Development',
    amount: '1000 USDC',
    status: 'Submitted',
    submittedAt: '2025-03-10',
  },
  { id: 2, title: 'Testing', amount: '500 USDC', status: 'Pending', submittedAt: null },
];

describe('MilestoneList', () => {
  it('renders empty state for client when no milestones', () => {
    renderWithAppProviders(
      <MilestoneList
        milestones={[]}
        role="client"
        onApprove={jest.fn()}
        onReject={jest.fn()}
        onSubmit={jest.fn()}
      />,
    );
    expect(screen.getByText('No milestones yet')).toBeInTheDocument();
    expect(screen.getByText(/Add milestones/)).toBeInTheDocument();
  });

  it('renders empty state for freelancer when no milestones', () => {
    renderWithAppProviders(
      <MilestoneList
        milestones={[]}
        role="freelancer"
        onApprove={jest.fn()}
        onReject={jest.fn()}
        onSubmit={jest.fn()}
      />,
    );
    expect(screen.getByText(/client has not added/i)).toBeInTheDocument();
  });

  it('renders all milestones', () => {
    renderWithAppProviders(
      <MilestoneList
        milestones={milestones}
        role="observer"
        onApprove={jest.fn()}
        onReject={jest.fn()}
        onSubmit={jest.fn()}
      />,
    );
    expect(screen.getByText('Design Mockups')).toBeInTheDocument();
    expect(screen.getByText('Development')).toBeInTheDocument();
    expect(screen.getByText('Testing')).toBeInTheDocument();
  });

  it('shows progress summary', () => {
    renderWithAppProviders(
      <MilestoneList
        milestones={milestones}
        role="observer"
        onApprove={jest.fn()}
        onReject={jest.fn()}
        onSubmit={jest.fn()}
      />,
    );
    expect(screen.getByText(/1 of 3 milestones complete/)).toBeInTheDocument();
  });

  it('shows percentage', () => {
    renderWithAppProviders(
      <MilestoneList
        milestones={milestones}
        role="observer"
        onApprove={jest.fn()}
        onReject={jest.fn()}
        onSubmit={jest.fn()}
      />,
    );
    expect(screen.getByText('33%')).toBeInTheDocument();
  });
});

describe('MilestoneList create next milestone', () => {
  it('shows add form for client when canAdd', () => {
    renderWithAppProviders(
      <MilestoneList
        milestones={milestones}
        role="client"
        canAdd
        onAddMilestone={jest.fn()}
        onApprove={jest.fn()}
        onReject={jest.fn()}
        onSubmit={jest.fn()}
      />,
    );
    expect(screen.getByTestId('add-milestone-form')).toBeInTheDocument();
  });

  it('hides add form for freelancer', () => {
    renderWithAppProviders(
      <MilestoneList
        milestones={milestones}
        role="freelancer"
        canAdd
        onAddMilestone={jest.fn()}
        onApprove={jest.fn()}
        onReject={jest.fn()}
        onSubmit={jest.fn()}
      />,
    );
    expect(screen.queryByTestId('add-milestone-form')).not.toBeInTheDocument();
    expect(screen.getByText(/Only the client can add milestones/)).toBeInTheDocument();
  });

  it('preserves entered values when add fails', async () => {
    const onAdd = jest.fn().mockRejectedValue(new Error('contract rejected'));
    renderWithAppProviders(
      <MilestoneList
        milestones={milestones}
        role="client"
        canAdd
        onAddMilestone={onAdd}
        onApprove={jest.fn()}
        onReject={jest.fn()}
        onSubmit={jest.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText('Milestone title'), { target: { value: 'Next' } });
    fireEvent.change(screen.getByLabelText('Description hash'), { target: { value: 'c'.repeat(64) } });
    fireEvent.change(screen.getByLabelText('Milestone amount'), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: /Add milestone/ }));
    await waitFor(() => expect(onAdd).toHaveBeenCalled());
    expect(screen.getByLabelText('Milestone title')).toHaveValue('Next');
    expect(screen.getByText(/contract rejected/)).toBeInTheDocument();
  });
});
