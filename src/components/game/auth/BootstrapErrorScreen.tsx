/**
 * BootstrapErrorScreen — PR 5A (plan §14, §15).
 *
 * Full-screen, server-component-safe presentation component shown when the
 * orchestrator enters the `temporary_error` state, or when bootstrap is
 * outright unavailable (503 / 5xx). Renders the friendly user-facing
 * message, a "Status: retryable" pill, and a Retry button that delegates
 * to the caller-supplied handler (orchestrator triggers RETRY).
 *
 * Rules honored:
 *  - UI-003: shadcn Button, Badge, Card primitives; cn() composition.
 *  - UI-006: mobile-first; stacked CTA on mobile, single-line on sm+.
 *  - UI-009 / STD-003:
 *    * role="alert" + aria-live="polite" wraps the message for SR users.
 *    * Color is paired with an icon AND a textual "retryable" pill
 *      (STD-003: non-color-only meaning).
 *    * Visible focus ring on the primary CTA (focus-visible:ring-*).
 *  - UI-011: dark-mode-safe (uses semantic tokens: destructive, warning,
 *    success, muted-label).
 *  - UI-012: no emoji literals; uses <GameIcon /> for warning glyph.
 *  - TS-001: no `any` in props.
 *  - ARC-006: <1200 LOC, single responsibility.
 *
 * Decoupled from `@/lib/auth/orchestrator` — receives props only so PR 5B
 * can wire it without coupling to internal types.
 */

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GameIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

export type BootstrapErrorKind = "temporary_error" | "unavailable";

export interface BootstrapErrorScreenProps {
  /**
   * `temporary_error` covers 429 / 503 / network failures and is
   * retryable. `unavailable` covers 5xx / config-unavailable and is
   * also retryable but signals a heavier infra outage.
   */
  kind: BootstrapErrorKind;
  /** Human-friendly message from the orchestrator / server payload. */
  message: string;
  /** Retry callback wired by AuthProvider; no-op safe. */
  onRetry: () => void;
  /** Optional busy flag — disables Retry to prevent double-submit. */
  isRetrying?: boolean;
  /** Optional extra class names for layout overrides. */
  className?: string;
}

const KIND_META: Record<
  BootstrapErrorKind,
  { tone: "warning" | "destructive"; iconUi: string; title: string }
> = {
  temporary_error: {
    tone: "warning",
    iconUi: "info",
    title: "Temporary connection issue",
  },
  unavailable: {
    tone: "destructive",
    iconUi: "info",
    title: "Service unavailable",
  },
};

/**
 * Render the retryable bootstrap error screen. Server-component-safe:
 * no hooks, no client-only state. The parent (AuthProvider) is
 * responsible for wiring `onRetry` to `orchestrator.triggerRetry()`.
 *
 * @example
 * <BootstrapErrorScreen
 *   kind="temporary_error"
 *   message="Network hiccup. Please try again."
 *   onRetry={() => orchestrator.dispatch({ type: 'RETRY' })}
 * />
 */
export function BootstrapErrorScreen({
  kind,
  message,
  onRetry,
  isRetrying = false,
  className,
}: BootstrapErrorScreenProps) {
  const meta = KIND_META[kind];

  return (
    <main
      data-slot="bootstrap-error-screen"
      data-kind={kind}
      className={cn(
        "h-screen w-full flex items-center justify-center",
        "bg-background text-foreground px-4 py-8",
        "safe-area-container",
        className,
      )}
    >
      <Card
        className={cn(
          "w-full max-w-md",
          "border-muted-label/40 bg-[#111827]/80 backdrop-blur",
        )}
        role="alert"
      >
        <CardHeader className="flex flex-col items-center gap-3 text-center">
          <div
            aria-hidden="true"
            className={cn(
              "flex items-center justify-center",
              "h-12 w-12 sm:h-14 sm:w-14 rounded-2xl",
              meta.tone === "warning"
                ? "bg-warning/10 border border-warning/30"
                : "bg-destructive/10 border border-destructive/30",
            )}
          >
            <GameIcon
              ui={meta.iconUi}
              size={28}
              color={meta.tone === "warning" ? "#fbbf24" : "#f87171"}
              aria-label={meta.title}
            />
          </div>

          <CardTitle className="text-lg sm:text-xl">{meta.title}</CardTitle>

          <Badge
            variant={meta.tone === "warning" ? "outline" : "destructive"}
            className={cn(
              "text-[10px] uppercase tracking-wider px-2 py-0.5",
              meta.tone === "warning"
                ? "border-warning/40 bg-warning/10 text-warning"
                : undefined,
            )}
            aria-label="Retry available"
          >
            <GameIcon
              ui="production"
              size={12}
              color={meta.tone === "warning" ? "#fbbf24" : "#fecaca"}
              aria-hidden="true"
            />
            Status: retryable
          </Badge>
        </CardHeader>

        <CardContent className="flex flex-col items-stretch gap-4">
          <p
            aria-live="polite"
            aria-atomic="true"
            className="text-sm text-muted-label text-center leading-relaxed"
          >
            {message}
          </p>

          <CardDescription className="sr-only">
            {meta.title}. {message}
          </CardDescription>

          <Button
            type="button"
            variant="default"
            size="lg"
            onClick={onRetry}
            disabled={isRetrying}
            className={cn(
              "w-full",
              meta.tone === "destructive"
                ? "bg-destructive hover:bg-destructive/90"
                : undefined,
            )}
            data-testid="bootstrap-error-retry"
          >
            {isRetrying ? (
              <>
                <span
                  className="inline-block h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin"
                  aria-hidden="true"
                />
                Retrying…
              </>
            ) : (
              <>
                <GameIcon ui="play" size={16} aria-hidden="true" />
                Retry
              </>
            )}
          </Button>

          <p className="text-[11px] text-muted-label/80 text-center">
            Your gameplay is paused until bootstrap succeeds. We never lose
            unsaved progress on retry.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}

export default BootstrapErrorScreen;
