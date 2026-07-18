import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import EvidenceViewer, { type Evidence } from './EvidenceViewer';

const pdf: Evidence = {
  id: 'ev1',
  name: 'contract-amendment.pdf',
  kind: 'pdf',
  url: 'about:blank',
};

const image: Evidence = {
  id: 'ev2',
  name: 'screenshot-delivery.png',
  kind: 'image',
  url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="100%" height="100%" fill="%231f2937"/><text x="50%" y="50%" fill="%239ca3af" font-family="sans-serif" font-size="14" text-anchor="middle" dominant-baseline="middle">Evidence preview</text></svg>',
};

const meta: Meta<typeof EvidenceViewer> = {
  title: 'UI/EvidenceViewer',
  component: EvidenceViewer,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Viewer for dispute evidence (PDF or image) with loading and gateway-error states.',
      },
    },
  },
  args: {
    evidence: pdf,
    onRetry: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof EvidenceViewer>;

export const PdfLoading: Story = {
  args: { evidence: pdf, isLoading: true },
};

export const PdfLoaded: Story = {
  args: { evidence: pdf, isLoading: false },
};

export const ImageLoaded: Story = {
  args: { evidence: image, isLoading: false },
};

export const GatewayError: Story = {
  args: {
    evidence: pdf,
    error: 'IPFS gateway returned 504 Gateway Timeout. The content may be unavailable.',
  },
};
