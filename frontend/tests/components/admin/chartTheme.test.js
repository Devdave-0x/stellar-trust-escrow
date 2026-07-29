import {
  CHART_THEME,
  SERIES_KEYS,
  deriveMetrics,
  formatCount,
  formatPercent,
  readableInkOn,
} from '@/components/admin/chartTheme';

describe('deriveMetrics', () => {
  it('derives counts, the residual bucket, and rates from a stats payload', () => {
    const metrics = deriveMetrics({
      escrows: { total: 20, active: 8, completed: 9, disputed: 2 },
      users: { total: 33 },
      disputes: { open: 1, resolved: 1 },
    });

    expect(metrics.total).toBe(20);
    expect(metrics.users).toBe(33);
    expect(metrics.other).toBe(1); // 20 - 8 - 9 - 2
    expect(metrics.completionRate).toBeCloseTo(0.45);
    expect(metrics.disputeRate).toBeCloseTo(0.1);
    expect(metrics.resolutionRate).toBeCloseTo(0.5);
    expect(metrics.totalDisputes).toBe(2);
  });

  it('returns null rates rather than a misleading 0% when there is no denominator', () => {
    const metrics = deriveMetrics({
      escrows: { total: 0, active: 0, completed: 0, disputed: 0 },
      users: { total: 0 },
      disputes: { open: 0, resolved: 0 },
    });

    expect(metrics.completionRate).toBeNull();
    expect(metrics.disputeRate).toBeNull();
    expect(metrics.resolutionRate).toBeNull();
  });

  it('never reports a negative residual or a negative resolved count', () => {
    const metrics = deriveMetrics({
      escrows: { total: 5, active: 3, completed: 3, disputed: 1 },
      disputes: { open: 4, resolved: -3 },
    });

    expect(metrics.other).toBe(0);
    expect(metrics.resolved).toBe(0);
  });

  it('tolerates a null payload', () => {
    const metrics = deriveMetrics(null);
    expect(metrics.total).toBe(0);
    expect(metrics.users).toBe(0);
    expect(metrics.completionRate).toBeNull();
  });
});

describe('formatCount', () => {
  it('shows exact values below 10,000 with thousands separators', () => {
    expect(formatCount(0)).toBe('0');
    expect(formatCount(1284)).toBe('1,284');
  });

  it('compacts values at or above 10,000', () => {
    expect(formatCount(12900)).toBe('12.9K');
  });

  it('renders an em dash for unknown values', () => {
    expect(formatCount(null)).toBe('—');
    expect(formatCount(undefined)).toBe('—');
  });
});

describe('formatPercent', () => {
  it('drops the decimal for whole percentages', () => {
    expect(formatPercent(0.5)).toBe('50%');
  });

  it('keeps one decimal otherwise', () => {
    expect(formatPercent(0.625)).toBe('62.5%');
  });

  it('renders an em dash when there is no rate', () => {
    expect(formatPercent(null)).toBe('—');
  });
});

describe('readableInkOn', () => {
  it('picks white ink on the darkest series fill', () => {
    expect(readableInkOn('#4f46e5')).toBe('#ffffff');
  });

  it('picks dark ink on the lighter fills, where white would fall short', () => {
    // #199e70 is 3.4:1 against white but 5.0:1 against near-black.
    expect(readableInkOn('#199e70')).toBe('#111827');
    expect(readableInkOn('#c98500')).toBe('#111827');
    expect(readableInkOn('#9ca3af')).toBe('#111827');
  });

  // `other` is excluded: the de-emphasis gray is chosen to recede against the
  // surface, so it never hosts an inline label — see EscrowStatusChart.
  it('clears 4.5:1 against every label-bearing series fill in both modes', () => {
    const luminance = (hex) => {
      const int = parseInt(hex.slice(1), 16);
      const ch = (c) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return (
        0.2126 * ch((int >> 16) & 255) + 0.7152 * ch((int >> 8) & 255) + 0.0722 * ch(int & 255)
      );
    };
    const contrast = (a, b) => {
      const [hi, lo] = luminance(a) > luminance(b) ? [a, b] : [b, a];
      return (luminance(hi) + 0.05) / (luminance(lo) + 0.05);
    };

    for (const mode of ['light', 'dark']) {
      for (const key of SERIES_KEYS.filter((k) => k !== 'other')) {
        const fill = CHART_THEME[mode].series[key];
        expect(contrast(readableInkOn(fill), fill)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});

describe('palette', () => {
  it('assigns a colour to every series slot in both modes', () => {
    for (const mode of ['light', 'dark']) {
      for (const key of SERIES_KEYS) {
        expect(CHART_THEME[mode].series[key]).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
  });

  it('keeps slot assignment stable across modes so colour follows the entity', () => {
    expect(Object.keys(CHART_THEME.light.series)).toEqual(Object.keys(CHART_THEME.dark.series));
  });
});
