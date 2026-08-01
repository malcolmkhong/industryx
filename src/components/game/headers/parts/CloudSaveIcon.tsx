/**
 * CloudSaveIcon — Phase 5 of the UI design review.
 *
 * The 4-state cloud-save icon used by the Save-to-Cloud toolbar
 * button. State → icon mapping:
 *
 *   - "saving"  → spinning Loader2 (brand)
 *   - "success" → Cloud (success)
 *   - "error"   → CloudOff (danger)
 *   - "idle"    → Cloud (default)
 *
 * The icon is intentionally an `aria-hidden` decoration. The
 * surrounding `<ToolbarButton>` carries the `Save to Cloud`
 * aria-label, so screen readers don't need a second one here.
 */
"use client";

import { Cloud, CloudOff, Loader2 } from "lucide-react";

export type CloudSaveState = "idle" | "saving" | "success" | "error";

export interface CloudSaveIconProps {
  state: CloudSaveState;
}

export function CloudSaveIcon({ state }: CloudSaveIconProps) {
  switch (state) {
    case "saving":
      return (
        <Loader2
          className="w-3.5 h-3.5 text-brand motion-safe:animate-spin"
          aria-hidden="true"
        />
      );
    case "success":
      return <Cloud className="w-3.5 h-3.5 text-success" aria-hidden="true" />;
    case "error":
      return <CloudOff className="w-3.5 h-3.5 text-danger" aria-hidden="true" />;
    case "idle":
    default:
      return <Cloud className="w-3.5 h-3.5" aria-hidden="true" />;
  }
}