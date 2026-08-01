/**
 * HoverCardSection — Phase 2 of the UI design review.
 *
 * The standard header/body wrapper used inside every HoverCardContent in
 * DesktopHeader. Extracted to (a) share the `bg-linear-to-r` gradient
 * styling uniformly, (b) lock padding to `px-3 py-2` (Phase 1.1), and
 * (c) support a single canonical header gradient that varies only by
 * accent color.
 *
 * Visual contract:
 *   - Header: `px-3 py-2 border-b` with a one-sided gradient.
 *   - Body: `px-3 py-2 space-y-1.5` with consistent vertical rhythm.
 *   - The accent prop drives the title color (default: brand).
 *
 * All transitions honor `prefers-reduced-motion` via `motion-safe:`
 * (Phase 1.4) — though this component itself doesn't animate.
 */
"use client";

import { type ReactNode } from "react";

export type HoverCardAccent =
  | "brand"
  | "success"
  | "warning"
  | "danger"
  | "danger-soft"
  | "domain"
  | "research"
  | "premium";

const ACCENT_HEADER_TEXT: Record<HoverCardAccent, string> = {
  brand: "text-brand",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  "danger-soft": "text-danger",
  domain: "text-domain",
  research: "text-research",
  premium: "text-premium",
};

const ACCENT_HEADER_GRADIENT: Record<HoverCardAccent, string> = {
  brand: "from-brand/20 to-research/10",
  success: "from-success/20 to-brand/10",
  warning: "from-warning/20 to-domain/10",
  danger: "from-danger/20 to-warning/10",
  "danger-soft": "from-rose/20 to-warning/10",
  domain: "from-domain/20 to-warning/10",
  research: "from-research/20 to-brand/10",
  premium: "from-premium/20 to-domain/10",
};

const ACCENT_HEADER_BORDER: Record<HoverCardAccent, string> = {
  brand: "border-brand/20",
  success: "border-success/20",
  warning: "border-warning/20",
  danger: "border-danger/20",
  "danger-soft": "border-rose/20",
  domain: "border-domain/20",
  research: "border-research/20",
  premium: "border-premium/20",
};

export interface HoverCardSectionProps {
  title: ReactNode;
  accent?: HoverCardAccent;
  icon?: ReactNode;
  children: ReactNode;
}

export function HoverCardSection({
  title,
  accent = "brand",
  icon,
  children,
}: HoverCardSectionProps) {
  return (
    <>
      <div
        className={`bg-linear-to-r ${ACCENT_HEADER_GRADIENT[accent]} px-3 py-2 border-b ${ACCENT_HEADER_BORDER[accent]}`}
      >
        <p
          className={`text-xs font-bold inline-flex items-center gap-1.5 ${ACCENT_HEADER_TEXT[accent]}`}
        >
          {icon}
          {title}
        </p>
      </div>
      <div className="px-3 py-2 space-y-1.5">{children}</div>
    </>
  );
}