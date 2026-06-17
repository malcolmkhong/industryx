'use client';

interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'neutral';
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  if (!open) return null;

  const confirmStyles: Record<string, string> = {
    danger: 'bg-danger/80 hover:bg-danger/60 text-white',
    warning: 'bg-warning/70 hover:bg-warning/80 text-white',
    neutral: 'bg-background/40 hover:bg-background/30 text-white',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm cursor-default"
        onClick={onCancel}
        aria-label="Close modal"
      />
      <div className="relative bg-background/80 border border-muted-label/40 rounded-xl p-6 shadow-2xl max-w-sm w-full mx-4">
        <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
        <p className="text-sm text-muted-label mb-6">{message}</p>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-muted-label hover:text-white bg-background/60 hover:bg-background/40 rounded-lg transition-colors disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={[
              'px-4 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-50',
              confirmStyles[variant],
            ].join(' ')}
          >
            {loading ? 'Processing...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
