'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Per RULES.md [PRF-010]: structured server logs SHOULD be structured.
  // Log the full error on mount so the boundary context is captured in
  // browser logs / sent to observability backends.
  useEffect(() => {
    console.error(
      `[GlobalError] digest=${error.digest ?? 'none'} message=${error.message}`,
      error,
    );
  }, [error]);

  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <div className="text-center space-y-4 max-w-md px-4">
          <h2 className="text-xl font-bold">Something went wrong</h2>
          <p className="text-sm text-muted-foreground">
            An unexpected error occurred. Please try again.
          </p>
          {error.digest && (
            <p className="text-xs text-muted-foreground/80 font-mono break-all">
              Error ID: {error.digest}
              <br />
              <span className="text-[10px]">
                Share this ID with support so we can investigate.
              </span>
            </p>
          )}
          <button
            type="button"
            onClick={reset}
            className="px-4 py-2 bg-primary text-primary-foreground rounded"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
