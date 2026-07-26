import { render, screen, fireEvent } from '@testing-library/react';
import CommandPalette from '../../../components/ui/CommandPalette';

const pushMock = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

describe('CommandPalette', () => {
  beforeEach(() => {
    pushMock.mockClear();
    window.localStorage.clear();
  });

  it('opens on Ctrl+K', () => {
    render(<CommandPalette />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'k', ctrlKey: true });

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('closes on Escape', () => {
    render(<CommandPalette />);
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    const input = screen.getByLabelText('Command palette search');
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('navigates results with arrow keys', () => {
    render(<CommandPalette />);
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
    const input = screen.getByLabelText('Command palette search');

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    const options = screen.getAllByRole('option');
    expect(options[1]).toHaveAttribute('aria-selected', 'true');
  });

  it('navigates to the selected result on Enter', () => {
    render(<CommandPalette />);
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
    const input = screen.getByLabelText('Command palette search');

    fireEvent.change(input, { target: { value: 'Dashboard' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(pushMock).toHaveBeenCalledWith('/dashboard');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not open when typing Ctrl+K inside another input', () => {
    render(
      <div>
        <input aria-label="unrelated" />
        <CommandPalette />
      </div>
    );
    const otherInput = screen.getByLabelText('unrelated');
    fireEvent.keyDown(otherInput, { key: 'k', ctrlKey: true });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
