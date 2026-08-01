/**
 * FactoryStatusBadge — Phase 5.2 / Phase 4.3 of the UI design review.
 *
 * The contextual "Operational / Watch / Critical" badge next to the
 * header logo. Reads the factory state (power overload, efficiency)
 * and renders one of three states with semantic colors.
 *
 * Phase 1.2 (no hardcoded hex), 1.4 (motion-safe via CSS), and 1.5
 * (on-scale `text-[10px]`) invariants are baked in.
 *
 * Phase 4 brought this in. Phase 5 extracted it to its own file so
 * the main `DesktopHeader.tsx` reads as a composition of named parts.
 */
"use client";

import { Badge } from "@/components/ui/badge";

export type FactoryHealthState = "operational" | "watch" | "critical";

const STATE_LABEL: Record<FactoryHealthState, string> = {
  operational: "Operational",
  watch: "Watch",
  critical: "Critical",
};

const STATE_BORDER: Record<FactoryHealthState, string> = {
  operational: "border-success/50",
  watch: "border-warning/50",
  critical: "border-danger/50",
};

const STATE_TEXT: Record<FactoryHealthState, string> = {
  operational: "text-success",
  watch: "text-warning",
  critical: "text-danger",
};

const STATE_BG: Record<FactoryHealthState, string> = {
  operational: "bg-success/10",
  watch: "bg-warning/10",
  critical: "bg-danger/10",
};

export function deriveFactoryHealth(
  powerOverload: boolean,
  efficiency: number,
): FactoryHealthState {
  if (powerOverload) return "critical";
  if (efficiency >= 0.8) return "operational";
  if (efficiency >= 0.5) return "watch";
  return "critical";
}

export interface FactoryStatusBadgeProps {
  state: FactoryHealthState;
}

export function FactoryStatusBadge({ state }: FactoryStatusBadgeProps) {
  const label = STATE_LABEL[state];
  return (
    <Badge
      role="status"
      aria-label={`Factory status: ${label}`}
      variant="outline"
      className={`text-[10px] px-2 py-0 cursor-default ${STATE_BORDER[state]} ${STATE_TEXT[state]} ${STATE_BG[state]}`}
    >
      {label}
    </Badge>
  );
}