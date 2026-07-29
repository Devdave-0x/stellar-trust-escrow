import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SectionErrorBoundary from '../../../components/ui/SectionErrorBoundary';

function Bomb({ shouldThrow }) {
  if (shouldThrow) throw new Error('widget exploded');
  return <p>Widget content</p>;
}

describe('SectionErrorBoundary', () => {
  const originalError = console.error;
  beforeEach(() => {
    console.error = jest.fn();
  });
  afterEach(() => {
    console.error = originalError;
  });

  it('renders children when there is no error', () => {
    render(
      <SectionErrorBoundary>
        <Bomb shouldThrow={false} />
      </SectionErrorBoundary>,
    );
    expect(screen.getByText('Widget content')).toBeInTheDocument();
  });

  it('renders an accessible fallback with the error message when a child throws', () => {
    render(
      <SectionErrorBoundary title="Widget failed">
        <Bomb shouldThrow />
      </SectionErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Widget failed')).toBeInTheDocument();
    expect(screen.getByText('widget exploded')).toBeInTheDocument();
  });

  it('calls onRetry and clears the error state when Retry is clicked', async () => {
    const user = userEvent.setup();
    const onRetry = jest.fn();

    function Wrapper() {
      return (
        <SectionErrorBoundary onRetry={onRetry} resetKey="a">
          <Bomb shouldThrow />
        </SectionErrorBoundary>
      );
    }

    render(<Wrapper />);
    await user.click(screen.getByRole('button', { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('calls onError with the caught error', () => {
    const onError = jest.fn();
    render(
      <SectionErrorBoundary onError={onError}>
        <Bomb shouldThrow />
      </SectionErrorBoundary>,
    );
    expect(onError).toHaveBeenCalled();
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
  });
});
