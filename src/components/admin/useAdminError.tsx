'use client';

import { useState, useCallback } from 'react';

interface AdminError {
  message: string;
  detail?: string;
  timestamp: number;
}

export function useAdminError() {
  const [error, setError] = useState<AdminError | null>(null);

  const showError = useCallback((message: string, detail?: string) => {
    setError({ message, detail, timestamp: Date.now() });
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const handleApiError = useCallback((err: unknown, fallback: string) => {
    const message = err instanceof Error ? err.message : fallback;
    showError(message, err instanceof Error ? err.stack : undefined);
  }, [showError]);

  return { error, showError, clearError, handleApiError };
}

export function AdminErrorBanner({
  error,
  onDismiss,
}: {
  error: { message: string; detail?: string } | null;
  onDismiss: () => void;
}) {
  if (!error) return null;

  return (
    <div className="mb-4 p-3 rounded-xl border border-danger/20 bg-danger/5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-danger">{error.message}</p>
          {error.detail && (
            <p className="text-xs text-danger/60 mt-1 font-mono truncate max-w-lg">{error.detail}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="text-danger/60 hover:text-danger shrink-0"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
