// src/app/error.tsx
// Root error boundary — Next.js fires this when any unhandled error is thrown
// from a route segment under this layout. It replaces the failed segment with
// the error UI but keeps the parent layout(s) intact.
//
// global-error.tsx (in the same dir) only fires when the root layout itself
// crashes — that's the last-resort handler. This file is the typical "something
// broke in this page" handler.
//
// See AUDIT_FIXES_2026_06_18.md P0-#6.

'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { AlertTriangle, RefreshCw, Home, Bug } from 'lucide-react';

export default function GlobalErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log to console for dev. Production would forward to Sentry/PostHog.
    console.error('[App] Unhandled route error:', error);
  }, [error]);

  return (
    <main className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-card border border-danger/30">
          <AlertTriangle className="h-10 w-10 text-danger" aria-hidden="true" />
        </div>

        <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight mb-2">
          Something went wrong
        </h1>
        <p className="text-sm text-muted-label leading-relaxed mb-6">
          The page hit an unexpected error. Your game state is safe — try again, or head back home.
        </p>

        {error.digest && (
          <div className="mb-6 inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-card border border-muted-label/30 text-xs text-muted-label font-mono">
            <Bug className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate max-w-64" title={error.digest}>
              {error.digest}
            </span>
          </div>
        )}

        {error.message && (
          <details className="mb-6 text-left bg-card border border-muted-label/30 rounded-lg p-3">
            <summary className="text-xs text-muted-label cursor-pointer hover:text-subtle">
              Error details
            </summary>
            <pre className="mt-2 text-xs text-muted-label whitespace-pre-wrap break-all font-mono">
              {error.message}
            </pre>
          </details>
        )}

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-md bg-research/80 hover:bg-research text-white text-sm font-medium transition-colors"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Try Again
          </button>
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-md border border-muted-label/30 bg-card hover:bg-card/80 text-white text-sm font-medium transition-colors"
          >
            <Home className="h-4 w-4" aria-hidden="true" />
            Back Home
          </Link>
        </div>
      </div>
    </main>
  );
}
