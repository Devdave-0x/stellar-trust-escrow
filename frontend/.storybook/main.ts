import type { StorybookConfig } from '@storybook/nextjs';

/**
 * Storybook configuration for the Stellar Trust Escrow frontend.
 *
 * - Framework: @storybook/nextjs (Next.js App Router support)
 * - Addons: essentials, a11y, interactions (+ Chromatic for visual snapshots)
 * - Stories: one *.stories.{js,jsx,ts,tsx} file per shared component
 */
const config: StorybookConfig = {
  stories: ['../components/**/*.stories.@(js|jsx|ts|tsx)'],
  addons: [
    '@storybook/addon-essentials',
    '@storybook/addon-a11y',
    '@storybook/addon-interactions',
    // '@chromatic-com/storybook' is added in CI via the Chromatic workflow and
    // the CHROMATIC_PROJECT_TOKEN secret; it is intentionally not required for a
    // local `storybook build` so the build stays reproducible without the token.
  ],
  framework: {
    name: '@storybook/nextjs',
    options: {
      // Use the Storybook-safe Next.js config to avoid the API URL env check.
      nextConfigPath: './.storybook/next.config.js',
    },
  },
  docs: {
    autodocs: 'tag',
  },
  core: {
    disableTelemetry: true,
  },
  webpackFinal: async (config) => {
    // Disable the persistent webpack filesystem cache. On some Node/Next.js
    // combinations Storybook's cache shutdown hook throws
    // "Cannot read properties of undefined (reading 'tap')", which fails the
    // build even though compilation succeeds.
    config.cache = false;
    return config;
  },
};

export default config;
