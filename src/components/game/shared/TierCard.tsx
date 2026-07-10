'use client';

import React, { memo } from 'react';
import { Sparkles } from 'lucide-react';
import { GameIcon } from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import { formatNumber } from '@/lib/game/store';
import { ColoredProgressBar } from './ColoredProgressBar';

type TierColorKey = 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond';

const TIER_CSS_CLASS: Record<TierColorKey, string> = {
  bronze: 'text-tier-bronze',
  silver: 'text-tier-silver',
  gold: 'text-tier-gold',
  platinum: 'text-tier-platinum',
  diamond: 'text-tier-diamond',
};

function resolveColorClass(color: string): { cls: string | null; style: React.CSSProperties } {
  const key = color.toLowerCase() as TierColorKey;
  if (key in TIER_CSS_CLASS) {
    return { cls: TIER_CSS_CLASS[key], style: {} };
  }
  return { cls: null, style: { color } };
}

interface TierCardProps {
  label: string;
  name: string;
  score: number;
  color: string;
  nextLabel?: string;
  nextScore?: number;
  /** Lucide icon component */
  lucideIcon?: React.ReactNode;
  /** GameIcon icon string (game-icons:...) */
  gameIcon?: string;
  progress?: number;
  isMax?: boolean;
  iconBoxSize?: 'sm' | 'md';
}

function TierCardImpl({
  label,
  name,
  score,
  color,
  nextLabel,
  nextScore,
  lucideIcon,
  gameIcon,
  progress,
  isMax = false,
  iconBoxSize = 'md',
}: TierCardProps) {
  const { cls: colorClass, style: colorStyle } = resolveColorClass(color);

  const iconBoxClass =
    iconBoxSize === 'sm'
      ? 'w-14 h-14 rounded-xl'
      : 'w-16 h-16 rounded-xl';

  const iconSize = iconBoxSize === 'sm' ? 24 : 28;

  return (
    <div
      className="game-card rounded-xl bg-card p-4 border border-border relative overflow-hidden"
      style={{ borderColor: `${color}30` }}
    >
      {/* Background glow */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{ background: `radial-gradient(ellipse at 20% 50%, ${color}, transparent 70%)` }}
      />

      <div className="relative z-10 flex items-center gap-4">
        {/* Icon box */}
        <div
          className={`${iconBoxClass} flex flex-col items-center justify-center border shrink-0`}
          style={{
            borderColor: `${color}44`,
            backgroundColor: `${color}15`,
            boxShadow: `0 0 24px ${color}20`,
          }}
        >
          {lucideIcon && (
            <span style={colorClass ? {} : colorStyle} className={colorClass ?? ''}>
              {React.cloneElement(lucideIcon as React.ReactElement<{ className?: string; size?: number }>, { className: 'w-4 h-4' })}
            </span>
          )}
          {gameIcon && !lucideIcon && (
            <GameIcon icon={gameIcon} size={iconSize} style={colorClass ? {} : colorStyle} className={colorClass ?? ''} />
          )}
          <span
            className="text-[11px] font-bold mt-0.5"
            style={colorClass ? {} : colorStyle}
          >
            {name}
          </span>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-semibold text-subtle">{label}</h3>
            <Badge
              variant="outline"
              className="text-[9px] font-bold border"
              style={{
                borderColor: `${color}55`,
                color: colorClass ? undefined : color,
                backgroundColor: `${color}15`,
              }}
            >
              {colorClass ? <span className={colorClass}>{name}</span> : name}
            </Badge>
          </div>

          <div className="flex items-baseline gap-2 mb-2">
            <span
              className={`text-2xl font-bold font-mono ${colorClass ?? ''}`}
              style={colorClass ? {} : colorStyle}
            >
              {formatNumber(score)}
            </span>
            <span className="text-[10px] text-muted-label">pts</span>
          </div>

          {/* Progress to next */}
          {!isMax && nextLabel !== undefined && nextScore !== undefined && progress !== undefined ? (
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-muted-label">Next: {nextLabel}</span>
                <span
                  className={`text-[10px] font-mono ${colorClass ?? ''}`}
                  style={colorClass ? {} : colorStyle}
                >
                  {formatNumber(nextScore - score)} pts
                </span>
              </div>
              <ColoredProgressBar value={progress} color={color} />
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span
                className={`text-xs font-bold ${colorClass ?? ''}`}
                style={colorClass ? {} : colorStyle}
              >
                MAX ACHIEVED
              </span>
              <Sparkles
                className="w-3.5 h-3.5"
                style={colorClass ? {} : colorStyle}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export const TierCard = memo(TierCardImpl);
TierCard.displayName = 'TierCard';
