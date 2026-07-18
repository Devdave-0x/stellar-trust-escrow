import type { Preview } from '@storybook/react';
import React from 'react';
import { ThemeProvider } from '../components/providers/ThemeProvider';
import { MockWalletProvider } from './mocks/WalletContextMock';
import '../app/globals.css';

/**
 * Global decorators wrap every story in the application's ThemeProvider and a
 * mocked WalletContext so components relying on wallet state render correctly
 * without a real Freighter / Ledger extension.
 */
const preview: Preview = {
  parameters: {
    backgrounds: {
      default: 'dark',
      values: [
        { name: 'dark', value: '#111827' }, // gray-900
        { name: 'darker', value: '#030712' }, // gray-950
        { name: 'light', value: '#ffffff' },
      ],
    },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    // Flag accessibility violations at the 'error' severity level so they block
    // review instead of being hidden as to-dos.
    a11y: {
      test: 'error',
      element: '#storybook-root',
    },
    nextjs: {
      appDirectory: true,
    },
  },
  decorators: [
    (Story) => (
      <ThemeProvider defaultTheme="dark">
        <MockWalletProvider>
          <div className="min-h-screen bg-gray-900 p-8 text-gray-100">
            <Story />
          </div>
        </MockWalletProvider>
      </ThemeProvider>
    ),
  ],
};

export default preview;
