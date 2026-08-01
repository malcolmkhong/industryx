/**
 * PowerEfficiencyCard — Phase 5 of the UI design review.
 *
 * The factory-efficiency HoverCard attached to the Power StatBadge.
 * Renders a small status dot (the trigger) and a HoverCard that
 * shows the efficiency percentage, the production/consumption
 * balance, and the capacity utilization.
 *
 * The header is tier-tinted: success ≥ 80%, warning ≥ 50%, danger
 * below. This card does NOT use the canonical
 * `<HoverCardSection>` because the header has a flat solid
 * background (not a gradient) and a fixed-status title, both of
 * which are intentional visual cues for the factory health state.
 *
 * Extracted from DesktopHeader.tsx so the orchestrator can read:
 *   <PowerEfficiencyCard
 *     factoryEfficiency={factoryEfficiency}
 *     buildings={buildings}
 *     totalProduction={powerGrid.totalProduction}
 *     totalConsumption={powerGrid.totalConsumption}
 *     powerPercent={powerPercent}
 *   />
 */
"use client";

import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import type { BuildingInstance } from "@/lib/game/shared/types/buildings";
import { formatNumber } from "@/lib/game/shared/utils/formatNumber";

/** Tier cutoffs for the efficiency rating (0-1 scale). */
const EFFICIENCY_SUCCESS = 0.8;
const EFFICIENCY_WARNING = 0.5;

export type EfficiencyTier = "success" | "warning" | "danger";

export function tierFor(efficiency: number): EfficiencyTier {
  if (efficiency >= EFFICIENCY_SUCCESS) return "success";
  if (efficiency >= EFFICIENCY_WARNING) return "warning";
  return "danger";
}

export interface PowerEfficiencyCardProps {
  /** 0-1 normalized factory efficiency. */
  factoryEfficiency: number;
  /** Active building instances — only `.active` count toward the pulse. */
  buildings: readonly BuildingInstance[];
  /** Sum of power plant production, in MW. */
  totalProduction: number;
  /** Sum of building consumption, in MW. */
  totalConsumption: number;
  /** Total capacity utilization, 0-100. */
  powerPercent: number;
}

const TIER_HEADER_BG: Record<EfficiencyTier, string> = {
  success: "bg-success/20",
  warning: "bg-warning/20",
  danger: "bg-danger/20",
};

const TIER_TEXT: Record<EfficiencyTier, string> = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
};

const TIER_DOT_GLOW: Record<EfficiencyTier, string> = {
  success: "bg-success shadow-[0_0_6px_rgba(74,222,128,0.6)]",
  warning: "bg-warning shadow-[0_0_6px_rgba(250,204,21,0.6)]",
  danger: "bg-danger shadow-[0_0_6px_rgba(248,113,113,0.6)]",
};

const TIER_STATUS_LABEL: Record<EfficiencyTier, string> = {
  success: "Running smoothly",
  warning: "Needs attention",
  danger: "Critical",
};

const TIER_ARIA_LABEL: Record<EfficiencyTier, string> = {
  success: "running smoothly",
  warning: "needs attention",
  danger: "critical",
};

export function PowerEfficiencyCard({
  factoryEfficiency,
  buildings,
  totalProduction,
  totalConsumption,
  powerPercent,
}: PowerEfficiencyCardProps) {
  const tier = tierFor(factoryEfficiency);
  const efficiencyPct = (factoryEfficiency * 100).toFixed(0);
  const hasActiveBuildings = buildings.some((b) => b.active);

  return (
    <HoverCard openDelay={150} closeDelay={100}>
      <HoverCardTrigger asChild>
        <span
          role="status"
          aria-label={`Factory efficiency ${efficiencyPct}% — ${TIER_ARIA_LABEL[tier]}`}
          className={`ml-1.5 inline-block w-2 h-2 rounded-full cursor-default ${TIER_DOT_GLOW[tier]} ${
            hasActiveBuildings ? "motion-safe:animate-pulse" : ""
          }`}
        />
      </HoverCardTrigger>
      <HoverCardContent
        side="bottom"
        className="w-72 bg-card border-brand/30 p-0 overflow-hidden"
      >
        <div
          className={`px-3 py-2 border-b border-brand/20 ${TIER_HEADER_BG[tier]}`}
        >
          <p className={`text-xs font-bold ${TIER_TEXT[tier]}`}>
            Factory Efficiency: {efficiencyPct}%
          </p>
        </div>
        <div className="px-3 py-2 space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-subtle">Status</span>
            <span className="font-mono text-subtle">
              {TIER_STATUS_LABEL[tier]}
            </span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-subtle">Production</span>
            <span className="text-success font-mono">
              {formatNumber(totalProduction)} MW
            </span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-subtle">Consumption</span>
            <span className="text-warning font-mono">
              {formatNumber(totalConsumption)} MW
            </span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-subtle">Capacity</span>
            <span className="text-brand font-mono">
              {powerPercent.toFixed(0)}%
            </span>
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}