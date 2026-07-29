import { render } from '@testing-library/react';
import Badge from '../../../components/ui/Badge';

describe('Badge snapshots', () => {
  it('renders default props', () => {
    const { container } = render(<Badge>Default</Badge>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it.each(['success', 'warning', 'error', 'info', 'neutral'])(
    'renders the %s colour variant',
    (variant) => {
      const { container } = render(<Badge variant={variant}>{variant}</Badge>);
      expect(container.firstChild).toMatchSnapshot();
    },
  );

  it.each(['sm', 'md', 'lg'])('renders the %s size', (size) => {
    const { container } = render(
      <Badge variant="info" size={size}>
        Sized
      </Badge>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('renders the dot indicator', () => {
    const { container } = render(
      <Badge variant="success" dot>
        With dot
      </Badge>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
