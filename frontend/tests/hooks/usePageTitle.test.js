/**
 * @jest-environment jsdom
 */

import { renderHook } from '@testing-library/react';
import { usePageTitle } from '@/hooks/usePageTitle';

describe('usePageTitle', () => {
  const originalTitle = document.title;
  const APP_NAME = 'Stellar Trust Escrow';

  afterEach(() => {
    document.title = originalTitle;
  });

  describe('basic page titles', () => {
    it('sets the document title for a static page', () => {
      renderHook(() => usePageTitle('Dashboard'));
      expect(document.title).toBe(`Dashboard | ${APP_NAME}`);
    });

    it('sets the document title for the explorer page', () => {
      renderHook(() => usePageTitle('Explorer'));
      expect(document.title).toBe(`Explorer | ${APP_NAME}`);
    });

    it('sets the document title for the profile page', () => {
      renderHook(() => usePageTitle('Profile'));
      expect(document.title).toBe(`Profile | ${APP_NAME}`);
    });
  });

  describe('dynamic pages with identifier', () => {
    it('includes the resource identifier in the title', () => {
      renderHook(() => usePageTitle('Escrow', '#1234'));
      expect(document.title).toBe(`Escrow #1234 | ${APP_NAME}`);
    });

    it('works with different identifiers', () => {
      renderHook(() => usePageTitle('Escrow', '#5678'));
      expect(document.title).toBe(`Escrow #5678 | ${APP_NAME}`);
    });

    it('works with address identifiers', () => {
      renderHook(() => usePageTitle('User', 'GABC123'));
      expect(document.title).toBe(`User GABC123 | ${APP_NAME}`);
    });
  });

  describe('loading state', () => {
    it('shows loading title when isLoading is true', () => {
      renderHook(() => usePageTitle('Escrow', '#1234', true));
      expect(document.title).toBe(`Loading... | ${APP_NAME}`);
    });

    it('shows loading title even when pageName is null', () => {
      renderHook(() => usePageTitle(null, null, true));
      expect(document.title).toBe(`Loading... | ${APP_NAME}`);
    });

    it('loading flag overrides pageName and identifier', () => {
      renderHook(() => usePageTitle('Dashboard', null, true));
      expect(document.title).toBe(`Loading... | ${APP_NAME}`);
    });
  });

  describe('no page name', () => {
    it('shows just the app name when pageName is null', () => {
      renderHook(() => usePageTitle(null));
      expect(document.title).toBe(APP_NAME);
    });

    it('shows just the app name when pageName is undefined', () => {
      renderHook(() => usePageTitle());
      expect(document.title).toBe(APP_NAME);
    });
  });

  describe('title updates on re-render', () => {
    it('updates title when pageName changes', () => {
      const { rerender } = renderHook(
        ({ pageName }) => usePageTitle(pageName),
        { initialProps: { pageName: 'Dashboard' } },
      );
      expect(document.title).toBe(`Dashboard | ${APP_NAME}`);

      rerender({ pageName: 'Explorer' });
      expect(document.title).toBe(`Explorer | ${APP_NAME}`);
    });

    it('updates title when identifier changes', () => {
      const { rerender } = renderHook(
        ({ pageName, identifier }) => usePageTitle(pageName, identifier),
        { initialProps: { pageName: 'Escrow', identifier: '#100' } },
      );
      expect(document.title).toBe(`Escrow #100 | ${APP_NAME}`);

      rerender({ pageName: 'Escrow', identifier: '#200' });
      expect(document.title).toBe(`Escrow #200 | ${APP_NAME}`);
    });

    it('transitions from loading to loaded title', () => {
      const { rerender } = renderHook(
        ({ pageName, identifier, isLoading }) =>
          usePageTitle(pageName, identifier, isLoading),
        { initialProps: { pageName: 'Escrow', identifier: '#300', isLoading: true } },
      );
      expect(document.title).toBe(`Loading... | ${APP_NAME}`);

      rerender({ pageName: 'Escrow', identifier: '#300', isLoading: false });
      expect(document.title).toBe(`Escrow #300 | ${APP_NAME}`);
    });
  });
});
