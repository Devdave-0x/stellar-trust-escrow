import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DataTable from '../../../components/ui/DataTable';

const columns = [
  { key: 'name', label: 'Name', sortable: true },
  { key: 'amount', label: 'Amount', sortable: true },
  { key: 'status', label: 'Status' },
];

const data = [
  { id: 1, name: 'Bravo', amount: 30, status: 'Active' },
  { id: 2, name: 'Alpha', amount: 10, status: 'Completed' },
  { id: 3, name: 'Charlie', amount: 20, status: 'Disputed' },
];

describe('DataTable', () => {
  it('renders column headers and rows', () => {
    render(<DataTable columns={columns} data={data} getRowId={(r) => r.id} />);
    expect(screen.getByRole('columnheader', { name: /amount/i })).toBeInTheDocument();
    expect(screen.getByText('Bravo')).toBeInTheDocument();
    expect(screen.getByText('Alpha')).toBeInTheDocument();
  });

  it('shows the empty message when there is no data', () => {
    render(<DataTable columns={columns} data={[]} emptyMessage="Nothing here" />);
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
  });

  it('sorts ascending then descending when the sortable header is clicked', async () => {
    const user = userEvent.setup();
    render(<DataTable columns={columns} data={data} getRowId={(r) => r.id} />);

    const rows = () => screen.getAllByRole('row').slice(1);
    const firstCellText = () => within(rows()[0]).getAllByRole('cell')[0].textContent;

    await user.click(screen.getByRole('button', { name: /name/i }));
    expect(firstCellText()).toBe('Alpha');

    await user.click(screen.getByRole('button', { name: /name/i }));
    expect(firstCellText()).toBe('Charlie');
  });

  it('sets aria-sort on the active sortable column', async () => {
    const user = userEvent.setup();
    render(<DataTable columns={columns} data={data} getRowId={(r) => r.id} />);
    const header = screen.getByRole('columnheader', { name: /name/i });
    expect(header).toHaveAttribute('aria-sort', 'none');

    await user.click(screen.getByRole('button', { name: /name/i }));
    expect(header).toHaveAttribute('aria-sort', 'ascending');
  });

  it('paginates results and disables Previous on the first page', () => {
    const bigData = Array.from({ length: 25 }, (_, i) => ({
      id: i,
      name: `Row ${i}`,
      amount: i,
      status: 'Active',
    }));
    render(<DataTable columns={columns} data={bigData} pageSize={10} getRowId={(r) => r.id} />);

    expect(screen.getByText(/page 1 of 3/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /previous/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /next/i })).not.toBeDisabled();
  });

  it('navigates to the next page via keyboard', async () => {
    const user = userEvent.setup();
    const bigData = Array.from({ length: 15 }, (_, i) => ({
      id: i,
      name: `Row ${i}`,
      amount: i,
      status: 'Active',
    }));
    render(<DataTable columns={columns} data={bigData} pageSize={10} getRowId={(r) => r.id} />);

    const nextButton = screen.getByRole('button', { name: /next/i });
    nextButton.focus();
    await user.keyboard('{Enter}');

    expect(screen.getByText(/page 2 of 2/i)).toBeInTheDocument();
    expect(nextButton).toBeDisabled();
  });

  it('renders custom cell content via render()', () => {
    const customColumns = [
      ...columns,
      { key: 'actions', label: 'Actions', render: (row) => <span>Edit {row.name}</span> },
    ];
    render(<DataTable columns={customColumns} data={data} getRowId={(r) => r.id} />);
    expect(screen.getByText('Edit Bravo')).toBeInTheDocument();
  });
});
