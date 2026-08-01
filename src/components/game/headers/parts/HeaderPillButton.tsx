/**
 * HeaderPillButton — Phase 5 of the UI design review.
 *
 * A pill-style header button used for the "Sign In" / "Bind Account"
 * actions. Same shape, two labels. The pill border uses
 * `border-brand/30` so it stands out from the icon-only Toolbar
 * buttons but stays in the same visual family.
 *
 * Phase 1.4: every transition / interactive state is gated on
 * `motion-safe:` so the pill honors prefers-reduced-motion.
 */
"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

export interface HeaderPillButtonProps {
  /** Icon to render before the label (e.g. lucide <LogIn>). */
  icon?: ReactNode;
  /** Visible label. Short, one or two words. */
  label: string;
  onClick: () => void;
  /** Optional aria-label override. Defaults to the visible label. */
  ariaLabel?: string;
}

export function HeaderPillButton({
  icon,
  label,
  onClick,
  ariaLabel,
}: HeaderPillButtonProps) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 px-3 text-xs text-brand hover:text-brand border border-brand/30 hover:border-brand/40 hover:bg-brand/10 rounded-lg focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      onClick={onClick}
      aria-label={ariaLabel ?? label}
    >
      {icon}
      {icon ? <> {label}</> : label}
    </Button>
  );
}