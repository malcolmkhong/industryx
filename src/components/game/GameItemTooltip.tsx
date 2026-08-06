"use client";

import type { ReactNode } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { GameIcon } from "@/components/icons";

interface TooltipRow {
  /** Optional stable identifier. Callers should supply this for rows that come
   *  from a known data source so React can use it as a list key. When omitted,
   *  the row index is used (the list is then assumed to be static / display-only). */
  id?: string;
  label: string;
  value: string | number;
  color?: string; // tailwind text color class or raw CSS color when isStyle is true
  isStyle?: boolean; // if true, apply color as inline style instead of className
}

interface GameItemTooltipProps {
  children: ReactNode;
  name: string;
  /** Iconify icon ID — rendered with GameIcon */
  icon?: string;
  description?: string;
  category?: string;
  tier?: number;
  details?: TooltipRow[];
  requirements?: TooltipRow[];
  side?: "top" | "bottom" | "left" | "right";
  disabled?: boolean;
}

export function GameItemTooltip({
  children,
  name,
  icon,
  description,
  category,
  tier,
  details,
  requirements,
  side = "top",
  disabled = false,
}: GameItemTooltipProps) {
  if (disabled) return <>{children}</>;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent
        side={side}
        className="w-72 bg-card border border-brand/40 shadow-[0_0_20px_rgba(0,255,242,0.1)] p-0 overflow-hidden"
      >
        {/* Header */}
        <div className="bg-linear-to-r from-brand/30 to-success/30/20 px-3 py-2 border-b border-brand/30">
          <div className="flex items-center gap-2">
            {icon ? <GameIcon icon={icon} size={20} color="#9ca3af" /> : null}
            <div>
              <p className="text-sm font-bold text-brand">{name}</p>
              <div className="flex items-center gap-2 mt-0.5">
                {category && (
                  <span className="text-[10px] text-subtle bg-muted-label px-1.5 py-0.5 rounded">
                    {category}
                  </span>
                )}
                {tier !== undefined && tier > 0 && (
                  <span className="text-[10px] text-warning bg-warning/30 px-1.5 py-0.5 rounded">
                    Tier {tier}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Description */}
        {description && (
          <div className="px-3 py-2 border-b border-brand/20">
            <p className="text-xs text-subtle leading-relaxed">{description}</p>
          </div>
        )}

        {/* Details */}
        {details && details.length > 0 && (
          <div className="px-3 py-2 border-b border-brand/20">
            <p className="text-[10px] font-semibold text-brand uppercase tracking-wider mb-1.5">
              Details
            </p>
            <div className="space-y-1">
              {details.map((row, i) => (
                <div
                  key={row.id ?? i}
                  className="flex items-center justify-between text-xs"
                >
                  <span className="text-subtle">{row.label}</span>
                  <span
                    className={
                      row.isStyle ? "text-subtle" : row.color || "text-subtle"
                    }
                    style={
                      row.isStyle && row.color
                        ? { color: row.color }
                        : undefined
                    }
                  >
                    {row.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Requirements */}
        {requirements && requirements.length > 0 && (
          <div className="px-3 py-2">
            <p className="text-[10px] font-semibold text-warning uppercase tracking-wider mb-1.5">
              Requirements
            </p>
            <div className="space-y-1">
              {requirements.map((row, i) => (
                <div
                  key={row.id ?? i}
                  className="flex items-center justify-between text-xs"
                >
                  <span className="text-subtle">{row.label}</span>
                  <span
                    className={
                      row.isStyle ? "text-subtle" : row.color || "text-subtle"
                    }
                    style={
                      row.isStyle && row.color
                        ? { color: row.color }
                        : undefined
                    }
                  >
                    {row.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
