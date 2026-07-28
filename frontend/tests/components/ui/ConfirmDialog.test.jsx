import { render, screen, fireEvent } from '@testing-library/react';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';

describe('ConfirmDialog', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <ConfirmDialog open={false} title="Delete" message="Are you sure?" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders title, message, and has alertdialog semantics', () => {
    render(<ConfirmDialog open title="Delete escrow" message="This cannot be undone." />);
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('Delete escrow')).toBeInTheDocument();
    expect(screen.getByText('This cannot be undone.')).toBeInTheDocument();
  });

  it('focuses the confirm button on open', () => {
    render(<ConfirmDialog open title="Delete" message="Sure?" confirmLabel="Delete" />);
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveFocus();
  });

  it('calls onConfirm and onCancel handlers', () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    render(
      <ConfirmDialog
        open
        title="Delete"
        message="Sure?"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when Escape is pressed', () => {
    const onCancel = jest.fn();
    render(<ConfirmDialog open title="Delete" message="Sure?" onCancel={onCancel} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('disables the confirm button and shows a busy state while loading', () => {
    render(<ConfirmDialog open title="Delete" message="Sure?" isLoading />);
    const confirmBtn = screen.getByRole('button', { name: /please wait/i });
    expect(confirmBtn).toBeDisabled();
    expect(confirmBtn).toHaveAttribute('aria-busy', 'true');
  });

  it('applies danger styling when danger is true', () => {
    render(<ConfirmDialog open title="Delete" message="Sure?" confirmLabel="Delete" danger />);
    expect(screen.getByRole('button', { name: 'Delete' }).className).toMatch(/bg-red-600/);
  });
});
