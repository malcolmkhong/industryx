/**
 * ActiveEventChip — Phase 5 of the UI design review.
 *
 * One per active factory event. Renders a small pulsing Badge
 * (the chip) that opens a HoverCard with the event description,
 * its market-price effects, and the remaining time.
 *
 * Extracted from the `activeEvents.map(...)` loop in
 * DesktopHeader.tsx so the orchestrator stays a composition of
 * named pieces. Each event still uses the canonical
 * `<HoverCardSection>` (Phase 5.3 — proven for 10 other cards).
 *
 * Visual contract:
 *   - Chip: tiny outlined Badge, domain color, neon-pulse on the
 *     ticker rule. Label is `name` (or `${remaining}t` when the
 *     remaining ticks are low — keeps the chip short).
 *   - HoverCard: 256px wide, domain accent on the section header.
 *   - Effects: only `marketPriceMultiplier` effects are surfaced
 *     in the card body. Other effect types (production / power
 *     multipliers, etc.) are intentionally hidden here; the
 *     factory panel shows the full breakdown.
 */
"use client";

import { TrendingDown, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import type { GameEvent } from "@/lib/game/shared/types/notifications";
import { formatRemaining } from "@/lib/utils/time";
import { GameIcon } from "@/components/icons";
import { HoverCardSection } from "@/components/game/headers/parts/HoverCardSection";

export interface ActiveEventChipProps {
  event: GameEvent;
}

const SHORT_LABEL_THRESHOLD_TICKS = 50;

export function ActiveEventChip({ event }: ActiveEventChipProps) {
  const e = event;
  const isShort = e.remaining <= SHORT_LABEL_THRESHOLD_TICKS;
  const chipLabel = isShort ? `${e.remaining}t` : e.name;
  const ariaLabel = `Active event: ${e.name}, ${formatRemaining(e.remaining)} remaining`;

  return (
    <HoverCard openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>
        <Badge
          role="status"
          aria-label={ariaLabel}
          variant="outline"
          className="text-[10px] border-domain/50 text-domain bg-domain/20 px-1.5 py-0 neon-pulse cursor-default"
        >
          <GameIcon
            icon={e.icon}
            size={12}
            className="inline-flex"
            aria-hidden="true"
          />{" "}
          {chipLabel}
        </Badge>
      </HoverCardTrigger>
      <HoverCardContent
        side="bottom"
        className="w-64 bg-card border-domain/30 p-0 overflow-hidden"
      >
        <HoverCardSection
          title={e.name}
          accent="domain"
          icon={
            <GameIcon
              icon={e.icon}
              size={14}
              className="inline-flex"
            />
          }
        >
          <p className="text-[10px] text-subtle leading-relaxed">
            {e.description}
          </p>
          <div className="flex flex-wrap gap-1 pt-1">
            {e.effects
              .filter((ef) => ef.type === "marketPriceMultiplier")
              .map((ef) => (
                <span
                  key={ef.id}
                  className={`text-[9px] px-1 py-0.5 rounded border ${ef.value > 1 ? "border-success/40 text-success bg-success/5" : "border-danger/40 text-danger bg-danger/5"}`}
                >
                  {ef.value > 1 ? (
                    <TrendingUp className="w-2.5 h-2.5 inline mr-0.5" />
                  ) : (
                    <TrendingDown className="w-2.5 h-2.5 inline mr-0.5" />
                  )}
                  {ef.target?.slice(0, 12)}
                  {(ef.target?.length ?? 0) > 12 ? "…" : ""}{" "}
                  {ef.value > 1 ? "+" : ""}
                  {((ef.value - 1) * 100).toFixed(0)}%
                </span>
              ))}
          </div>
          <div className="flex justify-between text-[10px] pt-1 border-t border-muted-label/20">
            <span className="text-subtle">Remaining</span>
            <span className="text-warning font-mono font-bold">
              {formatRemaining(e.remaining)}
            </span>
          </div>
        </HoverCardSection>
      </HoverCardContent>
    </HoverCard>
  );
}