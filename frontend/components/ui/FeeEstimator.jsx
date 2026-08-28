'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw, Info, X } from 'lucide-react';
import Skeleton from './Skeleton';

const HORIZON_URL = process.env.NEXT_PUBLIC_HORIZON_URL || 'https://horizon-testnet.stellar.org';
const REFRESH_INTERVAL_MS = 60_000; // 60 seconds — refresh when user stays on the page
const STROOPS_PER_XLM = 10_000_000;

async function fetchBaseFee() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8_000);

  try {
    const response = await fetch(`${HORIZON_URL}/fee_stats`, {
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Horizon responded ${response.status}`);
    }

    const data = await response.json();
    const baseFee = parseInt(data.last_ledger_base_fee ?? data.fee_charged?.min ?? 100, 10);
    if (Number.isNaN(baseFee) || baseFee <= 0) {
      throw new Error('Invalid fee estimate from Horizon');
    }

    return baseFee;
  } finally {
    clearTimeout(timeoutId);
  }
}

function formatXlm(stroops) {
  return parseFloat((stroops / STROOPS_PER_XLM).toFixed(7)).toString();
}

function formatStroops(value) {
  return value.toLocaleString();
}

export default function FeeEstimator({ className = '' }) {
  const [stroops, setStroops] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const intervalRef = useRef(null);

  const loadFee = useCallback(async () => {
    setLoading(true);
    setHasError(false);

    try {
      const fee = await fetchBaseFee();
      setStroops(fee);
    } catch (error) {
      console.error('FeeEstimator:', error);
      setHasError(true);
      setStroops(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFee();
    intervalRef.current = setInterval(loadFee, REFRESH_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [loadFee]);

  return (
    <div
      className={`rounded-2xl border border-gray-800 bg-gray-950/80 p-4 text-sm text-gray-200 ${className}`}
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <p className="text-xs uppercase tracking-[0.24em] text-gray-500">Estimated fee</p>
            <button
              type="button"
              onClick={() => setShowInfo((prev) => !prev)}
              className="text-gray-500 hover:text-gray-300 transition"
              aria-label={showInfo ? 'Hide fee explanation' : 'What is this fee?'}
              aria-expanded={showInfo}
            >
              {showInfo ? <X size={12} /> : <Info size={12} />}
            </button>
          </div>
          {showInfo && (
            <p className="text-xs text-gray-400 max-w-xs">
              This is the current Stellar network base fee per operation, refreshed automatically
              every minute. Your wallet may add a small buffer before signing.
            </p>
          )}
          {loading ? (
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-28 rounded-md" />
              <Skeleton className="h-4 w-18 rounded-md" />
            </div>
          ) : hasError ? (
            <p className="text-amber-300">Fee unavailable — check your wallet before signing</p>
          ) : (
            <p className="text-white font-semibold tabular-nums">
              {formatXlm(stroops)} XLM{' '}
              <span className="text-gray-400 font-normal">({formatStroops(stroops)} stroops)</span>
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={loadFee}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-xs text-gray-200 transition hover:border-gray-500 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Refresh fee estimate"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>
    </div>
  );
}
