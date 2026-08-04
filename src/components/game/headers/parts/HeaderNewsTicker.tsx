/**
 * HeaderNewsTicker — Phase 5.2 of the UI design review.
 *
 * The bottom row of the desktop header. Rotates through the top 3
 * notifications every `UI_CONFIG.headlineRotationMs` milliseconds
 * (Phase 1.8 a11y fix: aria-live="polite" + role="region").
 *
 * Empty state: a characterful welcome message (Phase 4.1) instead
 * of the generic "Welcome to IndustriaX!" prompt.
 */
"use client";

import { Newspaper } from "lucide-react";
import { useEffect, useState } from "react";
import { UI_CONFIG } from "@/lib/config/uiConfig";
import type { GameNotification } from "@/lib/game/shared/types/notifications";

const WELCOME_MESSAGE =
  "Commander, your factory awaits. Deploy your first Mining Drill to begin operations.";

export interface HeaderNewsTickerProps {
  notifications: GameNotification[];
}

export function HeaderNewsTicker({ notifications }: HeaderNewsTickerProps) {
  const topHeadlines = notifications.slice(0, 3);
  const [headlineIndex, setHeadlineIndex] = useState(0);
  const displayedIndex =
    topHeadlines.length > 0
      ? Math.min(headlineIndex, topHeadlines.length - 1)
      : 0;

  useEffect(() => {
    if (topHeadlines.length < 2) return undefined;
    const t = setInterval(
      () => setHeadlineIndex((i) => (i + 1) % topHeadlines.length),
      UI_CONFIG.headlineRotationMs,
    );
    return () => clearInterval(t);
  }, [topHeadlines.length]);

  const active = topHeadlines[displayedIndex];

  return (
    <div
      className="hidden lg:flex items-center h-6 px-3 gap-2 bg-background border-t border-brand/20"
      role="region"
      aria-label="Live news feed"
    >
      <Newspaper className="w-3 h-3 text-brand shrink-0" aria-hidden="true" />
      <span className="text-[10px] text-brand font-bold shrink-0">NEWS</span>
      <ul
        className="flex-1 overflow-hidden"
        aria-live="polite"
        aria-atomic="true"
      >
        {active ? (
          <li key={active.id} className="text-xs text-subtle truncate">
            {active.message}
          </li>
        ) : (
          <li className="text-xs text-subtle italic truncate">
            {WELCOME_MESSAGE}
          </li>
        )}
      </ul>
      {topHeadlines.length > 1 && (
        <span className="text-[9px] text-subtle shrink-0">
          {displayedIndex + 1}/{topHeadlines.length}
        </span>
      )}
    </div>
  );
}
