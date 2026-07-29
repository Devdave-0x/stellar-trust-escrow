import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SectionErrorBoundary from '../../components/ui/SectionErrorBoundary';
import { useErrorHandler } from '../../hooks/useErrorHandler';

function AsyncFailer() {
  const throwError = useErrorHandler();
  return (
    <button
      type="button"
      onClick={() => Promise.reject(new Error('fetch failed')).catch(throwError)}
    >
      Trigger
    </button>
  );
}

describe('useErrorHandler', () => {
  const originalError = console.error;
  beforeEach(() => {
    console.error = jest.fn();
  });
  afterEach(() => {
    console.error = originalError;
  });

  it('escalates an async error to the nearest error boundary', async () => {
    const user = userEvent.setup();
    render(
      <SectionErrorBoundary title="Async failure">
        <AsyncFailer />
      </SectionErrorBoundary>,
    );

    await user.click(screen.getByRole('button', { name: /trigger/i }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('fetch failed')).toBeInTheDocument();
  });
});
