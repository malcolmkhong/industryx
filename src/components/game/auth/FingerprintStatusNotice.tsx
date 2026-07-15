/**
 * FingerprintStatusNotice — PR 5A (plan §10, §14).
 *
 * Small inline notice rendered once after bootstrap completes when the
 * orchestrator's fingerprint status is anything other than `available`.
 * Fingerprint failure must NOT block gameplay (plan §10) — this notice
 * exists only to keep the player informed during sensitive operations.
 *
 * Behavior:
 *  - Mounts when `status` is `ok` | `unavailable` | `timeout`.
 *  - Auto-hides after 8 seconds via a setTimeout inside `useEffect`.
 *  - User-dismissable via an inline close button.
 *  - Three variants with DISTINCT, subtle colors. STD-003 forbids
 *    color-only meaning — every variant also carries an icon AND a
 *    text label.
 *  - To re-trigger with a new status, callers should remount the
 *    component (e.g., by passing a `key` tied to the variant). This
 *    keeps the effect clean of imperative setState.
 *
 * Component contract:
 *  - Receives `{ status, className }` only. No orchestrator coupling.
 *  - Returns `null` when dismissed or after auto-hide. Parent decides
 *    where to mount it; the notice is purely presentational.
 *
 * Rules honored:
 *  - UI-001: game panel location.
 *  - UI-003: shadcn Badge.
 *  - UI-004 / UI-012: <GameIcon /> only — no emoji.
 *  - UI-006: mobile-first (inline-flex wrap on small screens).
 *  - UI-009 / STD-003: icon + text + color; visible focus ring;
 *    aria-live="polite" announces appearance so SR users notice it.
 *  - UI-011: dark-mode-safe.
 *  - TS-001: no `any`.
 *  - ARC-006: <1200 LOC.
 *
 * Implementation note:
 *  - This is a client component because it owns a transient visibility
 *    flag driven by a useEffect timer. SSR is safe: useEffect is a
 *    no-op server-side, and the initial visibility is true so the
 *    notice is consistent on hydration.
 */

"use client";

import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GameIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

export type FingerprintNoticeStatus = "ok" | "unavailable" | "timeout";

export interface FingerprintStatusNoticeProps {
  /** Which fingerprint status to communicate. */
  status: FingerprintNoticeStatus;
  /** Optional layout override. */
  className?: string;
  /**
   * Optional override for the auto-hide timeout (ms). Defaults to 8000.
   * Pass `0` to disable auto-hide (test convenience).
   */
  autoHideMs?: number;
  /**
   * Test seam — fires when the notice transitions to hidden (either by
   * the user clicking close or by the auto-hide timer).
   */
  onHide?: () => void;
}

interface VariantMeta {
  label: string;
  detail: string;
  iconUi: string;
  iconColor: string;
  /** Tailwind class set for the badge background + border + text. */
  badgeClassName: string;
}

const VARIANT_META: Record<FingerprintNoticeStatus, VariantMeta> = {
  ok: {
    label: "Fingerprint active",
    detail: "Device signature captured — recovery is enabled.",
    iconUi: "production",
    iconColor: "#34d399",
    badgeClassName:
      "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
  },
  unavailable: {
    label: "Fingerprint unavailable",
    detail:
      "Browser blocked fingerprinting. Progress is saved server-side, but device recovery is limited.",
    iconUi: "info",
    iconColor: "#94a3b8",
    badgeClassName:
      "bg-slate-500/10 text-slate-300 border-slate-500/30",
  },
  timeout: {
    label: "Fingerprint timed out",
    detail:
      "Browser fingerprinting was slow. We continued bootstrap without it. Try again later from settings.",
    iconUi: "production",
    iconColor: "#fbbf24",
    badgeClassName:
      "bg-amber-500/10 text-amber-300 border-amber-500/30",
  },
};

const DEFAULT_AUTOHIDE_MS = 8000;

/**
 * Inline, non-blocking fingerprint status notice. Auto-hides after
 * `autoHideMs` (default 8s) and is dismissable via the close button.
 *
 * @example
 * <FingerprintStatusNotice status="unavailable" />
 */
export function FingerprintStatusNotice({
  status,
  className,
  autoHideMs = DEFAULT_AUTOHIDE_MS,
  onHide,
}: FingerprintStatusNoticeProps) {
  const [visible, setVisible] = useState(true);
  const meta = VARIANT_META[status];

  // Re-triggering with a new `status` is the caller's responsibility:
  // pass a `key` prop tied to the variant OR remount the component. This
  // sidesteps the React rule against setState in effect bodies while
  // keeping the public contract simple (props-only).
  useEffect(() => {
    if (!visible || autoHideMs <= 0) return undefined;
    const id = setTimeout(() => {
      setVisible(false);
      onHide?.();
    }, autoHideMs);
    return () => clearTimeout(id);
  }, [visible, autoHideMs, onHide]);

  if (!visible) return null;

  const handleDismiss = () => {
    setVisible(false);
    onHide?.();
  };

  return (
    <Badge
      data-slot="fingerprint-status-notice"
      data-status={status}
      variant="outline"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={cn(
        "inline-flex items-center gap-2 px-2.5 py-1",
        "text-[11px] sm:text-xs font-medium",
        "border backdrop-blur-sm",
        meta.badgeClassName,
        className,
      )}
    >
      <GameIcon
        ui={meta.iconUi}
        size={14}
        color={meta.iconColor}
        aria-hidden="true"
      />
      <span className="font-semibold uppercase tracking-wide">
        {meta.label}
      </span>
      <span
        aria-hidden="true"
        className="hidden sm:inline-block h-3 w-px bg-current opacity-40"
      />
      <span className="hidden sm:inline-block max-w-[28ch] truncate opacity-90">
        {meta.detail}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={handleDismiss}
        aria-label={`Dismiss ${meta.label}`}
        className={cn(
          "h-5 w-5 -mr-1 ml-0.5 rounded-sm",
          "hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-brand/40",
        )}
        data-testid="fingerprint-notice-dismiss"
      >
        <GameIcon ui="close" size={12} aria-hidden="true" />
      </Button>
    </Badge>
  );
}

export default FingerprintStatusNotice;
