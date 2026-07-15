/**
 * BootstrapConflictScreen — PR 5A (plan §6, §12, §14, §15).
 *
 * Full-screen, server-component-safe presentation component rendered when
 * the orchestrator enters the `conflict` state with one of two reasons:
 *
 *  - DEVICE_BOUND_TO_OTHER_USER
 *      The browser already has an active device binding to a different
 *      account or non-upgradeable guest. Resolution requires explicit
 *      user choice — switch account, sign out & retry as guest, or
 *      contact support.
 *
 *  - ACCOUNT_PROGRESS_CONFLICT
 *      The authenticated account and the active guest binding both
 *      contain progress. Auto-merge is forbidden by plan §6; the user
 *      must choose which progress to keep.
 *
 * Rules honored:
 *  - UI-001: game panel lives in `src/components/game/auth/`.
 *  - UI-003: shadcn Button + Card.
 *  - UI-004: warning glyph via <GameIcon /> (UI-012: no emoji).
 *  - UI-006: mobile-first; stacked CTAs.
 *  - UI-009 / STD-003: two distinct copy blocks per reason; conflict
 *    payload (survivingUserId, archivedGuestId) is shown as monospaced
 *    metadata with sr-only labels. Icon + heading convey tone without
 *    relying on color alone.
 *  - UI-011: dark-mode-safe palette.
 *  - ARC-006: <1200 LOC, single responsibility.
 *
 * Decoupled from `@/lib/auth/orchestrator` — receives props only.
 */

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { GameIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

export type BootstrapConflictReason =
  | "DEVICE_BOUND_TO_OTHER_USER"
  | "ACCOUNT_PROGRESS_CONFLICT";

export interface BootstrapConflictScreenProps {
  /** Which plan §12 conflict case applies. */
  reason: BootstrapConflictReason;
  /**
   * The surviving user id returned by the server for the conflict. Shown
   * for ACCOUNT_PROGRESS_CONFLICT so the user knows which account the
   * authenticated session will resolve to. `null` means the server
   * could not identify a survivor (typical for DEVICE_BOUND_TO_OTHER_USER).
   */
  survivingUserId?: string | null;
  /** Archived guest id, when the server promoted the active guest. */
  archivedGuestId?: string | null;
  /** Primary CTA — controlled server continuation / sign-out retry. */
  onResolve: () => void;
  /** Optional CTA label override (AuthProvider may localize). */
  resolveLabel?: string;
  /** Optional layout override class names. */
  className?: string;
}

interface ReasonMeta {
  title: string;
  headline: string;
  body: string;
  bullets: ReadonlyArray<string>;
  resolveLabelDefault: string;
}

const REASON_META: Record<BootstrapConflictReason, ReasonMeta> = {
  DEVICE_BOUND_TO_OTHER_USER: {
    title: "Device already in use",
    headline:
      "This browser is bound to a different account.",
    body:
      "We detected an existing device binding that does not match the " +
      "account you are trying to use. To protect ownership, IndustriaX " +
      "never silently overrides a binding.",
    bullets: [
      "Sign in with the account that originally owns this device, or",
      "Sign out and continue as a guest on this device, or",
      "Contact support if neither option applies.",
    ],
    resolveLabelDefault: "Switch account",
  },
  ACCOUNT_PROGRESS_CONFLICT: {
    title: "Account progress conflict",
    headline:
      "Your account and this device already have saved progress.",
    body:
      "Your authenticated account and the active guest binding on this " +
      "device both contain gameplay progress. IndustriaX never auto-merges " +
      "progress — choose how to resolve before continuing.",
    bullets: [
      "Keep your authenticated account's progress and archive the guest.",
      "Sign out and continue with this device's guest progress instead.",
      "Contact support to preserve both, if this is unexpected.",
    ],
    resolveLabelDefault: "Continue with my account",
  },
};

/**
 * Render the conflict-resolution screen. Server-component-safe; the
 * orchestrator hands it typed props and a callback.
 *
 * @example
 * <BootstrapConflictScreen
 *   reason="ACCOUNT_PROGRESS_CONFLICT"
 *   survivingUserId="auth-123"
 *   archivedGuestId="guest-456"
 *   onResolve={() => orchestrator.dispatch({ type: 'SIGN_OUT' })}
 * />
 */
export function BootstrapConflictScreen({
  reason,
  survivingUserId = null,
  archivedGuestId = null,
  onResolve,
  resolveLabel,
  className,
}: BootstrapConflictScreenProps) {
  const meta = REASON_META[reason];
  const showProgressIds =
    reason === "ACCOUNT_PROGRESS_CONFLICT" &&
    (survivingUserId != null || archivedGuestId != null);

  return (
    <main
      data-slot="bootstrap-conflict-screen"
      data-reason={reason}
      className={cn(
        "h-screen w-full flex items-center justify-center",
        "bg-background text-foreground px-4 py-8",
        "safe-area-container",
        className,
      )}
      aria-busy="true"
    >
      <Card
        className={cn(
          "w-full max-w-lg",
          "border-warning/40 bg-[#111827]/80 backdrop-blur",
          "border-l-[3px] border-l-warning",
        )}
        role="alertdialog"
        aria-labelledby="bootstrap-conflict-title"
        aria-describedby="bootstrap-conflict-body"
      >
        <CardHeader className="flex flex-col items-center gap-3 text-center">
          <div
            aria-hidden="true"
            className={cn(
              "flex items-center justify-center",
              "h-12 w-12 sm:h-14 sm:w-14 rounded-2xl",
              "bg-warning/10 border border-warning/40",
            )}
          >
            <GameIcon
              ui="info"
              size={28}
              color="#fbbf24"
              aria-label="Conflict warning"
            />
          </div>

          <CardTitle
            id="bootstrap-conflict-title"
            className="text-lg sm:text-xl"
          >
            {meta.title}
          </CardTitle>
          <CardDescription
            id="bootstrap-conflict-body"
            className="text-sm text-muted-label max-w-sm"
          >
            {meta.headline}
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          <p className="text-sm leading-relaxed text-foreground/90">
            {meta.body}
          </p>

          <ul className="flex flex-col gap-2 text-sm text-muted-label">
            {meta.bullets.map((line) => (
              <li key={line} className="flex items-start gap-2">
                <GameIcon
                  ui="production"
                  size={14}
                  color="#9ca3af"
                  aria-hidden="true"
                  className="mt-1 shrink-0"
                />
                <span>{line}</span>
              </li>
            ))}
          </ul>

          {showProgressIds && (
            <div
              className={cn(
                "grid grid-cols-1 gap-2",
                "rounded-lg border border-muted-label/30",
                "bg-background/60 p-3 text-xs font-mono",
              )}
              data-slot="bootstrap-conflict-metadata"
            >
              {survivingUserId != null && (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-label">survivingUserId</span>
                  <span
                    className="text-foreground truncate"
                    title={survivingUserId}
                  >
                    {survivingUserId}
                  </span>
                </div>
              )}
              {archivedGuestId != null && (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-label">archivedGuestId</span>
                  <span
                    className="text-foreground truncate"
                    title={archivedGuestId}
                  >
                    {archivedGuestId}
                  </span>
                </div>
              )}
            </div>
          )}

          <p className="sr-only">
            Bootstrap conflict: {meta.title}. {meta.headline} {meta.body}
          </p>
        </CardContent>

        <CardFooter className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            size="default"
            onClick={() => {
              // Secondary action: walk the user to the in-app SupportButton
              // which posts to /api/support/tickets. Soft fallback: a
              // window.open keeps the parent tab intact and avoids being
              // captured by SSR restrictions.
              if (typeof window !== "undefined") {
                window.open("/support", "_blank", "noopener,noreferrer");
              }
            }}
            className="w-full sm:w-auto"
          >
            <GameIcon ui="help" size={14} aria-hidden="true" />
            Contact support
          </Button>
          <Button
            type="button"
            variant="default"
            size="default"
            onClick={onResolve}
            className="w-full sm:w-auto"
            data-testid="bootstrap-conflict-resolve"
          >
            {resolveLabel ?? meta.resolveLabelDefault}
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}

export default BootstrapConflictScreen;
