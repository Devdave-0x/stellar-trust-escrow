'use client';

/**
 * usePageTitle Hook
 *
 * Sets document.title on every route change.
 * Format: {Page Name} | Stellar Trust Escrow
 *
 * Dynamic pages include the resource identifier: Escrow #1234 | Stellar Trust Escrow
 * On loading state, shows: Loading... | Stellar Trust Escrow
 *
 * Usage:
 *   usePageTitle('Dashboard');
 *   usePageTitle('Escrow', id ? `#${id}` : null);
 *   usePageTitle(null, null, true); // loading state
 *
 * @param {string|null}  [pageName]   — e.g. 'Dashboard', 'Escrow', 'Explorer'
 * @param {string|null}  [identifier] — e.g. '#1234', 'GABC...' — appended after pageName
 * @param {boolean}      [isLoading]  — when true, shows 'Loading...'
 */

import { useEffect } from 'react';

const APP_NAME = 'Stellar Trust Escrow';

export function usePageTitle(pageName, identifier, isLoading = false) {
  useEffect(() => {
    if (isLoading) {
      document.title = `Loading... | ${APP_NAME}`;
      return;
    }

    if (!pageName) {
      document.title = APP_NAME;
      return;
    }

    if (identifier) {
      document.title = `${pageName} ${identifier} | ${APP_NAME}`;
    } else {
      document.title = `${pageName} | ${APP_NAME}`;
    }
  }, [pageName, identifier, isLoading]);
}
