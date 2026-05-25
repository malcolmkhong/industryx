'use client';

import { ReactNode } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface TooltipRow {
  label: string;
  value: string | number;
  color?: string; // tailwind text color class
}

interface GameItemTooltipProps {
  children: ReactNode;
  name: string;
  emoji?: string;
  description?: string;
  category?: string;
  tier?: number;
  details?: TooltipRow[];
  requirements?: TooltipRow[];
  side?: 'top' | 'bottom' | 'left' | 'right';
  disabled?: boolean;
}

export function GameItemTooltip({
  children,
  name,
  emoji,
  description,
  category,
  tier,
  details,
  requirements,
  side = 'top',
  disabled = false,
}: GameItemTooltipProps) {
  if (disabled) return <>{children}</>;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {children}
      </TooltipTrigger>
      <TooltipContent side={side} className="w-72 bg-[#111827] border border-cyan-900/40 shadow-[0_0_20px_rgba(0,255,242,0.1)] p-0 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-cyan-900/30 to-teal-900/20 px-3 py-2 border-b border-cyan-900/30">
          <div className="flex items-center gap-2">
            {emoji && <span className="text-lg">{emoji}</span>}
            <div>
              <p className="text-sm font-bold text-cyan-300">{name}</p>
              <div className="flex items-center gap-2 mt-0.5">
                {category && <span className="text-[10px] text-gray-400 bg-gray-800 px-1.5 py-0.5 rounded">{category}</span>}
                {tier !== undefined && tier > 0 && <span className="text-[10px] text-amber-400 bg-amber-900/30 px-1.5 py-0.5 rounded">Tier {tier}</span>}
              </div>
            </div>
          </div>
        </div>

        {/* Description */}
        {description && (
          <div className="px-3 py-2 border-b border-cyan-900/20">
            <p className="text-xs text-gray-300 leading-relaxed">{description}</p>
          </div>
        )}

        {/* Details */}
        {details && details.length > 0 && (
          <div className="px-3 py-2 border-b border-cyan-900/20">
            <p className="text-[10px] font-semibold text-cyan-400 uppercase tracking-wider mb-1.5">Details</p>
            <div className="space-y-1">
              {details.map((row, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className="text-gray-400">{row.label}</span>
                  <span className={row.color || 'text-gray-200'}>{row.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Requirements */}
        {requirements && requirements.length > 0 && (
          <div className="px-3 py-2">
            <p className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider mb-1.5">Requirements</p>
            <div className="space-y-1">
              {requirements.map((row, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className="text-gray-400">{row.label}</span>
                  <span className={row.color || 'text-gray-200'}>{row.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
