import { formatCurrency, convertToUSD } from '../../lib/formatCurrency';

describe('formatCurrency', () => {
  describe('XLM formatting', () => {
    it('formats XLM with 7 decimal places', () => {
      expect(formatCurrency(1234.5678901, 'XLM')).toBe('1234.5678901 XLM');
    });

    it('formats XLM with trailing zeros to 7 places', () => {
      expect(formatCurrency(100, 'XLM')).toBe('100.0000000 XLM');
    });

    it('formats small XLM amounts correctly', () => {
      expect(formatCurrency(0.0000001, 'XLM')).toBe('0.0000001 XLM');
    });

    it('handles zero XLM', () => {
      expect(formatCurrency(0, 'XLM')).toBe('0.0000000 XLM');
    });
  });

  describe('USD formatting', () => {
    it('formats USD with 2 decimal places using locale', () => {
      const result = formatCurrency(1234.56, 'USD');
      // $1,234.56 in en-US locale
      expect(result).toContain('1,234.56');
    });

    it('respects custom locale for USD', () => {
      const result = formatCurrency(1234.56, 'USD', 'de-DE');
      expect(result).toContain('1.234,56');
    });
  });

  describe('EUR formatting', () => {
    it('formats EUR with 2 decimal places', () => {
      const result = formatCurrency(1234.56, 'EUR');
      // Uses de-DE locale by default
      expect(result).toContain('1.234,56');
      expect(result).toContain('€');
    });
  });

  describe('GBP formatting', () => {
    it('formats GBP with 2 decimal places', () => {
      const result = formatCurrency(1234.56, 'GBP');
      expect(result).toContain('1,234.56');
      expect(result).toContain('£');
    });
  });

  describe('invalid currency fallback', () => {
    it('falls back to 2 decimals with currency code suffix', () => {
      const result = formatCurrency(1234.56, 'XYZ');
      expect(result).toContain('1,234.56');
      expect(result).toContain('XYZ');
    });

    it('returns dash for null/undefined amounts', () => {
      expect(formatCurrency(null, 'USD')).toBe('—');
      expect(formatCurrency(undefined, 'USD')).toBe('—');
    });

    it('returns dash for NaN', () => {
      expect(formatCurrency(NaN, 'USD')).toBe('—');
    });
  });
});

describe('convertToUSD', () => {
  it('converts amount using the given rate', () => {
    expect(convertToUSD(100, 1.2)).toBe(120);
  });

  it('handles zero rate', () => {
    expect(convertToUSD(100, 0)).toBe(0);
  });

  it('handles zero amount', () => {
    expect(convertToUSD(0, 1.5)).toBe(0);
  });
});
