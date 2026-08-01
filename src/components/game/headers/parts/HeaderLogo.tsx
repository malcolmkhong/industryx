/**
 * HeaderLogo — Phase 5.2 of the UI design review.
 *
 * The BrandLogo + INDUSTRIAX text + HoverCard detail block. Extracted
 * from DesktopHeader so the orchestrator can simply render
 * `<HeaderLogo />` at the top of the bar.
 *
 * The HoverCard content is keyed off the same stores the header uses,
 * so the props are passed in directly rather than re-sourcing.
 */
"use client";

import { type ReactNode } from "react";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { BrandLogo, GameIcon } from "@/components/icons";

export interface HeaderLogoProps {
  buildingsCount: number;
  gameTick: number;
  corporationPoints: number;
  userName: string;
  /** Optional extra children rendered inside the HoverCard body grid. */
  children?: ReactNode;
}

export function HeaderLogo({
  buildingsCount,
  gameTick,
  corporationPoints,
  userName,
  children,
}: HeaderLogoProps) {
  return (
    <HoverCard openDelay={300} closeDelay={100}>
      <HoverCardTrigger asChild>
        <div
          className="flex items-center gap-2.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded-lg"
          tabIndex={0}
        >
          <BrandLogo size="md" />
          <div>
            <h1 className="text-sm font-bold text-brand neon-glow-cyan tracking-wider">
              INDUSTRIAX
            </h1>
            <p className="text-[10px] text-subtle -mt-0.5">Factory Dominion</p>
          </div>
        </div>
      </HoverCardTrigger>
      <HoverCardContent
        side="bottom"
        align="start"
        className="w-80 bg-card border-brand/30 p-0 overflow-hidden"
      >
        <div className="bg-linear-to-r from-brand/20 to-success/20 px-3 py-2 border-b border-brand/20">
          <p className="text-xs font-bold text-brand inline-flex items-center gap-1.5">
            <GameIcon ui="money" size={14} className="inline-flex" /> INDUSTRIAX
          </p>
          <p className="text-[10px] text-subtle mt-0.5">
            Factory Dominion — v1.0
          </p>
        </div>
        <div className="px-3 py-2 space-y-2">
          <p className="text-[11px] text-subtle leading-relaxed">
            A resource-management idle empire. Build extractors, process
            materials, research tech, and expand into megaprojects across 5
            tiers.
          </p>
          <div className="grid grid-cols-2 gap-1.5 pt-1.5 border-t border-muted-label/20">
            <Stat label="Total Buildings" value={buildingsCount} />
            <Stat label="Time" value={gameTick.toLocaleString()} />
            <Stat
              label="Prestige Points"
              value={`${corporationPoints} CP`}
              valueClassName="text-premium"
            />
            <Stat label="Player" value={userName} truncate />
          </div>
          {children}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

function Stat({
  label,
  value,
  valueClassName = "text-subtle",
  truncate = false,
}: {
  label: string;
  value: ReactNode;
  valueClassName?: string;
  truncate?: boolean;
}) {
  return (
    <div className="text-[10px]">
      <div className="text-muted-label">{label}</div>
      <div
        className={`${valueClassName} font-mono font-semibold ${truncate ? "truncate" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}