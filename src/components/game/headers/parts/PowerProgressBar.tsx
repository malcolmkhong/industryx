/**
 * PowerProgressBar — Phase 5 of the UI design review.
 *
 * A 96px × 8px fill bar that surfaces factory power utilization
 * at a glance, color-coded by tier (success ≥ 80%, warning ≥ 50%,
 * danger below).
 *
 * Extracted from the right-controls region in DesktopHeader.tsx
 * so the orchestrator can read the bar in a single line:
 *   <PowerProgressBar percent={powerPercent} />
 */
"use client";

export interface PowerProgressBarProps {
  percent: number;
}

/**
 * Tier thresholds (in percent).
 *
 * Locked to the same constants the legacy factory telemetry used;
 * the right-controls HUD is the player-facing mirror of the power
 * panel, so the two must agree on the cutoff colors.
 */
const SUCCESS_THRESHOLD = 80;
const WARNING_THRESHOLD = 50;

function tierClass(percent: number): string {
  if (percent >= SUCCESS_THRESHOLD) return "bg-success";
  if (percent >= WARNING_THRESHOLD) return "bg-warning";
  return "bg-danger";
}

export function PowerProgressBar({ percent }: PowerProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div className="w-24 h-2 bg-muted-label rounded-full overflow-hidden">
      <div
        className={`h-full motion-safe:transition-all duration-500 ${tierClass(clamped)}`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}