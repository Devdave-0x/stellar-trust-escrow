import { render, screen, fireEvent } from '@testing-library/react';
import TemplateSelector from '../../../components/escrow/TemplateSelector';
import templatesData from '../../../data/templates.json';

const FORM_DATA = {
  freelancerAddress: 'GABCDEF1234567890',
  tokenAddress: 'usdc',
  totalAmount: '950',
  briefDescription: 'Custom drafting support',
  deadline: '',
  milestones: [
    {
      title: 'Kickoff',
      description: 'Share initial project plan',
      amount: '300',
    },
    {
      title: 'Delivery',
      description: 'Submit final files',
      amount: '650',
    },
  ],
};

describe('TemplateSelector', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders template cards and a preview panel', () => {
    render(
      <TemplateSelector
        baseTemplates={templatesData.templates}
        formData={FORM_DATA}
        onApplyTemplate={jest.fn()}
      />,
    );

    expect(screen.getByText('Escrow Templates')).toBeInTheDocument();
    expect(screen.getAllByText('Freelance Website Launch').length).toBeGreaterThan(0);
    expect(screen.getByText('Milestone preview')).toBeInTheDocument();
  });

  it('calls onApplyTemplate when Use This Template is clicked', () => {
    const onApplyTemplate = jest.fn();

    render(
      <TemplateSelector
        baseTemplates={templatesData.templates}
        formData={FORM_DATA}
        onApplyTemplate={onApplyTemplate}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Use This Template' }));

    expect(onApplyTemplate).toHaveBeenCalledTimes(1);
    expect(onApplyTemplate.mock.calls[0][0]).toEqual(
      expect.objectContaining({ id: templatesData.templates[0].id }),
    );
  });

  it('saves custom templates to localStorage', () => {
    render(
      <TemplateSelector
        baseTemplates={templatesData.templates}
        formData={FORM_DATA}
        onApplyTemplate={jest.fn()}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText('Template name'), {
      target: { value: 'My Monthly Template' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Template' }));

    expect(screen.getByText(/Saved "My Monthly Template"/)).toBeInTheDocument();

    const stored = JSON.parse(localStorage.getItem('escrow_custom_templates_v1'));
    expect(stored[0]).toEqual(
      expect.objectContaining({
        name: 'My Monthly Template',
        category: 'Custom',
        milestones: expect.arrayContaining([expect.objectContaining({ title: 'Kickoff' })]),
      }),
    );
  });

  it('stores favorite template ids', () => {
    render(
      <TemplateSelector
        baseTemplates={templatesData.templates}
        formData={FORM_DATA}
        onApplyTemplate={jest.fn()}
      />,
    );

    fireEvent.click(screen.getAllByLabelText(/save .* as favorite/i)[0]);

    const favorites = JSON.parse(localStorage.getItem('escrow_template_favorites_v1'));
    expect(favorites).toContain(templatesData.templates[0].id);
  });

  // ── Accessibility ──────────────────────────────────────────────────────────

  it('exposes each template as a selectable button rather than a div', () => {
    render(
      <TemplateSelector
        baseTemplates={templatesData.templates}
        formData={FORM_DATA}
        onApplyTemplate={jest.fn()}
      />,
    );

    const first = templatesData.templates[0];
    const selector = screen.getByRole('button', { name: first.name });
    expect(selector).toHaveAttribute('aria-pressed', 'true');
  });

  it('selects a template from the keyboard and moves aria-pressed with it', () => {
    render(
      <TemplateSelector
        baseTemplates={templatesData.templates}
        formData={FORM_DATA}
        onApplyTemplate={jest.fn()}
      />,
    );

    const second = templatesData.templates[1];
    const target = screen.getByRole('button', { name: second.name });

    target.focus();
    expect(target).toHaveFocus();
    // A real <button> activates on Enter natively, which fireEvent.click models.
    fireEvent.click(target);

    expect(target).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: templatesData.templates[0].name })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('keeps the favourite toggle reachable as its own control', () => {
    render(
      <TemplateSelector
        baseTemplates={templatesData.templates}
        formData={FORM_DATA}
        onApplyTemplate={jest.fn()}
      />,
    );

    const first = templatesData.templates[0];
    const favorite = screen.getByRole('button', { name: `Save ${first.name} as favorite` });
    expect(favorite).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(favorite);

    expect(
      screen.getByRole('button', { name: `Remove ${first.name} from favorites` }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('does not nest the favourite control inside the selector control', () => {
    render(
      <TemplateSelector
        baseTemplates={templatesData.templates}
        formData={FORM_DATA}
        onApplyTemplate={jest.fn()}
      />,
    );

    const first = templatesData.templates[0];
    const selector = screen.getByRole('button', { name: first.name });
    const favorite = screen.getByRole('button', { name: `Save ${first.name} as favorite` });

    expect(selector.contains(favorite)).toBe(false);
  });
});
