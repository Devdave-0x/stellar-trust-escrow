import React, { useMemo, useState } from 'react';

function smallChart(values = []) {
  const max = Math.max(...values, 1);
  const points = values.map(
    (v, i) => `${(i / (values.length - 1 || 1)) * 100},${100 - (v / max) * 100}`,
  );
  return `0,100 ${points.join(' ')} 100,100`;
}

function formatUsd(value = 0) {
  return `$${Math.round(value).toLocaleString('en-US')}`;
}

export default function ParameterSimulator({ initial = { fee: 0.5, timeout: 7 }, history = [] }) {
  const [fee, setFee] = useState(initial.fee);
  const [timeout, setTimeoutValue] = useState(initial.timeout);

  const projection = useMemo(() => {
    // simple projection: revenue = base * fee * trend
    const base = 100000;
    return Array.from({ length: 12 }).map((_, i) => base * (1 + i * 0.02) * fee);
  }, [fee]);

  return (
    <div className="parameter-simulator space-y-4">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
        Governance Parameter Simulator
      </h3>
      <div className="flex flex-col gap-6 sm:flex-row">
        <div className="flex-1 space-y-4">
          {/*
            Each range input is explicitly associated with its label and carries
            an aria-valuetext, so screen readers announce a unit rather than a
            bare number (WCAG 1.3.1 / 4.1.2).
          */}
          <div>
            <label
              htmlFor="param-platform-fee"
              className="block text-sm font-medium text-gray-800 dark:text-gray-200"
            >
              Platform fee: {fee.toFixed(2)}%
            </label>
            <input
              id="param-platform-fee"
              type="range"
              min="0"
              max="2"
              step="0.01"
              value={fee}
              aria-valuetext={`${fee.toFixed(2)} percent`}
              onChange={(e) => setFee(parseFloat(e.target.value))}
              className="mt-1 w-full accent-indigo-600 dark:accent-indigo-400"
            />
          </div>

          <div>
            <label
              htmlFor="param-dispute-timeout"
              className="block text-sm font-medium text-gray-800 dark:text-gray-200"
            >
              Dispute timeout: {timeout} days
            </label>
            <input
              id="param-dispute-timeout"
              type="range"
              min="1"
              max="30"
              step="1"
              value={timeout}
              aria-valuetext={`${timeout} ${timeout === 1 ? 'day' : 'days'}`}
              onChange={(e) => setTimeoutValue(parseInt(e.target.value, 10))}
              className="mt-1 w-full accent-indigo-600 dark:accent-indigo-400"
            />
          </div>
        </div>

        <div className="w-full sm:w-[300px]">
          {/*
            The plot is a redundant view of the figures announced below it, so it
            is hidden from assistive tech rather than given a misleading label.
          */}
          <svg
            viewBox="0 0 100 100"
            width="300"
            height="160"
            aria-hidden="true"
            focusable="false"
            className="max-w-full"
          >
            <polyline
              className="fill-indigo-100 stroke-indigo-600 dark:fill-indigo-500/20 dark:stroke-indigo-400"
              points={smallChart(projection)}
            />
          </svg>
          <div className="text-xs text-gray-700 dark:text-gray-300">
            <strong className="text-gray-900 dark:text-white">Projection</strong>
            <p>
              Estimated monthly revenue (simple model): {formatUsd(projection[0])} rising to{' '}
              {formatUsd(projection[projection.length - 1])} over 12 months.
            </p>
          </div>
        </div>
      </div>

      {/*
        A redundant echo of the two slider values, which the labels already
        announce. Hidden from assistive tech so dragging a slider does not spam
        a live region.
      */}
      <pre
        aria-hidden="true"
        className="whitespace-pre-wrap rounded-lg bg-gray-100 p-2 font-mono text-xs text-gray-800 dark:bg-gray-800 dark:text-gray-200"
      >
        {JSON.stringify({ fee, timeout }, null, 2)}
      </pre>
    </div>
  );
}
