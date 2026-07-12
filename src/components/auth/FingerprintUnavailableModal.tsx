"use client";

/**
 * FingerprintUnavailableModal
 *
 * Shown when the browser could not produce a fingerprint AND the user
 * is a NEW (not Step-1-recovered) anon user. The reason is opaque on
 * purpose: this can be an ad-blocker, a privacy extension, a strict
 * browser policy, a network failure, or even a transient SDK bug.
 *
 * Why we surface this: silent failure leaves users with a local-only
 * game that has no recovery path. The modal tells them:
 *   1. WHAT happened (degraded mode, server-based game)
 *   2. WHAT they can do (retry, sign in)
 *
 * The modal is DISMISSIBLE - the user can browse the full UI after
 * closing it. However, when the user attempts any server-side action
 * (build, buy, sell, etc.), the action handler dispatches a custom
 * event ("force-show-limited-modal") that re-shows the modal. The user
 * can dismiss again, but every gated action re-shows it until they
 * either fix the fingerprint or sign in.
 *
 * Built on the project's standard <Dialog> + <Button> + <Alert> +
 * <GameCard> primitives. Inherits focus trap, escape key, ARIA, and
 * design tokens from the rest of the app.
 */

import { useEffect, useState } from "react";

import { GameCard } from "@/components/game/shared/GameCard";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getFingerprintResult } from "@/lib/auth/fingerprint";
import { FORCE_SHOW_LIMITED_MODAL_EVENT } from "@/lib/auth/limitedMode";
import { useAuth } from "@/lib/auth/orchestrator/useAuth";

const SESSION_FLAG = "factory-dominion-fp-modal-shown";

type RetryOutcome = "idle" | "success" | "failure";

export function FingerprintUnavailableModal() {
  const { orchestrator } = useAuth();
  const [state, setState] = useState(() => orchestrator.getState());
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.sessionStorage.getItem(SESSION_FLAG) === "1";
  });
  const [retrying, setRetrying] = useState(false);
  const [retryOutcome, setRetryOutcome] = useState<RetryOutcome>("idle");

  useEffect(() => {
    return orchestrator.subscribe(setState);
  }, [orchestrator]);

  // Listen for the "force show" event from gated action handlers. When
  // a limited user attempts a server-side action, the handler dispatches
  // this event; we re-show the modal so the user understands the action
  // was blocked and why.
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handler = () => setDismissed(false);
    window.addEventListener(FORCE_SHOW_LIMITED_MODAL_EVENT, handler);
    return () => {
      window.removeEventListener(FORCE_SHOW_LIMITED_MODAL_EVENT, handler);
    };
  }, []);

  const open =
    state.limitedMode &&
    state.limitedReason === "fingerprint_unavailable" &&
    !dismissed;

  const handleRetry = async () => {
    setRetrying(true);
    setRetryOutcome("idle");
    try {
      const result = await getFingerprintResult();
      setRetryOutcome(result.status === "available" ? "success" : "failure");
      if (result.status === "available") {
        try {
          window.sessionStorage.setItem("factory-dominion-fp-retry-ok", "1");
        } catch {
          // best-effort
        }
      }
    } catch {
      setRetryOutcome("failure");
    } finally {
      setRetrying(false);
    }
  };

  const handleDismiss = () => {
    try {
      window.sessionStorage.setItem(SESSION_FLAG, "1");
    } catch {
      // best-effort
    }
    setDismissed(true);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) handleDismiss();
      }}
    >
      <DialogContent showCloseButton>
        <GameCard accent="amber">
          <DialogHeader>
            <DialogTitle className="text-warning">
              Limited Connection Mode
            </DialogTitle>
            <DialogDescription>
              Device fingerprinting is unavailable, so recovery is limited.
            </DialogDescription>
            <div className="space-y-3 text-sm leading-relaxed pt-2">
              <p>
                This is a server-based game. Your progress is saved on our
                servers, and we couldn&apos;t verify this device because your
                browser didn&apos;t provide a usable device fingerprint.
              </p>
              <p>
                This may be caused by privacy settings, browser extensions, or a
                temporary issue.
              </p>
              <p className="text-muted-foreground">
                <strong>Effect:</strong> your progress is saved on this device
                only. If you clear browser data, your save is lost.
              </p>
              <p>
                <strong>To play and save your progress, you must:</strong>
              </p>
              <ol className="ml-4 list-decimal space-y-1 text-muted-foreground">
                <li>Fix your browser&apos;s privacy settings or extensions</li>
                <li>Click &quot;Retry fingerprint&quot; below</li>
              </ol>
              <p className="text-muted-foreground">or</p>
              <p>
                Sign in with Google or GitHub. Your account will be linked to
                your sign-in, allowing progress to be recovered even if device
                fingerprinting is unavailable.
              </p>
            </div>
          </DialogHeader>

          {retryOutcome === "failure" && (
            <Alert variant="destructive" className="mt-3">
              <AlertDescription>
                Retry didn&apos;t work. Check your browser extensions or try a
                different browser.
              </AlertDescription>
            </Alert>
          )}
          {retryOutcome === "success" && (
            <Alert className="mt-3">
              <AlertDescription>
                Fingerprint captured. Refresh the page to apply.
              </AlertDescription>
            </Alert>
          )}

          <DialogFooter className="mt-4 flex-col gap-2 sm:flex-col sm:gap-2">
            <Button
              variant="outline"
              onClick={handleRetry}
              disabled={retrying}
              className="w-full border-warning/40 bg-warning/10 text-warning hover:bg-warning/20"
            >
              {retrying ? "Retrying..." : "Retry fingerprint"}
            </Button>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  window.location.href = "/api/auth/callback?provider=google";
                }}
                className="flex-1"
              >
                Sign in with Google
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  window.location.href = "/api/auth/callback?provider=github";
                }}
                className="flex-1"
              >
                Sign in with GitHub
              </Button>
            </div>
            <p className="text-center text-xs text-muted-foreground">
              You can dismiss this and browse the UI, but any action that uses
              resources will re-open it.
            </p>
          </DialogFooter>
        </GameCard>
      </DialogContent>
    </Dialog>
  );
}
