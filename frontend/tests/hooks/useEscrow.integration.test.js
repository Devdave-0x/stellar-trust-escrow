import { renderHook } from '@testing-library/react';
import useSWR from 'swr';
import { useEscrow } from '../../hooks/useEscrow';

jest.mock('swr');

describe('useEscrow integration flow', () => {
  it('returns fetched escrow data through the hook contract', () => {
    useSWR.mockReturnValue({
      data: { id: 42, title: 'Escrow Integration' },
      error: undefined,
      isLoading: false,
      mutate: jest.fn(),
    });

    const { result } = renderHook(() => useEscrow(42));

    expect(result.current.escrow).toEqual({ id: 42, title: 'Escrow Integration' });
    expect(result.current.isLoading).toBe(false);
  });
});
