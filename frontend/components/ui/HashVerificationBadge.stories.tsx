import type { Meta, StoryObj } from '@storybook/react';
import HashVerificationBadge from './HashVerificationBadge';

const meta: Meta<typeof HashVerificationBadge> = {
  title: 'UI/HashVerificationBadge',
  component: HashVerificationBadge,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Badge that communicates on-chain hash verification state (verified / mismatch / verifying).',
      },
    },
  },
  argTypes: {
    status: { control: 'select', options: ['verified', 'mismatch', 'verifying'] },
    hash: { control: 'text' },
    label: { control: 'text' },
  },
  args: {
    status: 'verified',
    hash: 'a1b2c3…f9',
  },
};

export default meta;
type Story = StoryObj<typeof HashVerificationBadge>;

export const Verified: Story = { args: { status: 'verified', hash: 'a1b2c3…f9' } };
export const Mismatch: Story = {
  args: { status: 'mismatch', hash: '0000ff…ee', label: 'Mismatch' },
};
export const Verifying: Story = { args: { status: 'verifying', hash: 'a1b2c3…f9' } };
