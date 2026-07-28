import { renderHook } from '@testing-library/react';
import { useInfiniteScroll } from '../../hooks/useInfiniteScroll';

describe('useInfiniteScroll', () => {
  let observeSpy;
  let disconnectSpy;
  let observedCallback;

  beforeEach(() => {
    observeSpy = jest.fn();
    disconnectSpy = jest.fn();
    global.IntersectionObserver = jest.fn((callback) => {
      observedCallback = callback;
      return { observe: observeSpy, disconnect: disconnectSpy, unobserve: jest.fn() };
    });
  });

  afterEach(() => {
    delete global.IntersectionObserver;
  });

  it('returns a sentinel ref', () => {
    const { result } = renderHook(() =>
      useInfiniteScroll({ hasMore: true, isLoading: false, onLoadMore: jest.fn() }),
    );
    expect(result.current.sentinelRef).toBeDefined();
    expect(result.current.sentinelRef.current).toBeNull();
  });

  it('does not observe when hasMore is false', () => {
    const div = document.createElement('div');
    const { result } = renderHook(() =>
      useInfiniteScroll({ hasMore: false, isLoading: false, onLoadMore: jest.fn() }),
    );
    result.current.sentinelRef.current = div;
    expect(observeSpy).not.toHaveBeenCalled();
  });

  it('calls onLoadMore when the sentinel intersects', () => {
    const onLoadMore = jest.fn();
    const div = document.createElement('div');

    function Harness() {
      const { sentinelRef } = useInfiniteScroll({
        hasMore: true,
        isLoading: false,
        onLoadMore,
      });
      sentinelRef.current = div;
      return null;
    }

    const { rerender } = renderHook(() => Harness());
    rerender();

    expect(typeof observedCallback).toBe('function');
    observedCallback([{ isIntersecting: true }]);
    expect(onLoadMore).toHaveBeenCalled();
  });

  it('does not throw when IntersectionObserver is unavailable', () => {
    delete global.IntersectionObserver;
    expect(() =>
      renderHook(() =>
        useInfiniteScroll({ hasMore: true, isLoading: false, onLoadMore: jest.fn() }),
      ),
    ).not.toThrow();
  });
});
