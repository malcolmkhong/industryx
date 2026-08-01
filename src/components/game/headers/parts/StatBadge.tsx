/**
 * StatBadge — Phase 2 of the UI design review.
 *
 * One of the four stat triggers in the header (money, power, RP, CP).
 * Encapsulates the shared shape: `bg-card rounded-lg px-3 py-1.5 border
 * border-brand/20` + icon + value. The matching HoverCard content is
 * rendered by the consumer (data varies too much across stat types to
 * extract).
 *
 * Visual contract:
 *   - All stats share the same height (h-7), padding, and border treatment.
 *   - Icon size is fixed (14px) inside a muted-label container.
 *   - Value text is mono, semibold, color-coded by the variant prop.
 *   - The `pulse` modifier adds `motion-safe:animate-pulse` for the
 *     power overload / pending-payout states.
 *
 * Phase 1 invariant: this component uses `text-muted-label` for the icon
 * (WCAG AAA pass), `text-success` / `text-warning` / `text-danger` for
 * the value (Phase 1.2 token migration), and `motion-safe:` for all
 * animations (Phase 1.4 reduced-motion discipline).
 */
"use client";

import { type ReactNode } from "react";

export type StatBadgeVariant =
  | "neutral"
  | "success"
  | "warning"
  | "danger"
  | "premium"
  | "research";

export interface StatBadgeProps {
  /** Icon (ReactNode) already wrapped with the muted-label color. */
  icon: ReactNode;
  /** Visible value, e.g. `$1,234` or `42 RP`. */
  value: ReactNode;
  /** Semantic color for the value text. Default: subtle. */
  variant?: StatBadgeVariant;
  /** Optional modifier classNames (e.g. money-glow, warning-pulse). */
  pulseClassName?: string;
  /** Additional className on the outer wrapper. */
  className?: string;
  /** Used by aria-label when the badge is read-only (default). */
  ariaLabel?: string;
  /** Optional inline slot rendered after the value (e.g. payout button). */
  children?: ReactNode;
}

const VARIANT_VALUE: Record<StatBadgeVariant, string> = {
  neutral: "text-subtle",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  premium: "text-premium",
  research: "text-research",
};

const VALUE_TEXT_SIZE: Record<"sm" | "xs", string> = {
  sm: "text-sm",
  xs: "text-xs",
};

export function StatBadge({
  icon,
  value,
  variant = "neutral",
  pulseClassName,
  className = "",
  ariaLabel,
  valueSize = "sm",
  children,
}: StatBadgeProps & { valueSize?: "sm" | "xs" }) {
  return (
    <div
      role="status"
      aria-label={ariaLabel}
      className={`inline-flex items-center gap-1.5 bg-card rounded-lg px-3 py-1.5 border border-brand/20 cursor-default ${pulseClassName ?? ""} ${className}`.trim()}
    >
      <span className="text-muted-label inline-flex items-center gap-1">
        {icon}
      </span>
      <span
        className={`${VARIANT_VALUE[variant]} font-mono ${VALUE_TEXT_SIZE[valueSize]}`}
      >
        {value}
      </span>
      {children}
    </div>
  );
}
