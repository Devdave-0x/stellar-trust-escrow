/**
 * @jest-environment jsdom
 */

import { renderHook, act } from '@testing-library/react';
import { useFormDirty } from '@/hooks/useFormDirty';

describe('useFormDirty', () => {
  beforeEach(() => {
    jest.spyOn(window, 'addEventListener');
    jest.spyOn(window, 'removeEventListener');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('initial state', () => {
    it('returns isDirty as false initially', () => {
      const { result } = renderHook(() => useFormDirty());
      expect(result.current.isDirty).toBe(false);
    });

    it('registers beforeunload listener on mount', () => {
      renderHook(() => useFormDirty());
      expect(window.addEventListener).toHaveBeenCalledWith(
        'beforeunload',
        expect.any(Function),
      );
    });

    it('registers popstate listener on mount', () => {
      renderHook(() => useFormDirty());
      expect(window.addEventListener).toHaveBeenCalledWith(
        'popstate',
        expect.any(Function),
      );
    });

    it('cleans up listeners on unmount', () => {
      const { unmount } = renderHook(() => useFormDirty());
      unmount();
      expect(window.removeEventListener).toHaveBeenCalledWith(
        'beforeunload',
        expect.any(Function),
      );
      expect(window.removeEventListener).toHaveBeenCalledWith(
        'popstate',
        expect.any(Function),
      );
    });
  });

  describe('markDirty', () => {
    it('sets isDirty to true', () => {
      const { result } = renderHook(() => useFormDirty());
      act(() => {
        result.current.markDirty();
      });
      expect(result.current.isDirty).toBe(true);
    });
  });

  describe('submitForm', () => {
    it('sets isDirty to false after submission', () => {
      const { result } = renderHook(() => useFormDirty());
      act(() => {
        result.current.markDirty();
      });
      expect(result.current.isDirty).toBe(true);
      act(() => {
        result.current.submitForm();
      });
      expect(result.current.isDirty).toBe(false);
    });

    it('prevents markDirty from re-enabling dirty state after submission', () => {
      const { result } = renderHook(() => useFormDirty());
      act(() => {
        result.current.markDirty();
      });
      act(() => {
        result.current.submitForm();
      });
      act(() => {
        result.current.markDirty();
      });
      expect(result.current.isDirty).toBe(false);
    });
  });

  describe('resetForm', () => {
    it('resets dirty to false and allows markDirty again', () => {
      const { result } = renderHook(() => useFormDirty());
      act(() => {
        result.current.markDirty();
      });
      expect(result.current.isDirty).toBe(true);
      act(() => {
        result.current.resetForm();
      });
      expect(result.current.isDirty).toBe(false);
      act(() => {
        result.current.markDirty();
      });
      expect(result.current.isDirty).toBe(true);
    });

    it('re-enables the guard after a reset following submission', () => {
      const { result } = renderHook(() => useFormDirty());
      act(() => {
        result.current.markDirty();
      });
      act(() => {
        result.current.submitForm();
      });
      expect(result.current.isDirty).toBe(false);
      act(() => {
        result.current.resetForm();
      });
      act(() => {
        result.current.markDirty();
      });
      expect(result.current.isDirty).toBe(true);
    });
  });

  describe('beforeunload guard', () => {
    it('sets returnValue on beforeunload when dirty', () => {
      const { result } = renderHook(() => useFormDirty());
      act(() => {
        result.current.markDirty();
      });

      const beforeunloadCalls = window.addEventListener.mock.calls.filter(
        ([event]) => event === 'beforeunload',
      );
      expect(beforeunloadCalls.length).toBeGreaterThan(0);

      const handler = beforeunloadCalls[0][1];
      const event = { preventDefault: jest.fn(), returnValue: '' };
      const returnVal = handler(event);

      expect(event.preventDefault).toHaveBeenCalled();
      expect(event.returnValue).toBe('You have unsaved changes. Leave anyway?');
      expect(returnVal).toBe('You have unsaved changes. Leave anyway?');
    });

    it('does not intercept beforeunload when form is clean', () => {
      const { result } = renderHook(() => useFormDirty());
      // Form is clean (isDirty = false)

      const beforeunloadCalls = window.addEventListener.mock.calls.filter(
        ([event]) => event === 'beforeunload',
      );
      const handler = beforeunloadCalls[0][1];
      const event = { preventDefault: jest.fn(), returnValue: '' };
      handler(event);

      // Clean form doesn't set returnValue
      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(event.returnValue).toBe('');
    });

    it('does not intercept beforeunload after submit', () => {
      const { result } = renderHook(() => useFormDirty());
      act(() => {
        result.current.markDirty();
      });
      act(() => {
        result.current.submitForm();
      });

      const beforeunloadCalls = window.addEventListener.mock.calls.filter(
        ([event]) => event === 'beforeunload',
      );
      const handler = beforeunloadCalls[0][1];
      const event = { preventDefault: jest.fn(), returnValue: '' };
      handler(event);

      // Guard disabled after submit
      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(event.returnValue).toBe('');
    });
  });

  describe('popstate guard', () => {
    it('shows confirmation when dirty on popstate', () => {
      const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false);

      const { result } = renderHook(() => useFormDirty());
      act(() => {
        result.current.markDirty();
      });

      const popstateCalls = window.addEventListener.mock.calls.filter(
        ([event]) => event === 'popstate',
      );
      expect(popstateCalls.length).toBeGreaterThan(0);

      const handler = popstateCalls[0][1];
      const event = new PopStateEvent('popstate');
      handler(event);

      expect(confirmSpy).toHaveBeenCalledWith(
        'You have unsaved changes. Leave anyway?',
      );
      confirmSpy.mockRestore();
    });

    it('does not show confirmation when clean on popstate', () => {
      const confirmSpy = jest.spyOn(window, 'confirm');

      renderHook(() => useFormDirty());

      const popstateCalls = window.addEventListener.mock.calls.filter(
        ([event]) => event === 'popstate',
      );
      const handler = popstateCalls[0][1];
      const event = new PopStateEvent('popstate');
      handler(event);

      expect(confirmSpy).not.toHaveBeenCalled();
      confirmSpy.mockRestore();
    });
  });
});
