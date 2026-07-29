import { render, screen } from '@testing-library/react';
import Badge from '../../../components/ui/Badge';

describe('Badge', () => {
  const variantCases = [
    { variant: 'success', label: 'Active' },
    { variant: 'warning', label: 'Pending' },
    { variant: 'error', label: 'Disputed' },
    { variant: 'info', label: 'Submitted' },
    { variant: 'neutral', label: 'Completed' },
  ];

  const sizeCases = [
    { size: 'sm', className: 'px-2 py-0.5' },
    { size: 'md', className: 'px-2.5 py-1' },
    { size: 'lg', className: 'px-3 py-1.5' },
  ];

  it.each(variantCases)('renders the $variant variant', ({ variant, label }) => {
    render(
      <Badge variant={variant} dot>
        {label}
      </Badge>,
    );

    const badge = screen.getByRole('status', { name: `Status: ${label}` });
    expect(badge).toHaveAttribute('data-variant', variant);
    expect(badge).toHaveTextContent(label);
    expect(badge.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
  });

  it.each(sizeCases)('applies the $size size classes', ({ size, className }) => {
    const { container } = render(<Badge variant="success" size={size} />);
    expect(container.firstChild).toHaveClass(...className.split(' '));
    expect(container.firstChild).toHaveAttribute('data-size', size);
  });

  it('defaults to md size and neutral variant', () => {
    const { container } = render(<Badge>Draft</Badge>);
    expect(container.firstChild).toHaveClass('px-2.5', 'py-1');
    expect(container.firstChild).toHaveAttribute('data-variant', 'neutral');
    expect(screen.getByText('Draft')).toBeInTheDocument();
  });

  it('falls back gracefully for unknown status values', () => {
    render(<Badge status="Unknown">Unknown</Badge>);
    const badge = screen.getByRole('status', { name: 'Status: Unknown' });
    expect(badge).toHaveAttribute('data-variant', 'neutral');
    expect(badge).toHaveTextContent('Unknown');
  });

  it('uses legacy status mapping when status is provided', () => {
    render(<Badge status="Disputed" />);
    expect(screen.getByRole('status', { name: 'Status: Disputed' })).toHaveAttribute(
      'data-variant',
      'error',
    );
  });
});
