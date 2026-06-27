import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Toast from '../../../components/ui/Toast';

describe('Toast', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('renders with success variant', () => {
    const onClose = jest.fn();
    render(<Toast message="Success!" type="success" onClose={onClose} duration={5000} />);
    expect(screen.getByText('Success!')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('renders with error variant', () => {
    const onClose = jest.fn();
    render(<Toast message="Error occurred" type="error" onClose={onClose} duration={5000} />);
    expect(screen.getByText('Error occurred')).toBeInTheDocument();
  });

  it('renders with warning variant', () => {
    const onClose = jest.fn();
    render(<Toast message="Warning!" type="warning" onClose={onClose} duration={5000} />);
    expect(screen.getByText('Warning!')).toBeInTheDocument();
  });

  it('renders with info variant', () => {
    const onClose = jest.fn();
    render(<Toast message="Information" type="info" onClose={onClose} duration={5000} />);
    expect(screen.getByText('Information')).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = jest.fn();
    render(<Toast message="Test" type="success" onClose={onClose} duration={5000} />);
    fireEvent.click(screen.getByLabelText('Close notification'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('auto-dismisses after duration', () => {
    const onClose = jest.fn();
    render(<Toast message="Test" type="success" onClose={onClose} duration={3000} />);
    jest.advanceTimersByTime(3000);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows progress bar that decreases', () => {
    const onClose = jest.fn();
    const { container } = render(
      <Toast message="Test" type="success" onClose={onClose} duration={5000} />,
    );

    const progressBar = container.querySelector('div[style]');
    expect(progressBar).toBeInTheDocument();

    jest.advanceTimersByTime(2500);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('has ARIA live region for accessibility', () => {
    const onClose = jest.fn();
    render(<Toast message="Alert message" type="success" onClose={onClose} duration={5000} />);
    expect(screen.getByRole('alert')).toHaveAttribute('aria-live', 'assertive');
  });

  it('uses default duration of 5000ms', () => {
    const onClose = jest.fn();
    render(<Toast message="Test" type="success" onClose={onClose} />);
    jest.advanceTimersByTime(5000);
    expect(onClose).toHaveBeenCalled();
  });
});
