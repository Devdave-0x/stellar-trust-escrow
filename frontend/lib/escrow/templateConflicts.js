/**
 * Template conflict resolution for the create-escrow form.
 *
 * Applying a saved template to a partially filled form can overwrite what the
 * user already typed. These helpers list the fields where the form already
 * has a value that the template would change, and merge the template using
 * the user's per-field choice ('keep' or 'replace').
 */

export const TEMPLATE_FIELDS = [
  { key: 'tokenAddress', label: 'Token' },
  { key: 'totalAmount', label: 'Total amount' },
  { key: 'briefDescription', label: 'Description' },
  { key: 'deadline', label: 'Deadline' },
  { key: 'milestones', label: 'Milestones' },
];

const DEFAULT_MILESTONE = { title: '', description: '', amount: '' };

/** The value each field takes when the template is applied (mirrors the form defaults). */
export function templateValues(template, currentForm) {
  return {
    tokenAddress: template.tokenAddress || currentForm.tokenAddress || 'usdc',
    totalAmount: template.totalAmount || '',
    briefDescription: template.briefDescription || '',
    deadline: template.deadline || '',
    milestones:
      Array.isArray(template.milestones) && template.milestones.length > 0
        ? template.milestones.map((m) => ({
            title: m.title || '',
            description: m.description || '',
            amount: m.amount || '',
          }))
        : [{ ...DEFAULT_MILESTONE }],
  };
}

const isFilled = (key, value) => {
  if (key === 'milestones') {
    return Array.isArray(value) && value.some((m) => m.title || m.description || m.amount);
  }
  return value !== undefined && value !== null && String(value).trim() !== '';
};

const describe = (key, value) => {
  if (key === 'milestones') {
    const filled = (value ?? []).filter((m) => m.title || m.description || m.amount);
    return filled.length ? `${filled.length} milestone(s): ${filled.map((m) => m.title || 'Untitled').join(', ')}` : 'None';
  }
  return value ? String(value) : '—';
};

/**
 * Fields the user already filled in that the template would change.
 * @returns {{ key: string, label: string, current: string, incoming: string }[]}
 */
export function findTemplateConflicts(currentForm, template) {
  const incoming = templateValues(template, currentForm);
  return TEMPLATE_FIELDS.filter(({ key }) => {
    if (!isFilled(key, currentForm[key])) return false;
    return JSON.stringify(currentForm[key]) !== JSON.stringify(incoming[key]);
  }).map(({ key, label }) => ({
    key,
    label,
    current: describe(key, currentForm[key]),
    incoming: describe(key, incoming[key]),
  }));
}

/**
 * Apply `template` to the form. `choices` maps field key → 'keep' | 'replace';
 * fields without a choice (no conflict) take the template value.
 */
export function mergeTemplate(currentForm, template, choices = {}) {
  const incoming = templateValues(template, currentForm);
  const next = { ...currentForm };
  for (const { key } of TEMPLATE_FIELDS) {
    if (choices[key] !== 'keep') next[key] = incoming[key];
  }
  return next;
}
