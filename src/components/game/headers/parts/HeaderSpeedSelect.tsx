/**
 * HeaderSpeedSelect — Phase 5 of the UI design review.
 *
 * The 4-button segmented control for game speed (1x / 2x / 5x /
 * 10x). One selected button highlights in brand color, the
 * rest are muted. The pause button was removed in C-009 (see
 * BUG-086) so this is now a 4-option selector.
 *
 * Extracted from the right-controls region in DesktopHeader.tsx
 * so the orchestrator can read it in a single line:
 *   <HeaderSpeedSelect
 *     options={SPEED_OPTIONS}
 *     value={gameSpeed}
 *     onChange={setGameSpeed}
 *   />
 */
"use client";

import { Button } from "@/components/ui/button";

export interface HeaderSpeedSelectProps<T extends number> {
  /** Available speed values, e.g. `[1, 2, 5, 10] as const`. */
  options: readonly T[];
  /** Currently active speed. */
  value: T;
  /** Called when the player picks a different speed. */
  onChange: (next: T) => void;
}

export function HeaderSpeedSelect<T extends number>({
  options,
  value,
  onChange,
}: HeaderSpeedSelectProps<T>) {
  return (
    <div className="flex items-center bg-card rounded-lg border border-brand/20 overflow-hidden">
      {options.map((speed) => {
        const isActive = value === speed;
        return (
          <Button
            key={speed}
            variant="ghost"
            size="sm"
            className={`h-7 px-2 text-xs focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
              isActive
                ? "text-brand bg-brand/20"
                : "text-muted-label hover:text-brand"
            }`}
            onClick={() => onChange(speed)}
            aria-label={`Set game speed to ${speed}x`}
            aria-pressed={isActive}
          >
            {speed}x
          </Button>
        );
      })}
    </div>
  );
}