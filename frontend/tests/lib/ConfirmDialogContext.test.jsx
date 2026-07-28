import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConfirmDialogProvider, useConfirm } from '../../../contexts/ConfirmDialogContext';

function DeleteButton() {
  const confirm = useConfirm();
  const [result, setResult] = useState('idle');

  const handleClick = async () => {
    const ok = await confirm({
      title: 'Delete API key',
      message: 'This cannot be undone.',
      confirmLabel: 'Yes, delete',
      danger: true,
    });
    setResult(ok ? 'confirmed' : 'cancelled');
  };

  return (
    <div>
      <button onClick={handleClick}>Open delete confirmation</button>
      <output>{result}</output>
    </div>
  );
}

describe('ConfirmDialogProvider / useConfirm', () => {
  it('throws when useConfirm is used outside the provider', () => {
    const BadComponent = () => {
      useConfirm();
      return null;
    };
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<BadComponent />)).toThrow(
      'useConfirm must be used within a ConfirmDialogProvider',
    );
    spy.mockRestore();
  });

  it('does not render a dialog until confirm() is called', () => {
    render(
      <ConfirmDialogProvider>
        <DeleteButton />
      </ConfirmDialogProvider>,
    );
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('resolves true and updates state when the user confirms', async () => {
    render(
      <ConfirmDialogProvider>
        <DeleteButton />
      </ConfirmDialogProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open delete confirmation' }));
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByText('Delete API key')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Yes, delete' }));

    expect(await screen.findByText('confirmed')).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('resolves false and updates state when the user cancels', async () => {
    render(
      <ConfirmDialogProvider>
        <DeleteButton />
      </ConfirmDialogProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open delete confirmation' }));
    await screen.findByRole('alertdialog');

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(await screen.findByText('cancelled')).toBeInTheDocument();
  });
});
