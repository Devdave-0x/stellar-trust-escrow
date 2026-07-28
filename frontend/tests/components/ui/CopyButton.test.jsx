import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CopyButton from '../../../components/ui/CopyButton';

describe('CopyButton', () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: {
        writeText: jest.fn(),
      },
    });
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('renders with default label', () => {
    render(<CopyButton text="test" />);
    expect(screen.getByText('Copy')).toBeInTheDocument();
  });

  it('renders with custom label', () => {
    render(<CopyButton text="test" label="Hash" />);
    expect(screen.getByText('Hash')).toBeInTheDocument();
  });

  it('copies text to clipboard on click', async () => {
    navigator.clipboard.writeText.mockResolvedValue(undefined);
    render(<CopyButton text="hello world" />);
    fireEvent.click(screen.getByRole('button'));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('hello world');
  });

  it('shows "Copied!" feedback after successful copy', async () => {
    navigator.clipboard.writeText.mockResolvedValue(undefined);
    render(<CopyButton text="test" />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(screen.getByText('Copied!')).toBeInTheDocument();
    });
  });

  it('reverts to original label after feedback duration', async () => {
    navigator.clipboard.writeText.mockResolvedValue(undefined);
    render(<CopyButton text="test" feedbackDuration={1000} />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(screen.getByText('Copied!')).toBeInTheDocument();
    });
    jest.advanceTimersByTime(1000);
    await waitFor(() => {
      expect(screen.getByText('Copy')).toBeInTheDocument();
    });
  });

  it('handles clipboard errors gracefully', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    navigator.clipboard.writeText.mockRejectedValue(new Error('Clipboard error'));
    render(<CopyButton text="test" />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to copy:', expect.any(Error));
    });
    consoleErrorSpy.mockRestore();
  });

  it('has correct title attribute', () => {
    render(<CopyButton text="test" label="Hash" />);
    expect(screen.getByRole('button')).toHaveAttribute('title', 'Copy Hash');
  });

  it('updates title after copy', async () => {
    navigator.clipboard.writeText.mockResolvedValue(undefined);
    render(<CopyButton text="test" />);
    const button = screen.getByRole('button');
    fireEvent.click(button);
    await waitFor(() => {
      expect(button).toHaveAttribute('title', 'Copied!');
    });
  });

  it('accepts a `value` prop as an alias for `text` (used by TransactionHistoryList)', async () => {
    navigator.clipboard.writeText.mockResolvedValue(undefined);
    render(<CopyButton value="wallet-address-value" />);
    fireEvent.click(screen.getByRole('button'));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('wallet-address-value');
  });

  it('announces the copy to screen readers via a polite live region', async () => {
    navigator.clipboard.writeText.mockResolvedValue(undefined);
    render(<CopyButton text="test" label="Wallet address" />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Copied to clipboard');
    });
  });

  it('is reachable and activatable via keyboard (native button semantics)', async () => {
    navigator.clipboard.writeText.mockResolvedValue(undefined);
    render(<CopyButton text="keyboard-test" />);
    const button = screen.getByRole('button');
    button.focus();
    expect(button).toHaveFocus();
    fireEvent.click(button);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('keyboard-test');
  });

  it('falls back to execCommand copy when the async Clipboard API is unavailable', () => {
    const originalClipboard = navigator.clipboard;
    Object.assign(navigator, { clipboard: undefined });
    document.execCommand = jest.fn().mockReturnValue(true);
    render(<CopyButton text="legacy-copy" />);
    fireEvent.click(screen.getByRole('button'));
    expect(document.execCommand).toHaveBeenCalledWith('copy');
    Object.assign(navigator, { clipboard: originalClipboard });
  });
});
