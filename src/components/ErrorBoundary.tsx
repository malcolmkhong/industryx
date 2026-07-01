'use client';

import React from 'react';
import { XCircle } from 'lucide-react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary] Caught render error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  handleClearSave = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen bg-background text-subtle flex items-center justify-center p-4">
          <div className="max-w-md w-full text-center space-y-4">
            <div className="w-16 h-16 mx-auto rounded-xl bg-danger/30 flex items-center justify-center">
              <XCircle width={32} height={32} className="text-danger" />
            </div>
            <h2 className="text-xl font-bold text-danger">Something went wrong</h2>
            <p className="text-sm text-subtle">
              The game encountered an error. Server-side save data is preserved
              across reloads — your progress is safe.
            </p>
            {this.state.error && (
              <details className="text-left text-xs text-muted-label bg-muted-label/50 rounded-lg p-3 border border-muted-label">
                <summary className="cursor-pointer text-subtle hover:text-subtle">Error details</summary>
                <pre className="mt-2 whitespace-pre-wrap break-all">{this.state.error.message}</pre>
              </details>
            )}
            <div className="flex flex-col gap-2 pt-2">
              <button
                onClick={this.handleReset}
                className="w-full px-4 py-2 rounded-lg bg-brand hover:bg-brand text-white text-sm font-medium transition-colors"
              >
                Try Again
              </button>
              <button
                onClick={this.handleClearSave}
                className="w-full px-4 py-2 rounded-lg bg-danger/30 hover:bg-danger/50 border border-danger/50 text-danger text-sm font-medium transition-colors"
              >
                Reload
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
