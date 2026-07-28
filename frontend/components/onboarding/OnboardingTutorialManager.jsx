'use client';

/**
 * Mounts the first-time onboarding tutorial at the app root.
 * Kept as its own client component so the (server) root layout doesn't
 * need to become a client component just to own this piece of state.
 */

import OnboardingTutorial, { useOnboardingTutorial } from './OnboardingTutorial';

export default function OnboardingTutorialManager() {
  const { isOpen, close } = useOnboardingTutorial();
  return <OnboardingTutorial isOpen={isOpen} onClose={close} />;
}
