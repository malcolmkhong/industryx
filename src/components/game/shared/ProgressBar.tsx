export type ProgressBarVariant = 'success' | 'warning' | 'danger' | 'primary' | 'default';

interface ProgressBarProps {
  value: number;
  max?: number;
  variant?: ProgressBarVariant;
  showLabel?: boolean;
  shimmer?: boolean;
  className?: string;
  ariaLabel?: string;
}

const VARIANT_BG: Record<ProgressBarVariant, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  primary: 'bg-cyan-500',
  default: 'bg-cyan-500',
};

const SIZE_CLASS = 'h-2';

/**
 * Horizontal progress bar with optional label and shimmer overlay.
 * Used for power load, capacity fill, research progress, and more.
 * Width is calculated as a percentage of `max` (defaults to 100).
 */
export function ProgressBar({
  value,
  max = 100,
  variant = 'default',
  showLabel = false,
  shimmer = false,
  className = '',
  ariaLabel,
}: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(value, max));
  const percent = max > 0 ? (clamped / max) * 100 : 0;
  const fillClass = VARIANT_BG[variant];
  return (
    <div
      className={`relative w-full ${SIZE_CLASS} bg-muted-label rounded-full overflow-hidden ${shimmer ? 'progress-bar-shimmer' : ''} ${className}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={clamped}
      aria-label={ariaLabel}
    >
      <div
        className={`h-full transition-all duration-500 ${fillClass}`}
        style={{ width: `${percent}%` }}
      />
      {showLabel && (
        <span className="absolute inset-0 flex items-center justify-center text-[9px] font-mono text-subtle">
          {Math.round(percent)}%
        </span>
      )}
    </div>
  );
}
