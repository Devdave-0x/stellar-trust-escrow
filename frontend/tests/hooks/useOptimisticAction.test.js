import { renderHook, act } from '@testing-library/react';
import { useOptimisticAction, useOptimisticList } from '../../hooks/useOptimisticAction';

describe('useOptimisticAction', () => {
  it('applies the optimistic update immediately', async () => {
    const { result } = renderHook(() => useOptimisticAction({ status: 'Submitted' }));

    let promise;
    act(() => {
      promise = result.current.run({
        optimisticUpdate: (prev) => ({ ...prev, status: 'Approved' }),
        action: () => new Promise((resolve) => setTimeout(resolve, 10)),
      });
    });

    expect(result.current.state.status).toBe('Approved');
    expect(result.current.isPending).toBe(true);

    await act(async () => {
      await promise;
    });
    expect(result.current.isPending).toBe(false);
  });

  it('rolls back on failure and exposes the error', async () => {
    const { result } = renderHook(() => useOptimisticAction({ status: 'Submitted' }));

    await act(async () => {
      await result.current
        .run({
          optimisticUpdate: (prev) => ({ ...prev, status: 'Approved' }),
          action: () => Promise.reject(new Error('network down')),
        })
        .catch(() => {});
    });

    expect(result.current.state.status).toBe('Submitted');
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error.message).toBe('network down');
  });

  it('merges the resolved result into state on success', async () => {
    const { result } = renderHook(() => useOptimisticAction({ status: 'Submitted' }));

    await act(async () => {
      await result.current.run({
        optimisticUpdate: (prev) => ({ ...prev, status: 'Approved' }),
        action: () => Promise.resolve({ txHash: '0xabc' }),
        onSuccess: (res, prev) => ({ ...prev, ...res }),
      });
    });

    expect(result.current.state).toEqual({ status: 'Approved', txHash: '0xabc' });
  });
});

describe('useOptimisticList', () => {
  const items = [
    { id: 1, status: 'Pending' },
    { id: 2, status: 'Pending' },
  ];

  it('optimistically patches a single item by id', async () => {
    const { result } = renderHook(() => useOptimisticList(items));

    await act(async () => {
      await result.current.patchItem(1, { status: 'Approved' }, () => Promise.resolve());
    });

    expect(result.current.items.find((i) => i.id === 1).status).toBe('Approved');
    expect(result.current.items.find((i) => i.id === 2).status).toBe('Pending');
  });

  it('rolls back the whole list snapshot if the patch action fails', async () => {
    const { result } = renderHook(() => useOptimisticList(items));

    await act(async () => {
      await result.current
        .patchItem(1, { status: 'Approved' }, () => Promise.reject(new Error('fail')))
        .catch(() => {});
    });

    expect(result.current.items).toEqual(items);
  });

  it('removes an item optimistically', async () => {
    const { result } = renderHook(() => useOptimisticList(items));

    await act(async () => {
      await result.current.removeItem(1, () => Promise.resolve());
    });

    expect(result.current.items.map((i) => i.id)).toEqual([2]);
  });
});
