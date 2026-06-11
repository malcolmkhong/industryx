import type { ResourceType } from '@/lib/game/types';
import { formatNumber } from '@/lib/game/store';
import { RESOURCE_META } from '@/lib/game/configCache';
import { GameIcon } from '@/components/game/shared/GameIcon';

interface ResourceBadgeProps {
  resource: ResourceType;
  amount: number;
  capacity?: number;
  showLabel?: boolean;
  showIcon?: boolean;
  className?: string;
}

/**
 * Compact resource display: icon + amount (+ optional capacity and label).
 * Use across panels where a resource amount is shown.
 */
export function ResourceBadge({
  resource,
  amount,
  capacity,
  showLabel = false,
  showIcon = true,
  className = '',
}: ResourceBadgeProps) {
  const meta = RESOURCE_META[resource as keyof typeof RESOURCE_META];
  const isOverCapacity = capacity !== undefined && amount > capacity;
  return (
    <div className={`inline-flex items-center gap-1.5 text-xs ${className}`}>
      {showIcon && (
        <span className="inline-flex items-center">
          <GameIcon icon={meta?.icon} size={14} />
        </span>
      )}
      <span className={`font-mono font-bold ${isOverCapacity ? 'text-danger' : 'text-cyan-400'}`}>
        {formatNumber(amount)}
      </span>
      {capacity !== undefined && (
        <span className="text-muted-label font-mono">/{formatNumber(capacity)}</span>
      )}
      {showLabel && (
        <span className="text-subtle">{meta?.name ?? resource}</span>
      )}
    </div>
  );
}
