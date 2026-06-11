import type { ReactNode } from 'react';

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

/**
 * Consistent empty/no-data state for panels and lists. Uses the
 * dashed-border game-card-empty treatment for visual unity.
 */
export function EmptyState({
  title,
  description,
  icon,
  action,
  className = '',
}: EmptyStateProps) {
  return (
    <div
      className={`game-card-empty rounded-lg p-6 flex flex-col items-center justify-center text-center gap-2 ${className}`}
    >
      {icon !== undefined && <div className="text-gray-500 opacity-60">{icon}</div>}
      <p className="text-sm font-semibold text-gray-400">{title}</p>
      {description !== undefined && (
        <p className="text-xs text-gray-500 max-w-xs">{description}</p>
      )}
      {action !== undefined && <div className="mt-2">{action}</div>}
    </div>
  );
}
