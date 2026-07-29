import { renderHook, waitFor, act } from '@testing-library/react';
import { CurrencyProvider, useCurrency, SUPPORTED_CURRENCIES } from '../../contexts/CurrencyContext';

const CACHE_KEY = 'ste_fx_rates';
const CACHE_TTL_MS = 60 * 60 * 1000;

function wrapper({ children }) {
  return <CurrencyProvider>{children}</CurrencyProvider>;
}

function seedCache(rates, fetchedAt) {
  window.localStorage.setItem(CACHE_KEY, JSON.stringify({ rates, fetchedAt }));
}

describe('CurrencyContext', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    window.localStorage.clear();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  describe('rate cache and fallback', () => {
    it('uses fresh cached rates and does not hit the network', async () => {
      seedCache({ USD: 1, EUR: 0.5 }, Date.now());

      const { result } = renderHook(() => useCurrency(), { wrapper });

      await waitFor(() => expect(result.current.ratesLoading).toBe(false));

      expect(result.current.rates).toEqual({ USD: 1, EUR: 0.5 });
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('fetches fresh rates when the cache is empty', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ rates: { USD: 1, EUR: 0.9 } }),
      });

      const { result } = renderHook(() => useCurrency(), { wrapper });

      await waitFor(() => expect(result.current.ratesLoading).toBe(false));

      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(result.current.rates).toEqual({ USD: 1, EUR: 0.9 });
      expect(JSON.parse(window.localStorage.getItem(CACHE_KEY)).rates).toEqual({
        USD: 1,
        EUR: 0.9,
      });
    });

    it('fetches fresh rates when the cache has expired', async () => {
      seedCache({ USD: 1, EUR: 0.5 }, Date.now() - CACHE_TTL_MS - 1000);
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ rates: { USD: 1, EUR: 0.95 } }),
      });

      const { result } = renderHook(() => useCurrency(), { wrapper });

      await waitFor(() => expect(result.current.ratesLoading).toBe(false));

      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(result.current.rates).toEqual({ USD: 1, EUR: 0.95 });
    });

    it('falls back to the default USD rate when the cache is empty and the fetch fails', async () => {
      global.fetch.mockRejectedValue(new Error('network down'));

      const { result } = renderHook(() => useCurrency(), { wrapper });

      await waitFor(() => expect(result.current.ratesLoading).toBe(false));

      expect(result.current.ratesError).toBe('network down');
      expect(result.current.rates).toEqual({ USD: 1 });
      expect(result.current.convert(20_000_000)).toBe(2);
    });

    it('defaults a missing USD key on the response to 1', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ rates: { EUR: 0.9 } }),
      });

      const { result } = renderHook(() => useCurrency(), { wrapper });

      await waitFor(() => expect(result.current.ratesLoading).toBe(false));

      expect(result.current.rates.USD).toBe(1);
    });
  });

  describe('convert', () => {
    it('converts a raw stroop amount to the selected currency using the cached rate', async () => {
      seedCache({ USD: 1, EUR: 0.9 }, Date.now());
      const { result } = renderHook(() => useCurrency(), { wrapper });
      await waitFor(() => expect(result.current.ratesLoading).toBe(false));

      act(() => result.current.setCurrency('EUR'));

      expect(result.current.convert(20_000_000)).toBeCloseTo(1.8);
    });

    it('returns 0 for a zero amount', async () => {
      seedCache({ USD: 1 }, Date.now());
      const { result } = renderHook(() => useCurrency(), { wrapper });
      await waitFor(() => expect(result.current.ratesLoading).toBe(false));

      expect(result.current.convert(0)).toBe(0);
    });

    it('handles very large amounts without overflowing to a non-finite value', async () => {
      seedCache({ USD: 1 }, Date.now());
      const { result } = renderHook(() => useCurrency(), { wrapper });
      await waitFor(() => expect(result.current.ratesLoading).toBe(false));

      const converted = result.current.convert('900000000000000000');
      expect(Number.isFinite(converted)).toBe(true);
    });
  });

  describe('format / formatAmount', () => {
    it('formats USD with the $ symbol', async () => {
      seedCache({ USD: 1 }, Date.now());
      const { result } = renderHook(() => useCurrency(), { wrapper });
      await waitFor(() => expect(result.current.ratesLoading).toBe(false));

      expect(result.current.format(20_000_000)).toBe('$2.00');
    });

    it('formats EUR with the € symbol after switching currency', async () => {
      seedCache({ USD: 1, EUR: 0.9 }, Date.now());
      const { result } = renderHook(() => useCurrency(), { wrapper });
      await waitFor(() => expect(result.current.ratesLoading).toBe(false));

      act(() => result.current.setCurrency('EUR'));

      expect(result.current.format(20_000_000)).toContain('€');
    });

    it('ignores an unsupported currency code and keeps the previous currency', async () => {
      seedCache({ USD: 1 }, Date.now());
      const { result } = renderHook(() => useCurrency(), { wrapper });
      await waitFor(() => expect(result.current.ratesLoading).toBe(false));

      act(() => result.current.setCurrency('ZZZ'));

      expect(result.current.currency).toBe('USD');
    });

    it('exposes every supported currency with a code and symbol', () => {
      SUPPORTED_CURRENCIES.forEach((c) => {
        expect(c).toEqual(expect.objectContaining({ code: expect.any(String), symbol: expect.any(String) }));
      });
    });
  });

  describe('formatUSDC', () => {
    it('formats a raw stroop amount as USDC without currency conversion', async () => {
      seedCache({ USD: 1, EUR: 0.9 }, Date.now());
      const { result } = renderHook(() => useCurrency(), { wrapper });
      await waitFor(() => expect(result.current.ratesLoading).toBe(false));

      act(() => result.current.setCurrency('EUR'));

      expect(result.current.formatUSDC(20_000_000)).toBe('2.00 USDC');
    });
  });

  it('throws when used outside of a CurrencyProvider', () => {
    expect(() => renderHook(() => useCurrency())).toThrow(
      'useCurrency must be used within CurrencyProvider',
    );
  });
});
