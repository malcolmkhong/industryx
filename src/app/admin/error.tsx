'use client';

import { useEffect } from 'react';

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[Admin] Unhandled error:', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="bg-background/80/80 backdrop-blur-xl border border-muted-label/40 rounded-2xl p-8 shadow-2xl max-w-md w-full text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 mb-4 rounded-xl bg-danger/10">
          <svg
            className="w-7 h-7 text-danger"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
            />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-white mb-2">
          Something went wrong
        </h2>
        <p className="text-sm text-muted-label mb-6">
          An unexpected error occurred in the admin panel. Try again.
        </p>
        <button
          type="button"
          onClick={reset}
          className="px-4 py-2 bg-background/60 hover:bg-background/40 text-white text-sm font-medium rounded-lg transition-colors"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
