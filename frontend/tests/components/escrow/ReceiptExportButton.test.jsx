import { render, screen, fireEvent } from '@testing-library/react';
import ReceiptExportButton from '../../../components/escrow/ReceiptExportButton';

const escrow = {
  id: '55',
  status: 'active',
  amount: 250,
  currency: 'USD',
  client: 'Client Co',
  counterparty: 'Vendor Co',
};

describe('ReceiptExportButton', () => {
  beforeEach(() => {
    window.print = jest.fn();
  });

  it('renders the trigger button and no dialog initially', () => {
    render(<ReceiptExportButton escrow={escrow} />);
    expect(screen.getByRole('button', { name: /export receipt/i })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens the receipt preview dialog on click', () => {
    render(<ReceiptExportButton escrow={escrow} />);
    fireEvent.click(screen.getByRole('button', { name: /export receipt/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Receipt preview')).toBeInTheDocument();
    expect(screen.getByLabelText('Receipt for escrow 55')).toBeInTheDocument();
  });

  it('calls window.print when "Print / Save as PDF" is clicked', () => {
    render(<ReceiptExportButton escrow={escrow} />);
    fireEvent.click(screen.getByRole('button', { name: /export receipt/i }));
    fireEvent.click(screen.getByRole('button', { name: /print \/ save as pdf/i }));
    expect(window.print).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape and returns focus to the trigger', () => {
    render(<ReceiptExportButton escrow={escrow} />);
    const trigger = screen.getByRole('button', { name: /export receipt/i });
    fireEvent.click(trigger);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('closes via the Close button', () => {
    render(<ReceiptExportButton escrow={escrow} />);
    fireEvent.click(screen.getByRole('button', { name: /export receipt/i }));
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
