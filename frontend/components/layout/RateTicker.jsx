'use client';

/**
 * RateTicker
 *
 * Header-bar widget: "1 XLM = $0.XXX USD" with a green/red delta arrow vs
 * the previous poll. Links out to Stellar Expert market data.
 *
 * When the data source returns zero results (rate unavailable), it renders a
 * friendly, actionable empty state instead of rendering nothing, so the header
 * never goes blank without an explanation.
 */

import { useRef, useState, useEffect } from 'react';
import { useLiveXlmRate } from '../../hooks/useLiveXlmRate';

export default function RateTicker() {
  const { rate_usd, stale, loading, hasRate } = useLiveXlmRate();
  const [delta, setDelta] = useState(0); // -1, 0, 1
  const prevRateRef = useRef(null);

  useEffect(() => {
    if (rate_usd == null) return;
    if (prevRateRef.current != null) {
      if (rate_usd > prevRateRef.current) setDelta(1);
      else if (rate_usd < prevRateRef.current) setDelta(-1);
      else setDelta(0);
    }
    prevRateRef.current = rate_usd;
  }, [rate_usd]);

  if (loading) return null;

  // Friendly empty state: the rate source returned no data yet.
  if (!hasRate) {
    return (
      <a
        href="https://stellar.expert/explorer/public/asset/XLM"
        target="_blank"
        rel="noopener noreferrer"
        className="hidden sm:inline-flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 border border-gray-200 dark:border-gray-800 px-2.5 py-1 rounded-full transition-colors hover:text-gray-600 dark:hover:text-gray-300"
        title="Live XLM market rate is not available right now. View on Stellar Expert."
      >
        <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-pulse" aria-hidden="true" />
        <span>XLM rate unavailable</span>
      </a>
    );
  }

  return (
    <a
      href="https://stellar.expert/explorer/public/asset/XLM"
      target="_blank"
      rel="noopener noreferrer"
      className={`hidden sm:inline-flex items-center gap-1 text-xs font-medium ${
        stale ? 'text-gray-400' : 'text-gray-600 dark:text-gray-300'
      }`}
      title={stale ? 'Rate may be outdated' : 'View on Stellar Expert'}
    >
      <span>1 XLM = ${rate_usd.toFixed(4)} USD</span>
      {delta === 1 && <span className="text-green-500">▲</span>}
      {delta === -1 && <span className="text-red-500">▼</span>}
    </a>
  );
}