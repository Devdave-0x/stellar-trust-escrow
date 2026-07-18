import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import DisputeForm, { type DisputeEvidence } from './DisputeForm';

const evidence: DisputeEvidence[] = [
  { id: 'e1', name: 'screenshot-delivery.png', size: '240 KB' },
  { id: 'e2', name: 'contract-amendment.pdf', size: '1.2 MB' },
];

const meta: Meta<typeof DisputeForm> = {
  title: 'UI/DisputeForm',
  component: DisputeForm,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: { component: 'Form for raising an escrow dispute with reason and evidence.' },
    },
  },
  args: {
    escrowId: 'ESC-10293',
    onSubmit: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof DisputeForm>;

export const Empty: Story = {
  args: { initialEvidence: [] },
};

export const WithEvidence: Story = {
  args: { initialEvidence: evidence },
};

export const Submitting: Story = {
  args: { initialEvidence: evidence, isSubmitting: true },
};

export const Error: Story = {
  args: {
    initialEvidence: evidence,
    submitError: 'Submission failed: the arbitrator node is unreachable. Please retry.',
  },
};
