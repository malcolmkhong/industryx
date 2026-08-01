/**
 * ToolbarButton — Phase 2 of the UI design review.
 *
 * Uniform icon-only button used in the right-control region of the header.
 * Wraps the `Button` gh component with an opinionated focus ring, hover
 * affordance, and accessibility label. Supports an optional badge that
 * renders in the top-right corner (e.g. notification count).
 *
 * Visual contract:
 *   - h-7 w-7 ghost button with `text-subtle → text-brand` hover.
 *   - Focus ring: `focus-visible:ring-2 focus-visible:ring-brand`.
 *   - Disabled state stops both click handler and the ternary disabled
 *     prop on the underlying Button.
 *   - Optional badge: count or short text, centered in the top-right.
 *
 * Phase 1.4 (motion-safe:) is applied to the badge ring transition.
 */
"use client";

import { type ReactNode, type MouseEvent } from "react";
import { Button } from "@/components/ui/button";

export interface ToolbarButtonProps {
  /** Lucide icon (or any ReactNode) rendered inside the button. */
  icon: ReactNode;
  /** Required for screen readers. */
  ariaLabel: string;
  /** Optional click handler. Pass null to render a read-only trigger. */
  onClick?: ((e: MouseEvent<HTMLButtonElement>) => void) | null;
  /** Disabled state — disables both click and visual focus. */
  disabled?: boolean;
  /** Optional badge content (number or short string). */
  badge?: ReactNode;
  /** Optional accent color for the badge (semantic). */
  badgeClassName?: string;
  /** Additional className on the button. */
  className?: string;
}

export function ToolbarButton({
  icon,
  ariaLabel,
  onClick,
  disabled,
  badge,
  badgeClassName,
  className = "",
}: ToolbarButtonProps) {
  return (
    <Button
      variant="ghost"
      size="sm"
      aria-label={ariaLabel}
      onClick={onClick ?? undefined}
      disabled={disabled}
      className={`relative h-7 w-7 p-0 text-subtle hover:text-brand focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background ${className}`.trim()}
    >
      {icon}
      {badge != null && (
        <span
          aria-hidden="true"
          className={`absolute -top-0.5 -right-0.5 h-4 min-w-4 rounded-full text-xs text-white flex items-center justify-center px-1 motion-safe:transition-colors ${badgeClassName ?? "bg-brand"}`.trim()}
        >
          {badge}
        </span>
      )}
    </Button>
  );
}