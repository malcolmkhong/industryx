/**
 * StateRecoveryScreen — PR 5A (plan §13, §14).
 *
 * Full-screen, server-component-safe presentation component rendered when
 * the orchestrator enters the `recovery_required` state. Plan §13 rules:
 *
 *  - Block gameplay.
 *  - Do NOT auto-reset progress.
 *  - Retry only when server says retryable — by default, recovery is
 *    non-retryable. This screen intentionally omits a Retry button.
 *  - Provide a support / contact path so a human can resolve.
 *
 * Rules honored:
 *  - UI-001: game panel location.
 *  - UI-003: shadcn Button + Card.
 *  - UI-004: status glyph via <GameIcon />, not emoji (UI-012).
 *  - UI-006: mobile-first.
 *  - UI-009 / STD-003: calm, non-alarming tone; icon + heading convey
 *    severity without relying on color alone; visible focus ring.
 *  - UI-011: dark-mode-safe.
 *  - ARC-006: <1200 LOC.
 *
 * Decoupled from `@/lib/auth/orchestrator` — props only.
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

export interface StateRecoveryScreenProps {
  /**
   * Wired by AuthProvider to navigate the user to the support flow:
   * the in-app `SupportButton` (POST /api/support/tickets) or, in
   * fallback, a documented `mailto:` link.
   */
  onContactSupport: () => void;
  /** Optional layout override. */
  className?: string;
}

/**
 * Render the non-retryable recovery screen. Server-component-safe: no
 * hooks, no client-only state. AuthProvider wires the support callback.
 *
 * @example
 * <StateRecoveryScreen
 *   onContactSupport={() => router.push('/support')}
 * />
 */
export function StateRecoveryScreen({
  onContactSupport,
  className,
}: StateRecoveryScreenProps) {
  return (
    <main
      data-slot="state-recovery-screen"
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
          "w-full max-w-md",
          "border-info/40 bg-[#111827]/80 backdrop-blur",
          "border-l-[3px] border-l-info",
        )}
        role="alert"
        aria-labelledby="state-recovery-title"
        aria-describedby="state-recovery-body"
      >
        <CardHeader className="flex flex-col items-center gap-3 text-center">
          <div
            aria-hidden="true"
            className={cn(
              "flex items-center justify-center",
              "h-12 w-12 sm:h-14 sm:w-14 rounded-2xl",
              "bg-info/10 border border-info/40",
            )}
          >
            <GameIcon
              ui="info"
              size={28}
              color="#60a5fa"
              aria-label="Recovery required"
            />
          </div>

          <CardTitle
            id="state-recovery-title"
            className="text-lg sm:text-xl"
          >
            We need a hand to recover your save
          </CardTitle>
          <CardDescription
            id="state-recovery-body"
            className="text-sm text-muted-label max-w-sm"
          >
            Your saved game data is in an unexpected state. We paused
            gameplay so nothing is overwritten.
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-4 text-sm leading-relaxed">
          <p className="text-foreground/90">
            Our servers flagged this save as inconsistent or unsupported.
            This is not a reset — your progress is preserved while we
            investigate.
          </p>

          <ul className="flex flex-col gap-2 text-muted-label">
            <li className="flex items-start gap-2">
              <GameIcon
                ui="production"
                size={14}
                color="#9ca3af"
                aria-hidden="true"
                className="mt-1 shrink-0"
              />
              <span>Do not clear your browser data or reinstall.</span>
            </li>
            <li className="flex items-start gap-2">
              <GameIcon
                ui="production"
                size={14}
                color="#9ca3af"
                aria-hidden="true"
                className="mt-1 shrink-0"
              />
              <span>
                Contact our support team with the recovery reference shown
                after you submit a ticket.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <GameIcon
                ui="production"
                size={14}
                color="#9ca3af"
                aria-hidden="true"
                className="mt-1 shrink-0"
              />
              <span>
                You can safely close this page; support will reach you
                when the save is restored.
              </span>
            </li>
          </ul>

          <p className="sr-only">
            Bootstrap recovery required. Your saved game data is in an
            unexpected state. We paused gameplay so nothing is overwritten.
            Contact support to continue.
          </p>
        </CardContent>

        <CardFooter className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          {/* Plan §5: recovery is non-retryable — no Retry button here. */}
          <Button
            type="button"
            variant="default"
            size="lg"
            onClick={onContactSupport}
            className="w-full sm:w-auto"
            data-testid="state-recovery-contact-support"
          >
            <GameIcon ui="help" size={16} aria-hidden="true" />
            Contact support
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}

export default StateRecoveryScreen;
