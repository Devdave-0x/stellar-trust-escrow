import { findTemplateConflicts, mergeTemplate } from '../../lib/escrow/templateConflicts';

const template = {
  name: 'Design sprint',
  tokenAddress: 'usdc',
  totalAmount: '500',
  briefDescription: 'Two-week design sprint',
  milestones: [{ title: 'Wireframes', amount: '200' }, { title: 'Final UI', amount: '300' }],
};
const empty = { tokenAddress: 'usdc', totalAmount: '', briefDescription: '', deadline: '', milestones: [{ title: '', description: '', amount: '' }] };

describe('template conflicts', () => {
  it('reports no conflicts for an empty form', () => {
    expect(findTemplateConflicts(empty, template)).toEqual([]);
  });

  it('lists only filled fields the template would change', () => {
    const form = { ...empty, totalAmount: '800', briefDescription: 'Two-week design sprint' };
    expect(findTemplateConflicts(form, template).map((c) => c.key)).toEqual(['totalAmount']);
  });

  it('keeps or replaces each field according to the choice', () => {
    const form = { ...empty, totalAmount: '800', milestones: [{ title: 'Mine', description: '', amount: '800' }] };
    const keepAll = mergeTemplate(form, template, { totalAmount: 'keep', milestones: 'keep' });
    expect(keepAll.totalAmount).toBe('800');
    expect(keepAll.milestones[0].title).toBe('Mine');
    expect(keepAll.briefDescription).toBe('Two-week design sprint'); // no conflict → template value

    const replaceAll = mergeTemplate(form, template, { totalAmount: 'replace', milestones: 'replace' });
    expect(replaceAll.totalAmount).toBe('500');
    expect(replaceAll.milestones).toHaveLength(2);
  });
});
