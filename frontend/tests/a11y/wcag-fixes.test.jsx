/**
 * Accessibility Tests — WCAG 2.1 AA regression guards
 *
 * Each block here pins a specific violation that was found by an axe sweep of
 * the app and then fixed, so the fix cannot silently regress. Components are
 * exercised in both colour schemes because `dark` is a class on <html> and
 * several of these components previously only styled the dark case.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';

import FileDropZone from '@/components/ui/FileDropZone';
import EvidenceUploader from '@/components/dispute/EvidenceUploader';
import MultiUploader from '@/components/dispute/MultiUploader';
import ParameterSimulator from '@/components/governance/ParameterSimulator';
import Progress from '@/components/ui/Progress';
import ProfileForm from '@/components/profile/ProfileForm';
import DataExport from '@/components/settings/DataExport';
import MilestoneGantt from '@/components/escrow/MilestoneGantt';
import OnboardingTutorial from '@/components/onboarding/OnboardingTutorial';

expect.extend(toHaveNoViolations);

const axeRunner = global.axe || axe;

function withTheme(mode, fn) {
  if (mode === 'dark') document.documentElement.classList.add('dark');
  try {
    return fn();
  } finally {
    document.documentElement.classList.remove('dark');
  }
}

const MILESTONES = [
  {
    id: 'm1',
    title: 'Design mockups',
    status: 'Approved',
    amount: '1500000000',
    submittedAt: '2026-01-05T00:00:00Z',
    resolvedAt: '2026-01-12T00:00:00Z',
  },
  {
    id: 'm2',
    title: 'Build frontend',
    status: 'Submitted',
    amount: '2500000000',
    submittedAt: '2026-01-14T00:00:00Z',
  },
];

// ── Drop zones ────────────────────────────────────────────────────────────────
//
// All three uploaders previously used `<div role="button" tabIndex={0}>` with a
// focusable <input type="file"> nested inside it, which axe reports as
// `nested-interactive` (WCAG 4.1.2).

describe.each([
  ['FileDropZone', FileDropZone, /drag and drop files here/i],
  ['EvidenceUploader', EvidenceUploader, /upload evidence files/i],
  ['MultiUploader', MultiUploader, /drop files here/i],
])('Accessibility — %s drop zone', (name, Component, zoneName) => {
  it('exposes the zone as a native button', () => {
    render(<Component />);
    const zone = screen.getByRole('button', { name: zoneName });
    expect(zone.tagName).toBe('BUTTON');
    expect(zone).toHaveAttribute('type', 'button');
  });

  it('does not nest the file input inside the zone button', () => {
    render(<Component />);
    const zone = screen.getByRole('button', { name: zoneName });
    expect(zone.contains(document.querySelector('input[type="file"]'))).toBe(false);
  });

  it('opens the file picker when activated from the keyboard', async () => {
    const user = userEvent.setup();
    render(<Component />);

    const zone = screen.getByRole('button', { name: zoneName });
    const input = document.querySelector('input[type="file"]');
    const clickSpy = jest.spyOn(input, 'click').mockImplementation(() => {});

    zone.focus();
    expect(zone).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(clickSpy).toHaveBeenCalled();
  });

  it.each(['light', 'dark'])('has no violations in %s mode', async (mode) => {
    const { container } = withTheme(mode, () => render(<Component />));
    expect(await axeRunner(container)).toHaveNoViolations();
  });
});

// ── Form labelling ────────────────────────────────────────────────────────────

describe('Accessibility — ParameterSimulator', () => {
  it('associates every slider with a visible label', () => {
    render(<ParameterSimulator />);

    const fee = screen.getByRole('slider', { name: /platform fee/i });
    const timeoutSlider = screen.getByRole('slider', { name: /dispute timeout/i });

    expect(fee).toHaveAttribute('id', 'param-platform-fee');
    expect(timeoutSlider).toHaveAttribute('id', 'param-dispute-timeout');
  });

  it('announces slider values with a unit', () => {
    render(<ParameterSimulator initial={{ fee: 0.5, timeout: 7 }} />);

    expect(screen.getByRole('slider', { name: /platform fee/i })).toHaveAttribute(
      'aria-valuetext',
      '0.50 percent',
    );
    expect(screen.getByRole('slider', { name: /dispute timeout/i })).toHaveAttribute(
      'aria-valuetext',
      '7 days',
    );
  });

  it('updates the label as the slider moves', () => {
    render(<ParameterSimulator initial={{ fee: 0.5, timeout: 7 }} />);

    fireEvent.change(screen.getByRole('slider', { name: /dispute timeout/i }), {
      target: { value: '1' },
    });

    expect(screen.getByRole('slider', { name: /dispute timeout/i })).toHaveAttribute(
      'aria-valuetext',
      '1 day',
    );
  });

  it.each(['light', 'dark'])('has no violations in %s mode', async (mode) => {
    const { container } = withTheme(mode, () => render(<ParameterSimulator />));
    expect(await axeRunner(container)).toHaveNoViolations();
  });
});

describe('Accessibility — ProfileForm', () => {
  it('binds every control to a label instead of relying on placeholders', () => {
    render(<ProfileForm address="GABC" />);

    expect(screen.getByLabelText('Profile Picture')).toHaveAttribute('type', 'file');
    expect(screen.getByLabelText('Display Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Bio')).toBeInTheDocument();
    expect(screen.getByLabelText('Preferences (JSON)')).toBeInTheDocument();
  });

  it('describes the preferences field with its hint text', () => {
    render(<ProfileForm address="GABC" />);
    expect(screen.getByLabelText('Preferences (JSON)')).toHaveAttribute(
      'aria-describedby',
      'profile-preferences-hint',
    );
  });

  it.each(['light', 'dark'])('has no violations in %s mode', async (mode) => {
    const { container } = withTheme(mode, () => render(<ProfileForm address="GABC" />));
    expect(await axeRunner(container)).toHaveNoViolations();
  });
});

describe('Accessibility — DataExport', () => {
  it('labels the import file input and mode select', () => {
    render(<DataExport address="GABC" />);

    expect(screen.getByLabelText('Select File')).toHaveAttribute('type', 'file');
    expect(screen.getByLabelText('Import Mode')).toBeInTheDocument();
  });

  it.each(['light', 'dark'])('has no violations in %s mode', async (mode) => {
    const { container } = withTheme(mode, () => render(<DataExport address="GABC" />));
    expect(await axeRunner(container)).toHaveNoViolations();
  });
});

// ── Progress ──────────────────────────────────────────────────────────────────

describe('Accessibility — Progress', () => {
  it('gives the progressbar an accessible name', () => {
    render(<Progress value={40} />);
    const bar = screen.getByRole('progressbar', { name: 'Progress' });
    expect(bar).toHaveAttribute('aria-valuenow', '40');
    expect(bar).toHaveAttribute('aria-valuetext', '40%');
  });

  it('lets callers override the name', () => {
    render(<Progress value={10} label="Upload progress" />);
    expect(screen.getByRole('progressbar', { name: 'Upload progress' })).toBeInTheDocument();
  });

  it('announces the indeterminate state as a status', () => {
    render(<Progress indeterminate />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading');
  });

  it.each(['light', 'dark'])('has no violations in %s mode', async (mode) => {
    const { container } = withTheme(mode, () => render(<Progress value={60} />));
    expect(await axeRunner(container)).toHaveNoViolations();
  });
});

// ── MilestoneGantt ────────────────────────────────────────────────────────────

describe('Accessibility — MilestoneGantt', () => {
  it('uses role=group so the focusable bars are valid children', () => {
    const { container } = render(<MilestoneGantt milestones={MILESTONES} />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('role', 'group');
    expect(svg).toHaveAttribute('aria-label', 'Milestone Gantt chart');
  });

  it('exposes each milestone bar as a labelled, focusable control', () => {
    render(<MilestoneGantt milestones={MILESTONES} />);

    const bar = screen.getByRole('button', { name: /Design mockups: Approved/ });
    expect(bar).toHaveAttribute('tabindex', '0');
  });

  it('draws a visible focus ring when a bar receives focus', () => {
    const { container } = render(<MilestoneGantt milestones={MILESTONES} />);

    expect(container.querySelector('rect[stroke="#6366f1"]')).toBeNull();

    fireEvent.focus(screen.getByRole('button', { name: /Design mockups: Approved/ }));

    expect(container.querySelector('rect[stroke="#6366f1"]')).not.toBeNull();
  });

  it.each(['light', 'dark'])('has no violations in %s mode', async (mode) => {
    const { container } = withTheme(mode, () => render(<MilestoneGantt milestones={MILESTONES} />));
    expect(await axeRunner(container)).toHaveNoViolations();
  });
});

// ── OnboardingTutorial ────────────────────────────────────────────────────────

describe('Accessibility — OnboardingTutorial', () => {
  it('does not expose the progress dots as tabs', () => {
    render(<OnboardingTutorial isOpen onClose={() => {}} />);
    // They were role="tab" inside a role="tablist" but were neither focusable
    // nor associated with any tabpanel.
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
    expect(screen.queryByRole('tablist')).toBeNull();
  });

  it('announces the current step through a live region', () => {
    render(<OnboardingTutorial isOpen onClose={() => {}} />);
    expect(screen.getByRole('status')).toHaveTextContent('Step 1 of 5');
  });

  it.each(['light', 'dark'])('has no violations in %s mode', async (mode) => {
    const { container } = withTheme(mode, () =>
      render(<OnboardingTutorial isOpen onClose={() => {}} />),
    );
    expect(await axeRunner(container)).toHaveNoViolations();
  });
});
