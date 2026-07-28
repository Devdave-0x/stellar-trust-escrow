'use client';

/**
 * SectionErrorBoundary — compact error boundary for widget/card-level UI
 * (e.g. a single dashboard tile or table), as opposed to the full-page
 * fallback in components/error/ErrorBoundary. Keeps the rest of the page
 * usable when one section fails.
 *
 * Accessible: the fallback is announced via role="alert", and the retry
 * button receives focus so keyboard/screen-reader users land on it directly.
 *
 * @param {object}   props
 * @param {string}   [props.title='This section failed to load']
 * @param {Function} [props.onRetry]     — called in addition to internal reset
 * @param {*}        [props.resetKey]    — changing this remounts children after a retry
 * @param {string}   [props.className]
 */

import { Component, createRef } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { cn } from '../../lib/utils';

export default class SectionErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
    this.retryRef = createRef();
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('SectionErrorBoundary caught an error:', error, info);
    if (this.props.onError) this.props.onError(error, info);
  }

  componentDidUpdate(prevProps) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, error: null });
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onRetry) this.props.onRetry();
  };

  render() {
    const { title = 'This section failed to load', className, children } = this.props;

    if (!this.state.hasError) {
      return children;
    }

    return (
      <div
        role="alert"
        aria-live="polite"
        className={cn(
          'flex flex-col items-center gap-3 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/20 p-6 text-center',
          className,
        )}
      >
        <AlertTriangle className="h-6 w-6 text-red-500 dark:text-red-400" aria-hidden="true" />
        <div>
          <p className="font-medium text-gray-900 dark:text-white">{title}</p>
          {this.state.error?.message && (
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 break-all">
              {this.state.error.message}
            </p>
          )}
        </div>
        <button
          ref={this.retryRef}
          type="button"
          onClick={this.handleRetry}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          Retry
        </button>
      </div>
    );
  }
}
