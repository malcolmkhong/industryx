import type { Building } from '@/lib/game/types';
import { formatNumber } from '@/lib/game/store';
import { GameIcon } from '@/components/game/shared/GameIcon';

export type BuildingCardVariant = 'default' | 'compact' | 'detailed';

interface BuildingCardProps {
  building: Building;
  variant?: BuildingCardVariant;
  onClick?: () => void;
  className?: string;
}

/**
 * Building info display card. Standardizes the layout used across
 * Factory, FactoryMap, Power, and Worker panels.
 */
export function BuildingCard({
  building,
  variant = 'default',
  onClick,
  className = '',
}: BuildingCardProps) {
  return (
    <div
      className={`game-card rounded-lg p-3 ${onClick ? 'cursor-pointer' : 'cursor-default'} ${className}`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <GameIcon icon={building.type as never} size={18} />
          <span className="text-sm font-semibold text-cyan-300 truncate">{building.type}</span>
        </div>
        <span className="text-[10px] text-gray-500 font-mono">
          Lv {building.level}
        </span>
      </div>
      {variant !== 'compact' && (
        <div className="mt-2 flex items-center gap-3 text-[10px] text-gray-400">
          <span>Eff: {(building.efficiency * 100).toFixed(0)}%</span>
          {building.active ? (
            <span className="text-success">Active</span>
          ) : (
            <span className="text-gray-500">Idle</span>
          )}
        </div>
      )}
      {variant === 'detailed' && (
        <div className="mt-1 text-[10px] text-gray-500 font-mono">
          Built: {formatNumber(building.buildCost ?? 0)} credits
        </div>
      )}
    </div>
  );
}
