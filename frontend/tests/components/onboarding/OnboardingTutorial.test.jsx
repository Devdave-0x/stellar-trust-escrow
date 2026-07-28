import { render, screen, fireEvent } from '@testing-library/react';
import OnboardingTutorial, {
  ONBOARDING_STEPS,
} from '../../../components/onboarding/OnboardingTutorial';

describe('OnboardingTutorial', () => {
  it('renders nothing when isOpen is false', () => {
    render(<OnboardingTutorial isOpen={false} onClose={jest.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders the first step when opened', () => {
    render(<OnboardingTutorial isOpen={true} onClose={jest.fn()} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(ONBOARDING_STEPS[0].title)).toBeInTheDocument();
  });

  it('has correct aria attributes for accessibility', () => {
    render(<OnboardingTutorial isOpen={true} onClose={jest.fn()} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby', 'onboarding-title');
    expect(dialog).toHaveAttribute('aria-describedby', 'onboarding-body');
  });

  it('shows a step indicator with tablist role', () => {
    render(<OnboardingTutorial isOpen={true} onClose={jest.fn()} />);
    expect(screen.getByRole('tablist', { name: 'Onboarding progress' })).toBeInTheDocument();
    expect(screen.getByText(`Step 1 of ${ONBOARDING_STEPS.length}`)).toBeInTheDocument();
  });

  it('advances to the next step when Next is clicked', () => {
    render(<OnboardingTutorial isOpen={true} onClose={jest.fn()} />);
    fireEvent.click(screen.getByText('Next'));
    expect(screen.getByText(ONBOARDING_STEPS[1].title)).toBeInTheDocument();
    expect(screen.getByText(`Step 2 of ${ONBOARDING_STEPS.length}`)).toBeInTheDocument();
  });

  it('goes back to the previous step when Back is clicked', () => {
    render(<OnboardingTutorial isOpen={true} onClose={jest.fn()} />);
    fireEvent.click(screen.getByText('Next'));
    fireEvent.click(screen.getByText('Back'));
    expect(screen.getByText(ONBOARDING_STEPS[0].title)).toBeInTheDocument();
  });

  it('does not show a Back button on the first step', () => {
    render(<OnboardingTutorial isOpen={true} onClose={jest.fn()} />);
    expect(screen.queryByText('Back')).not.toBeInTheDocument();
  });

  it('shows "Get started" instead of "Next" on the final step', () => {
    render(<OnboardingTutorial isOpen={true} onClose={jest.fn()} />);
    for (let i = 0; i < ONBOARDING_STEPS.length - 1; i += 1) {
      fireEvent.click(screen.getByText('Next'));
    }
    expect(screen.getByText('Get started')).toBeInTheDocument();
    expect(screen.queryByText('Next')).not.toBeInTheDocument();
  });

  it('calls onClose when Skip is clicked', () => {
    const onClose = jest.fn();
    render(<OnboardingTutorial isOpen={true} onClose={onClose} />);
    fireEvent.click(screen.getByText('Skip'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when the close button is clicked', () => {
    const onClose = jest.fn();
    render(<OnboardingTutorial isOpen={true} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText('Close onboarding tutorial'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when the backdrop is clicked', () => {
    const onClose = jest.fn();
    const { container } = render(<OnboardingTutorial isOpen={true} onClose={onClose} />);
    const backdrop = container.querySelector('.absolute.inset-0');
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when Escape is pressed', () => {
    const onClose = jest.fn();
    render(<OnboardingTutorial isOpen={true} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('advances step with the right arrow key', () => {
    render(<OnboardingTutorial isOpen={true} onClose={jest.fn()} />);
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    expect(screen.getByText(ONBOARDING_STEPS[1].title)).toBeInTheDocument();
  });

  it('resets to the first step every time it is reopened', () => {
    const { rerender } = render(<OnboardingTutorial isOpen={true} onClose={jest.fn()} />);
    fireEvent.click(screen.getByText('Next'));
    rerender(<OnboardingTutorial isOpen={false} onClose={jest.fn()} />);
    rerender(<OnboardingTutorial isOpen={true} onClose={jest.fn()} />);
    expect(screen.getByText(ONBOARDING_STEPS[0].title)).toBeInTheDocument();
  });

  it('renders custom steps when provided', () => {
    const customSteps = [{ id: 'a', title: 'Custom step', body: 'Custom body', icon: '⭐' }];
    render(<OnboardingTutorial isOpen={true} onClose={jest.fn()} steps={customSteps} />);
    expect(screen.getByText('Custom step')).toBeInTheDocument();
    expect(screen.getByText('Get started')).toBeInTheDocument();
  });
});
