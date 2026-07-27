import { render, screen, fireEvent } from '@testing-library/react';
import SplitButton from '../../../components/ui/SplitButton';

describe('SplitButton', () => {
  const defaultOptions = [
    { label: 'Option A', onClick: jest.fn() },
    { label: 'Option B', onClick: jest.fn() },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders primary label button', () => {
      render(
        <SplitButton
          primaryLabel="Export"
          onPrimaryClick={jest.fn()}
          options={defaultOptions}
        />,
      );
      expect(screen.getByRole('button', { name: 'Export' })).toBeInTheDocument();
    });

    it('renders chevron toggle button', () => {
      render(
        <SplitButton
          primaryLabel="Export"
          onPrimaryClick={jest.fn()}
          options={defaultOptions}
        />,
      );
      expect(screen.getByRole('button', { name: /more options/i })).toBeInTheDocument();
    });

    it('does not render dropdown menu initially', () => {
      render(
        <SplitButton
          primaryLabel="Export"
          onPrimaryClick={jest.fn()}
          options={defaultOptions}
        />,
      );
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('applies aria-expanded false initially on chevron', () => {
      render(
        <SplitButton
          primaryLabel="Export"
          onPrimaryClick={jest.fn()}
          options={defaultOptions}
        />,
      );
      const chevron = screen.getByRole('button', { name: /more options/i });
      expect(chevron).toHaveAttribute('aria-expanded', 'false');
      expect(chevron).toHaveAttribute('aria-haspopup', 'true');
    });
  });

  describe('primary action', () => {
    it('calls onPrimaryClick when primary button clicked', () => {
      const onPrimaryClick = jest.fn();
      render(
        <SplitButton
          primaryLabel="Save"
          onPrimaryClick={onPrimaryClick}
          options={defaultOptions}
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      expect(onPrimaryClick).toHaveBeenCalledTimes(1);
    });

    it('shows loading spinner when isLoading is true', () => {
      render(
        <SplitButton
          primaryLabel="Saving"
          onPrimaryClick={jest.fn()}
          options={defaultOptions}
          isLoading
        />,
      );
      // When loading, the button shows "…" instead of its label
      expect(screen.getByText('…')).toBeInTheDocument();
      // The primary button should be in loading state (disabled)
      const buttons = screen.getAllByRole('button');
      const primaryBtn = buttons.find((btn) => btn.textContent.includes('…') || btn.getAttribute('aria-busy') === 'true');
      expect(primaryBtn).toBeTruthy();
    });
  });

  describe('dropdown behaviour', () => {
    it('opens dropdown on chevron click', () => {
      render(
        <SplitButton
          primaryLabel="Export"
          onPrimaryClick={jest.fn()}
          options={defaultOptions}
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: /more options/i }));
      expect(screen.getByRole('menu')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /more options/i })).toHaveAttribute(
        'aria-expanded',
        'true',
      );
    });

    it('renders all option items in dropdown', () => {
      render(
        <SplitButton
          primaryLabel="Export"
          onPrimaryClick={jest.fn()}
          options={defaultOptions}
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: /more options/i }));

      const menuItems = screen.getAllByRole('menuitem');
      expect(menuItems).toHaveLength(2);
      expect(menuItems[0]).toHaveTextContent('Option A');
      expect(menuItems[1]).toHaveTextContent('Option B');
    });

    it('calls option onClick and closes dropdown on option selection', () => {
      const optionAClick = jest.fn();
      const options = [
        { label: 'Option A', onClick: optionAClick },
        { label: 'Option B', onClick: jest.fn() },
      ];

      render(
        <SplitButton
          primaryLabel="Export"
          onPrimaryClick={jest.fn()}
          options={options}
        />,
      );

      // Open dropdown
      fireEvent.click(screen.getByRole('button', { name: /more options/i }));
      expect(screen.getByRole('menu')).toBeInTheDocument();

      // Click option A
      fireEvent.click(screen.getByText('Option A'));

      expect(optionAClick).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('closes dropdown on Escape key', () => {
      render(
        <SplitButton
          primaryLabel="Export"
          onPrimaryClick={jest.fn()}
          options={defaultOptions}
        />,
      );

      // Open
      fireEvent.click(screen.getByRole('button', { name: /more options/i }));
      expect(screen.getByRole('menu')).toBeInTheDocument();

      // Press Escape
      fireEvent.keyDown(document, { key: 'Escape' });

      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('closes dropdown on outside click', () => {
      render(
        <div>
          <SplitButton
            primaryLabel="Export"
            onPrimaryClick={jest.fn()}
            options={defaultOptions}
          />
          <button>Outside</button>
        </div>,
      );

      // Open
      fireEvent.click(screen.getByRole('button', { name: /more options/i }));
      expect(screen.getByRole('menu')).toBeInTheDocument();

      // Click outside
      fireEvent.mouseDown(screen.getByText('Outside'));

      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('toggles dropdown closed on second chevron click', () => {
      render(
        <SplitButton
          primaryLabel="Export"
          onPrimaryClick={jest.fn()}
          options={defaultOptions}
        />,
      );

      const chevron = screen.getByRole('button', { name: /more options/i });

      fireEvent.click(chevron);
      expect(screen.getByRole('menu')).toBeInTheDocument();

      fireEvent.click(chevron);
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
  });

  describe('keyboard accessibility', () => {
    it('opens dropdown on Enter key on chevron', () => {
      render(
        <SplitButton
          primaryLabel="Export"
          onPrimaryClick={jest.fn()}
          options={defaultOptions}
        />,
      );

      const chevron = screen.getByRole('button', { name: /more options/i });
      fireEvent.keyDown(chevron, { key: 'Enter' });

      expect(screen.getByRole('menu')).toBeInTheDocument();
    });

    it('opens dropdown on ArrowDown key on chevron', () => {
      render(
        <SplitButton
          primaryLabel="Export"
          onPrimaryClick={jest.fn()}
          options={defaultOptions}
        />,
      );

      const chevron = screen.getByRole('button', { name: /more options/i });
      fireEvent.keyDown(chevron, { key: 'ArrowDown' });

      expect(screen.getByRole('menu')).toBeInTheDocument();
    });

    it('opens dropdown on Space key on chevron', () => {
      render(
        <SplitButton
          primaryLabel="Export"
          onPrimaryClick={jest.fn()}
          options={defaultOptions}
        />,
      );

      const chevron = screen.getByRole('button', { name: /more options/i });
      fireEvent.keyDown(chevron, { key: ' ' });

      expect(screen.getByRole('menu')).toBeInTheDocument();
    });
  });

  describe('disabled state', () => {
    it('disables both buttons when disabled prop is true', () => {
      render(
        <SplitButton
          primaryLabel="Export"
          onPrimaryClick={jest.fn()}
          options={defaultOptions}
          disabled
        />,
      );

      const buttons = screen.getAllByRole('button');
      buttons.forEach((btn) => {
        expect(btn).toBeDisabled();
      });
    });
  });
});
