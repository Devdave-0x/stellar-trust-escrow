import { render, screen, fireEvent } from '@testing-library/react';
import Button from '../../../components/ui/Button';

describe('Button', () => {
  it('renders children', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument();
  });

  it('renders as a link when href is provided', () => {
    render(<Button href="/dashboard">Go</Button>);
    expect(screen.getByRole('link', { name: 'Go' })).toHaveAttribute('href', '/dashboard');
  });

  it('calls onClick when clicked', () => {
    const onClick = jest.fn();
    render(<Button onClick={onClick}>Click</Button>);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('is disabled when disabled prop is true', () => {
    render(<Button disabled>Disabled</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('shows ellipsis and is disabled when isLoading', () => {
    render(<Button isLoading>Submit</Button>);
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
    expect(btn).toHaveTextContent('…');
  });

  it('does not call onClick when disabled', () => {
    const onClick = jest.fn();
    render(
      <Button disabled onClick={onClick}>
        Click
      </Button>,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('applies variant classes', () => {
    // Each variant now carries a light-mode tone plus a dark: counterpart; the
    // single dark-only tone did not reach 4.5:1 on a light surface.
    const { rerender } = render(<Button variant="danger">Danger</Button>);
    expect(screen.getByRole('button')).toHaveClass('text-red-900', 'dark:text-red-200');

    rerender(<Button variant="secondary">Secondary</Button>);
    expect(screen.getByRole('button')).toHaveClass('text-gray-900', 'dark:text-gray-200');

    rerender(<Button variant="ghost">Ghost</Button>);
    expect(screen.getByRole('button')).toHaveClass('text-gray-800', 'dark:text-gray-200');
  });

  it('applies size classes', () => {
    const { rerender } = render(<Button size="sm">Small</Button>);
    expect(screen.getByRole('button')).toHaveClass('text-sm');

    rerender(<Button size="lg">Large</Button>);
    expect(screen.getByRole('button')).toHaveClass('text-base');
  });

  it('renders as button (not link) when href is provided but disabled', () => {
    render(
      <Button href="/test" disabled>
        Disabled Link
      </Button>,
    );
    expect(screen.getByRole('button')).toBeInTheDocument();
  });
});
