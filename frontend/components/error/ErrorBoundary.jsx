'use client';

import { Component } from 'react';
import * as Sentry from '@sentry/nextjs';
import Button from '../ui/Button';
import Link from 'next/link';

const REPORT_URL = 'https://github.com/stellar-trust-escrow/issues/new';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught error:', error, errorInfo);

    Sentry.withScope((scope) => {
      scope.setExtras({ componentStack: errorInfo.componentStack });
      Sentry.captureException(error);
    });

    this.setState({ errorInfo });

    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const { fallback } = this.props;
    if (fallback) return fallback;

    return this.renderFallback();
  }

  renderFallback() {
    const errorMsg = this.state.error?.message || '';
    const reportBody = encodeURIComponent(
      `**Error:** ${errorMsg}\n\n**Stack:**\n${this.state.errorInfo?.componentStack || ''}`,
    );
    const reportUrl = `${REPORT_URL}?title=${encodeURIComponent('UI Error: ' + errorMsg.slice(0, 80))}&body=${reportBody}`;

    return (
      <div className="min-h-[200px] flex items-center justify-center p-8" role="alert" aria-live="assertive">
        <div className="text-center space-y-4 max-w-md mx-auto">
          <div className="w-16 h-16 bg-red-500/10 border-2 border-red-500/20 rounded-2xl flex items-center justify-center mx-auto">
            <span className="text-2xl" aria-hidden="true">⚠️</span>
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-white">Something went wrong</h2>
            <p className="text-gray-400 text-sm leading-relaxed">
              This section encountered an unexpected error. Other parts of the page are unaffected.
            </p>
            {errorMsg && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-xs text-red-300 text-left">
                <code className="font-mono break-all">
                  {errorMsg.length > 120 ? `${errorMsg.slice(0, 120)}…` : errorMsg}
                </code>
              </div>
            )}
          </div>
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            <Button onClick={this.handleRetry} className="w-full sm:w-auto">
              Retry
            </Button>
            <a
              href={reportUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-1 px-4 py-2 text-sm rounded-lg border border-gray-700 text-gray-400 hover:text-white hover:border-gray-600 transition-colors w-full sm:w-auto"
            >
              Report issue ↗
            </a>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
