/**
 * BootstrapLoadingScreen — PR 5A (plan §14).
 *
 * Full-screen, server-component-safe presentation component rendered while
 * the orchestrator is in `resolving_session`, `bootstrapping`, or the
 * brief `signed_out` transition state after the user clicks sign-out.
 *
 * Rules honored:
 *  - UI-004: branded spinner uses <GameIcon />, no raw emoji.
 *  - UI-006: mobile-first layout (full-bleed on mobile, padded on sm+).
 *  - UI-009 / STD-003: role="status" + aria-live="polite" announces stage
 *    changes to screen readers; WCAG 2.2 AA contrast.
 *  - UI-011: dark-mode-safe palette via project tokens (background,
 *    foreground, brand, muted-label).
 *  - ARC-006: <1200 LOC, single-responsibility (no auth logic; just props).
 *
 * Decoupled from `@/lib/auth/orchestrator` so PR 5B can wire it freely.
 */

import { BrandLogo } from "@/components/icons/BrandLogo";
import { LoadingSpinner } from "@/components/game/shared/LoadingSpinner";
import { cn } from "@/lib/utils";

export type BootstrapLoadingStage =
  | "resolving_session"
  | "bootstrapping"
  | "signed_out";

export interface BootstrapLoadingScreenProps {
  /** Which orchestrator lifecycle stage is currently animating. */
  stage: BootstrapLoadingStage;
  /** Optional additional class names for layout overrides. */
  className?: string;
}

interface StageMeta {
  /** Short heading (≤ 3 words). */
  title: string;
  /** Calming, non-blocking helper text shown under the spinner. */
  subtitle: string;
  /** Spinner key passed to <LoadingSpinner size="lg" />. */
  size: "sm" | "md" | "lg";
}

const STAGE_META: Record<BootstrapLoadingStage, StageMeta> = {
  resolving_session: {
    title: "Securing your session",
    subtitle: "Verifying your identity with the server…",
    size: "md",
  },
  bootstrapping: {
    title: "Bootstrapping your empire",
    subtitle: "Loading factories, markets, and resources…",
    size: "lg",
  },
  signed_out: {
    title: "Signing you out",
    subtitle: "Clearing your session and returning to guest mode…",
    size: "md",
  },
};

/**
 * Full-screen loading surface used by the AuthProvider while bootstrap is
 * in flight. Renders as a server component (no hooks, no side effects).
 *
 * @example
 * <BootstrapLoadingScreen stage="bootstrapping" />
 */
export function BootstrapLoadingScreen({
  stage,
  className,
}: BootstrapLoadingScreenProps) {
  const meta = STAGE_META[stage];

  return (
    <main
      data-slot="bootstrap-loading-screen"
      data-stage={stage}
      className={cn(
        "h-screen w-full flex flex-col items-center justify-center",
        "bg-background text-foreground px-4 py-8",
        "safe-area-container",
        className,
      )}
      aria-busy="true"
    >
      <section
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className={cn(
          "flex flex-col items-center gap-5 sm:gap-6",
          "max-w-md w-full text-center",
        )}
      >
        <BrandLogo size="lg" />

        <div
          className={cn(
            "flex items-center justify-center",
            "h-14 w-14 sm:h-16 sm:w-16 rounded-2xl",
            "bg-brand/10 border border-brand/30",
            "shadow-[0_0_24px_rgba(0,255,242,0.15)]",
          )}
          aria-hidden="true"
        >
          <LoadingSpinner size={meta.size} />
        </div>

        <header className="flex flex-col items-center gap-1.5">
          <h1
            className={cn(
              "text-lg sm:text-xl font-bold tracking-wide text-brand",
            )}
          >
            {meta.title}
          </h1>
          <p className="text-xs sm:text-sm text-muted-label max-w-sm">
            {meta.subtitle}
          </p>
        </header>

        <ProgressBar />

        <p className="sr-only" aria-live="polite">
          {meta.title}. {meta.subtitle}
        </p>
      </section>
    </main>
  );
}

/**
 * Indeterminate, purely decorative progress bar. Communicates motion
 * without claiming a specific percentage (the orchestrator decides when
 * bootstrap is actually ready). Reduced-motion users get a static strip.
 */
function ProgressBar() {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "w-48 sm:w-56 h-1 rounded-full overflow-hidden",
        "bg-muted-label/20",
      )}
    >
      <div
        className={cn(
          "h-full w-1/3 rounded-full",
          "bg-linear-to-r from-brand/70 to-success/70",
          "loading-progress-bar",
        )}
      />
    </div>
  );
}

export default BootstrapLoadingScreen;
