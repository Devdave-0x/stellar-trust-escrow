import { render, screen, fireEvent } from '@testing-library/react';
import TermsDiff from '../../../components/dispute/TermsDiff';

describe('TermsDiff', () => {
  const before = 'Deliver the logo files within 5 business days.';
  const after = 'Deliver the final logo files within 10 business days.';

  it('renders the comparison section with an accessible label', () => {
    render(<TermsDiff before={before} after={after} />);
    expect(screen.getByRole('region', { name: /contract terms comparison/i })).toBeInTheDocument();
  });

  it('reports the number of additions and removals', () => {
    render(<TermsDiff before={before} after={after} />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent(/addition/i);
    expect(status).toHaveTextContent(/removal/i);
  });

  it('shows "No changes detected" when before and after are identical', () => {
    render(<TermsDiff before={before} after={before} />);
    expect(screen.getByText('No changes detected')).toBeInTheDocument();
  });

  it('marks added text with a semantic <ins> element', () => {
    const { container } = render(<TermsDiff before={before} after={after} />);
    expect(container.querySelector('ins')).toHaveTextContent('final');
  });

  it('marks removed text with a semantic <del> element', () => {
    const { container } = render(<TermsDiff before={before} after={after} />);
    expect(container.querySelector('del')).toHaveTextContent('5');
  });

  it('announces additions and removals to screen readers, not just via color', () => {
    render(<TermsDiff before={before} after={after} />);
    expect(screen.getAllByText('(added)', { exact: false }).length).toBeGreaterThan(0);
    expect(screen.getAllByText('(removed)', { exact: false }).length).toBeGreaterThan(0);
  });

  it('defaults to the unified diff view', () => {
    render(<TermsDiff before={before} after={after} />);
    expect(screen.getByRole('tab', { name: 'Unified' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Side by side' })).toHaveAttribute('aria-selected', 'false');
  });

  it('switches to the side-by-side view on click and shows both labeled versions', () => {
    render(
      <TermsDiff before={before} after={after} beforeLabel="Original" afterLabel="Amended" />,
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Side by side' }));
    expect(screen.getByRole('tab', { name: 'Side by side' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Original')).toBeInTheDocument();
    expect(screen.getByText('Amended')).toBeInTheDocument();
  });

  it('toggles the view with arrow keys on the tablist (keyboard navigation)', () => {
    render(<TermsDiff before={before} after={after} />);
    const unifiedTab = screen.getByRole('tab', { name: 'Unified' });
    unifiedTab.focus();
    fireEvent.keyDown(unifiedTab, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Side by side' })).toHaveAttribute('aria-selected', 'true');
  });

  it('handles empty before/after text without throwing', () => {
    render(<TermsDiff before="" after="" />);
    expect(screen.getByText('No changes detected')).toBeInTheDocument();
  });
});
