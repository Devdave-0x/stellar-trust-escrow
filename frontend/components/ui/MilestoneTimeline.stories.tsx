import type { Meta, StoryObj } from '@storybook/react';
import MilestoneTimeline, { type Milestone } from './MilestoneTimeline';

const pending: Milestone[] = [
  { id: 'm1', title: 'Design mockups', amount: '400', status: 'pending' },
  { id: 'm2', title: 'Frontend implementation', amount: '600', status: 'pending' },
  { id: 'm3', title: 'QA & handoff', amount: '200', status: 'pending' },
];

const partial: Milestone[] = [
  { id: 'm1', title: 'Design mockups', amount: '400', status: 'approved' },
  { id: 'm2', title: 'Frontend implementation', amount: '600', status: 'pending' },
  { id: 'm3', title: 'QA & handoff', amount: '200', status: 'pending' },
];

const allApproved: Milestone[] = [
  { id: 'm1', title: 'Design mockups', amount: '400', status: 'approved' },
  { id: 'm2', title: 'Frontend implementation', amount: '600', status: 'approved' },
  { id: 'm3', title: 'QA & handoff', amount: '200', status: 'approved' },
];

const withDispute: Milestone[] = [
  { id: 'm1', title: 'Design mockups', amount: '400', status: 'approved' },
  { id: 'm2', title: 'Frontend implementation', amount: '600', status: 'disputed' },
  { id: 'm3', title: 'QA & handoff', amount: '200', status: 'pending' },
];

const meta: Meta<typeof MilestoneTimeline> = {
  title: 'UI/MilestoneTimeline',
  component: MilestoneTimeline,
  tags: ['autodocs'],
  parameters: {
    docs: { description: { component: 'Vertical timeline of escrow milestone statuses.' } },
  },
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-sm rounded-lg border border-gray-700 bg-gray-800/60 p-5">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof MilestoneTimeline>;

export const AllPending: Story = { args: { milestones: pending } };
export const PartiallyApproved: Story = { args: { milestones: partial } };
export const AllApproved: Story = { args: { milestones: allApproved } };
export const WithDispute: Story = { args: { milestones: withDispute } };
