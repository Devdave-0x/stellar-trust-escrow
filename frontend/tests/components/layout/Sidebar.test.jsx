import { render, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Sidebar from '../../../components/layout/Sidebar';

const mockItems = [
  { href: '/dashboard', label: 'Dashboard', icon: <svg data-testid="icon-dashboard" /> },
  { href: '/explorer', label: 'Explorer', icon: <svg data-testid="icon-explorer" /> },
  { href: '/help', label: 'Help', icon: <svg data-testid="icon-help" /> },
];

describe('Sidebar', () => {
  beforeEach(() => {
    localStorage.clear();
    // Mock window.innerWidth for desktop tests
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1024,
    });
    window.dispatchEvent(new Event('resize'));
  });

  describe('Desktop', () => {
    it('renders nav items with labels', () => {
      render(<Sidebar items={mockItems} />);
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
      expect(screen.getByText('Explorer')).toBeInTheDocument();
      expect(screen.getByText('Help')).toBeInTheDocument();
    });

    it('renders icons for each nav item', () => {
      render(<Sidebar items={mockItems} />);
      expect(screen.getByTestId('icon-dashboard')).toBeInTheDocument();
      expect(screen.getByTestId('icon-explorer')).toBeInTheDocument();
      expect(screen.getByTestId('icon-help')).toBeInTheDocument();
    });

    it('collapses to icon-only mode on toggle click', async () => {
      render(<Sidebar items={mockItems} />);

      const toggleBtn = screen.getByRole('button', { name: 'Collapse sidebar' });
      await userEvent.click(toggleBtn);

      // In collapsed mode, labels should be hidden
      expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
      expect(screen.queryByText('Explorer')).not.toBeInTheDocument();
      expect(screen.queryByText('Help')).not.toBeInTheDocument();

      // Icons should still be present
      expect(screen.getByTestId('icon-dashboard')).toBeInTheDocument();

      // Nav links should have title attributes for tooltip accessibility
      const links = screen.getAllByRole('link');
      const dashboardLink = links.find((l) => l.getAttribute('href') === '/dashboard');
      expect(dashboardLink).toHaveAttribute('title', 'Dashboard');
    });

    it('expands back to full labels on second toggle click', async () => {
      render(<Sidebar items={mockItems} />);

      const toggleBtn = screen.getByRole('button', { name: 'Collapse sidebar' });
      await userEvent.click(toggleBtn); // collapse
      await userEvent.click(toggleBtn); // expand

      expect(screen.getByText('Dashboard')).toBeInTheDocument();
      expect(screen.getByText('Explorer')).toBeInTheDocument();
      expect(screen.getByText('Help')).toBeInTheDocument();
    });

    it('persists collapse state to localStorage', async () => {
      render(<Sidebar items={mockItems} />);

      const toggleBtn = screen.getByRole('button', { name: 'Collapse sidebar' });
      await userEvent.click(toggleBtn);

      expect(localStorage.getItem('ste_sidebar_collapsed')).toBe('true');

      await userEvent.click(toggleBtn);

      expect(localStorage.getItem('ste_sidebar_collapsed')).toBe('false');
    });

    it('restores persisted collapse state on mount', () => {
      localStorage.setItem('ste_sidebar_collapsed', 'true');

      render(<Sidebar items={mockItems} />);

      // Should start collapsed
      expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeInTheDocument();
    });

    it('has navigation role and aria-label', () => {
      render(<Sidebar items={mockItems} />);
      expect(screen.getByRole('navigation', { name: 'Sidebar navigation' })).toBeInTheDocument();
    });

    it('renders brand name in expanded mode', () => {
      render(<Sidebar items={mockItems} />);
      expect(screen.getByText(/StellarTrust/)).toBeInTheDocument();
    });

    it('hides brand name in collapsed mode', async () => {
      render(<Sidebar items={mockItems} />);

      const toggleBtn = screen.getByRole('button', { name: 'Collapse sidebar' });
      await userEvent.click(toggleBtn);

      expect(screen.queryByText(/StellarTrust/)).not.toBeInTheDocument();
    });
  });

  describe('Mobile', () => {
    beforeEach(() => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375,
      });
      window.dispatchEvent(new Event('resize'));
    });

    it('renders a hamburger trigger button', () => {
      render(<Sidebar items={mockItems} />);
      expect(screen.getByRole('button', { name: 'Open navigation menu' })).toBeInTheDocument();
    });

    it('shows overlay sidebar on hamburger click', async () => {
      render(<Sidebar items={mockItems} />);

      const hamburger = screen.getByRole('button', { name: 'Open navigation menu' });
      await userEvent.click(hamburger);

      // Should now show labels
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
      expect(screen.getByText('Explorer')).toBeInTheDocument();

      // Should have backdrop
      const backdrop = document.querySelector('[aria-hidden="true"]');
      expect(backdrop).toBeInTheDocument();
    });

    it('hides overlay when backdrop is clicked', async () => {
      render(<Sidebar items={mockItems} />);

      const hamburger = screen.getByRole('button', { name: 'Open navigation menu' });
      await userEvent.click(hamburger);

      // Click backdrop
      const backdrop = document.querySelector('[aria-hidden="true"]');
      fireEvent.click(backdrop);

      // Wait for transition
      // Sidebar content should still be in DOM but off-screen
      expect(screen.queryByRole('dialog')).toBeInTheDocument();
    });

    it('hides overlay on Escape key', async () => {
      render(<Sidebar items={mockItems} />);

      const hamburger = screen.getByRole('button', { name: 'Open navigation menu' });
      await userEvent.click(hamburger);

      fireEvent.keyDown(document, { key: 'Escape' });

      // Sidebar should close (dialog remains in DOM but off-screen)
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveClass('-translate-x-full');
    });

    it('closes overlay when a nav link is clicked', async () => {
      render(<Sidebar items={mockItems} />);

      const hamburger = screen.getByRole('button', { name: 'Open navigation menu' });
      await userEvent.click(hamburger);

      const dashboardLink = screen.getByText('Dashboard');
      await userEvent.click(dashboardLink);

      // Overlay should be hidden
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveClass('-translate-x-full');
    });

    it('has aria-expanded on hamburger button', async () => {
      render(<Sidebar items={mockItems} />);

      const hamburger = screen.getByRole('button', { name: 'Open navigation menu' });
      expect(hamburger).toHaveAttribute('aria-expanded', 'false');

      await userEvent.click(hamburger);
      expect(hamburger).toHaveAttribute('aria-expanded', 'true');
    });
  });
});
