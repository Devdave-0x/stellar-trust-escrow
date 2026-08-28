import { render } from '@testing-library/react';
import Button from '../../../components/ui/Button';

describe('Button snapshots', () => {
  it('renders default props', () => {
    const { container } = render(<Button>Click me</Button>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it.each(['primary', 'secondary', 'danger', 'ghost'])('renders the %s variant', (variant) => {
    const { container } = render(<Button variant={variant}>Click me</Button>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it.each(['sm', 'md', 'lg'])('renders the %s size', (size) => {
    const { container } = render(<Button size={size}>Click me</Button>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('renders the disabled state', () => {
    const { container } = render(<Button disabled>Click me</Button>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('renders the loading state', () => {
    const { container } = render(<Button isLoading>Click me</Button>);
    expect(container.firstChild).toMatchSnapshot();
  });
});
