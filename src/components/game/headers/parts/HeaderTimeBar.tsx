/**
 * HeaderTimeBar — Phase 5 of the UI design review.
 *
 * The center "Time" pill in the header. Renders the current
 * in-game time and opens a HoverCard with the same time, the
 * playtime, and the current game speed.
 *
 * Extracted from DesktopHeader.tsx so the orchestrator can read
 * the time indicator in a single line:
 *   <HeaderTimeBar
 *     gameTick={gameTick}
 *     tickFormat={tickFormat}
 *     gameSpeed={gameSpeed}
 *   />
 *
 * C-009 note: the "paused" status row was removed — see BUG-086.
 * The "Game Speed" row remains, but it shows the live speed only.
 */
"use client";

import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { HoverCardSection } from "@/components/game/headers/parts/HoverCardSection";
import {
  formatByMode,
  formatDuration,
  type TickFormat,
} from "@/lib/utils/time";

export interface HeaderTimeBarProps {
  gameTick: number;
  tickFormat: TickFormat;
  gameSpeed: number;
}

export function HeaderTimeBar({
  gameTick,
  tickFormat,
  gameSpeed,
}: HeaderTimeBarProps) {
  return (
    <HoverCard openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>
        <div className="text-[10px] text-subtle font-mono cursor-default hover:text-brand motion-safe:transition-colors">
          Time: {formatByMode(gameTick, tickFormat)}
        </div>
      </HoverCardTrigger>
      <HoverCardContent
        side="bottom"
        className="w-64 bg-card border-brand/30 p-0 overflow-hidden"
      >
        <HoverCardSection title="Time" accent="brand">
          <div className="flex justify-between text-[10px]">
            <span className="text-subtle">Current</span>
            <span className="text-brand font-mono font-bold">
              {formatByMode(gameTick, tickFormat)}
            </span>
          </div>
          <div className="flex justify-between text-[10px]">
            <span className="text-subtle">Playtime</span>
            <span className="text-brand font-mono">
              {formatDuration(gameTick)}
            </span>
          </div>
          <div className="flex justify-between text-[10px]">
            <span className="text-subtle">Game Speed</span>
            <span className="text-success font-mono">{gameSpeed}x</span>
          </div>
          {/* C-009: paused status removed — see BUG-086. */}
          <p className="text-[10px] text-muted-label pt-1 border-t border-muted-label/20 leading-relaxed">
            Each tick advances all building production, consumption, and event
            timers. Higher speed = more ticks per second.
          </p>
        </HoverCardSection>
      </HoverCardContent>
    </HoverCard>
  );
}
