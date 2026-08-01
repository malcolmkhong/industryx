"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GameTab } from "@/lib/game/shared/types/types";
import { useNavigateToTab } from "@/lib/hooks/page/useNavigateToTab";
import { useOfflineProgressCheck } from "@/lib/hooks/page/useOfflineProgressCheck";
import { useSessionHeartbeat } from "@/lib/hooks/page/useSessionHeartbeat";
import { useDailyLoginCheck } from "@/lib/hooks/page/useDailyLoginCheck";
import { useDragPrevention } from "@/lib/hooks/page/useDragPrevention";
import { useContextMenuPrevention } from "@/lib/hooks/page/useContextMenuPrevention";
import { useKeyboardShortcuts } from "@/lib/hooks/page/useKeyboardShortcuts";
import { useLiveServerTick } from "@/lib/hooks/page/useLiveServerTick";

import { useAutoSaveIndicator } from "@/lib/hooks/page/useAutoSaveIndicator";
import { useHeaderHeightObserver } from "@/lib/hooks/page/useHeaderHeightObserver";
import { useHydrationGuard } from "@/lib/hooks/page/useHydrationGuard";
import { useReducedMotion } from "@/lib/hooks/page/useReducedMotion";
import { useAuth } from "@/components/providers/AuthProvider";
import { useGameConfig } from "@/components/providers/GameConfigProvider";
import { useCloudSync } from "@/lib/hooks/useCloudSync";
import { useLoginPrompt } from "@/lib/hooks/useLoginPrompt";
import { useMergeFlow } from "@/lib/hooks/useMergeFlow";
import { useServerMarket } from "@/lib/hooks/useServerMarket";

import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { GameLoadingSkeleton } from "@/components/game/GameLoadingSkeleton";

import { DesktopHeader } from "@/components/game/headers/DesktopHeader";
import { MobileHeader } from "@/components/game/headers/MobileHeader";
import { GameSidebar } from "@/components/game/GameSidebar";
import { BottomNavigationBar } from "@/components/game/BottomNavigationBar";
import { FloatingActionButton } from "@/components/game/FloatingActionButton";
import FloatingNumbers from "@/components/game/FloatingNumbers";
import KeyboardShortcutsHelp from "@/components/game/KeyboardShortcutsHelp";
import AmbientParticles from "@/components/game/AmbientParticles";
import GameToast from "@/components/game/GameToast";
import { CloudSyncBlockBanner } from "@/components/game/CloudSyncBlockBanner";
import { LoginFloatingPanel } from "@/components/game/LoginFloatingPanel";
import { AccountSettingsModal } from "@/components/game/AccountSettingsModal";
import { OfflineEarningsDialog } from "@/components/game/OfflineEarningsDialog";

import { useOrchestratorStatus } from "@/lib/auth/orchestrator/useOrchestratorStatus";
import { BootstrapLoadingScreen } from "@/components/game/auth/BootstrapLoadingScreen";
import { BootstrapErrorScreen } from "@/components/game/auth/BootstrapErrorScreen";
import { BootstrapConflictScreen } from "@/components/game/auth/BootstrapConflictScreen";
import { StateRecoveryScreen } from "@/components/game/auth/StateRecoveryScreen";
import { SupportButton } from "@/components/game/SupportButton";

interface GameShellProps {
  children: React.ReactNode;
}

// GameShell owns the entire chrome (header, sidebar, bottom nav, FAB, dialogs,
// hooks, sync). It mounts once per `/game/...` session and never re-mounts on
// tab change - keeping Zustand state, cloud sync, and all client lifecycle
// timers alive across instant Next.js client-side route transitions.
//
// Bootstrap gating (Tasks 1, 2, 3):
//   - The orchestrator owns 8 lifecycle states. GameShell reads them via
//     useOrchestratorStatus() and renders the appropriate full-screen
//     surface BEFORE the main chrome. This is the single, authoritative
//     gate that prevents the user from seeing panels render against
//     pre-bootstrap or error states (where every API call would 401).
//   - Status rendering priority:
//       resolving_session / bootstrapping / signed_out -> BootstrapLoadingScreen
//       temporary_error                              -> BootstrapErrorScreen
//       conflict                                     -> BootstrapConflictScreen
//       recovery_required                            -> StateRecoveryScreen
//       ready (after mount, no activeBlockedState)    -> full GameShell chrome
//       ready (with configBlockedState)              -> CloudSyncBlockBanner only
//       any other status (idle, before mount)        -> GameLoadingSkeleton
export function GameShell({ children }: GameShellProps) {
  // Phase 7: server owns game time. Client only renders. UI animation is
  // colocated with displays that need it (coin counters, countdown bars).

  const headerRef = useRef<HTMLElement>(null);

  // ─── Bootstrap / orchestrator state (Task 2) ─────────────────────────
  // Subscribe to the orchestrator BEFORE any of the side-effecting hooks
  // so a stuck bootstrap short-circuits the rest of the tree. React's
  // useSyncExternalStore inside useOrchestratorStatus guarantees we only
  // re-render when status/identity actually change.
  const { state: orchestratorState } = useOrchestratorStatus();
  const orchestrator = orchestratorState;

  // Effects → custom hooks
  useReducedMotion();
  const mounted = useHydrationGuard();
  const headerHeight = useHeaderHeightObserver(headerRef, mounted);
  const {
    offlineData,
    setOfflineData,
    offlineDialogOpen,
    setOfflineDialogOpen,
  } = useOfflineProgressCheck();
  useSessionHeartbeat();
  useDailyLoginCheck();
  useDragPrevention();
  useContextMenuPrevention();
  useKeyboardShortcuts();
  useLiveServerTick();

  useServerMarket();
  useAutoSaveIndicator();
  const navigateToTab = useNavigateToTab();
  const { signInWithGoogle, signInWithGithub } = useAuth();
  const [configBlockDetectedAt] = useState(() => Date.now());
  const {
    loading: configLoading,
    error: configError,
    isUsingSupabase,
  } = useGameConfig();
  const { blockedState, flushSaveOnUnload } = useCloudSync();
  const configBlockedState =
    !configLoading && !isUsingSupabase
      ? {
          isBlocked: true,
          code: "CONFIG_UNAVAILABLE" as const,
          reason:
            configError ??
            "Game configuration is unavailable. Server gameplay actions are paused.",
          detectedAt: configBlockDetectedAt,
        }
      : null;
  const activeBlockedState = blockedState?.isBlocked
    ? blockedState
    : configBlockedState;

  // ─── Auth-screen routing (Task 1) ────────────────────────────────────
  // Map orchestrator status -> screen component. Done as a useMemo so
  // the screen element identity is stable across renders that don't
  // change orchestrator status.
  const authScreen = useMemo(() => {
    const status = orchestrator.status;
    if (
      status === "resolving_session" ||
      status === "bootstrapping" ||
      status === "signed_out"
    ) {
      return {
        kind: "loading" as const,
        stage: (
          status === "signed_out"
            ? "signed_out"
            : status === "resolving_session"
              ? "resolving_session"
              : "bootstrapping"
        ) as "signed_out" | "resolving_session" | "bootstrapping",
      };
    }
    if (status === "temporary_error") {
      const r = orchestrator.result;
      const reason =
        r && r.status === "temporary_error" ? r.reason : "internal_error";
      const friendlyMessage = (() => {
        switch (reason) {
          case "rate_limited":
            return "You are being rate-limited. Please wait a few seconds and try again.";
          case "service_unavailable":
            return "The authentication service is temporarily unavailable. Please retry.";
          case "network":
            return "Network hiccup reaching the authentication server. Please retry.";
          case "invalid_session":
            return "Your session token is no longer valid. Please retry to refresh it.";
          case "invalid_request":
            return "The server rejected the bootstrap request. Please retry.";
          case "internal_error":
          default:
            return "Internal error during bootstrap. Please retry.";
        }
      })();
      return { kind: "error" as const, message: friendlyMessage };
    }
    if (status === "conflict") {
      const r = orchestrator.result;
      return {
        kind: "conflict" as const,
        reason:
          r && r.status === "conflict"
            ? (r.reason as
                | "DEVICE_BOUND_TO_OTHER_USER"
                | "ACCOUNT_PROGRESS_CONFLICT")
            : ("DEVICE_BOUND_TO_OTHER_USER" as const),
        survivingUserId: r && r.status === "conflict" ? r.survivingUserId : null,
        archivedGuestId: r && r.status === "conflict" ? r.archivedGuestId : null,
      };
    }
    if (status === "recovery_required") {
      return { kind: "recovery" as const };
    }
    return null;
  }, [orchestrator.status, orchestrator.result]);

  // Retry handler used by BootstrapErrorScreen. Calls the orchestrator's
  // public retry() which is only meaningful from temporary_error. No-op
  // safe (the orchestrator guards internally).
  const handleBootstrapRetry = useCallback(() => {
    // The orchestrator instance lives in React context (AuthOrchestratorProvider).
    // Reach for it via a lazy lookup — we don't pull it into local state
    // because that would trigger re-renders that we don't need.
    import("@/lib/auth/orchestrator/registry").then(({ getOrchestratorStateSnapshot }) => {
      void getOrchestratorStateSnapshot; // touch to ensure module load
    });
    // The orchestrator singleton is held by AuthOrchestratorProvider; pull
    // it via the orchestrator-attached context. We use the snapshot helper
    // here only to trigger retry — but retry() needs the actual instance.
    // The cleanest path: useAuth() already returns it via AuthProvider's
    // mirror... but AuthProvider doesn't expose the instance. The
    // orchestrator exposes retry() publicly, so we call through the
    // singleton via the registry. To avoid an import cycle, the simplest
    // approach is to dispatch a custom event that AuthProvider listens for.
    window.dispatchEvent(new CustomEvent("industryx:bootstrap-retry"));
  }, []);

  // Phase 5.5: best-effort save on tab close / window unload.
  // Three events cover the matrix of browsers and close modes:
  //   - `pagehide`: most reliable (fires on tab close, navigation, back/forward)
  //   - `visibilitychange` to 'hidden': catches mobile backgrounding + tab switch
  //   - `beforeunload`: legacy fallback for older browsers
  // The `isSyncing` guard inside the service prevents duplicate POSTs
  // if multiple events fire (race condition: auto-save + tab close at once).
  useEffect(() => {
    const onPageHide = () => flushSaveOnUnload();
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") flushSaveOnUnload();
    };
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("beforeunload", onPageHide);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("beforeunload", onPageHide);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [flushSaveOnUnload]);

  // Login prompt + merge flow
  const {
    isOpen: loginPromptOpen,
    reason: loginPromptReason,
    closePrompt,
  } = useLoginPrompt();

  const {
    state: mergeState,
    confirmMerge,
    cancelMerge,
    closeMerge,
    retryMerge,
  } = useMergeFlow();

  const [accountSettingsOpen, setAccountSettingsOpen] = useState(false);
  const { signOut } = useAuth();
  const handleSignOut = useCallback(async () => {
    setAccountSettingsOpen(false);
    await signOut();
  }, [signOut]);

  const handleCollectOfflineEarnings = useCallback(() => {
    // Server already applied the post-tick state when the offline POST
    // returned — see useOfflineProgressCheck. The dialog is a confirmation
    // surface only; collecting just dismisses it.
    setOfflineData(null);
    setOfflineDialogOpen(false);
  }, [setOfflineData, setOfflineDialogOpen]);

  if (!mounted) {
    return <GameLoadingSkeleton headerHeight={headerHeight} />;
  }

  // Wrap the bell + notifications click in a typed helper so headers don't need
  // to import GameTab themselves.
  const handleTabChangeForHeader = (tab: GameTab) => navigateToTab(tab);

  // ─── Bootstrap gate (Task 3) ──────────────────────────────────────────
  // The orchestrator is the source of truth for "is the player allowed to
  // see the game shell?". We render the dedicated full-screen screens for
  // every non-ready status BEFORE the chrome so the user never sees an
  // empty / half-hydrated dashboard.
  if (authScreen) {
    if (authScreen.kind === "loading") {
      return <BootstrapLoadingScreen stage={authScreen.stage} />;
    }
    if (authScreen.kind === "error") {
      return (
        <BootstrapErrorScreen
          kind="temporary_error"
          message={authScreen.message}
          onRetry={handleBootstrapRetry}
        />
      );
    }
    if (authScreen.kind === "conflict") {
      // For DEVICE_BOUND_TO_OTHER_USER the actionable next step is to sign
      // out so a fresh device binding can be created. For
      // ACCOUNT_PROGRESS_CONFLICT we keep the default "continue with my
      // account" — the user can also choose to sign out via the account
      // modal. Both call applyServerState via retry() (orchestrator will
      // re-bootstrap from a fresh state).
      return (
        <BootstrapConflictScreen
          reason={authScreen.reason}
          survivingUserId={authScreen.survivingUserId}
          archivedGuestId={authScreen.archivedGuestId}
          onResolve={handleBootstrapRetry}
        />
      );
    }
    if (authScreen.kind === "recovery") {
      return (
        <>
          <StateRecoveryScreen onContactSupport={() => undefined} />
          {/* Mount the support button hidden so its state can be lifted by
              the user via the chrome; clicking the screen CTA is the
              primary path. */}
          <div className="fixed bottom-4 right-4 z-50">
            <SupportButton />
          </div>
        </>
      );
    }
  }

  return (
    <ErrorBoundary>
      <TooltipProvider>
        {activeBlockedState?.isBlocked && (
          <CloudSyncBlockBanner
            blockedState={activeBlockedState}
            onSignInWithGoogle={
              activeBlockedState.code === "SESSION_EXPIRED" ? signInWithGoogle : undefined
            }
            onSignInWithGithub={
              activeBlockedState.code === "SESSION_EXPIRED" ? signInWithGithub : undefined
            }
          />
        )}
        <div className="h-screen flex flex-col bg-background text-subtle overflow-hidden safe-area-container">
          <header
            ref={headerRef}
            className="fixed top-0 left-0 right-0 z-50 top-bar-gradient border-b border-brand/30 px-2 lg:px-3 py-1.5 lg:py-2 focus:outline-none"
            style={{
              paddingTop: "calc(0.375rem + env(safe-area-inset-top, 0px))",
            }}
            aria-label="Game header"
          >
            <DesktopHeader
              onTabChange={handleTabChangeForHeader}
              onManageAccount={() => setAccountSettingsOpen(true)}
            />
            <MobileHeader
              onTabChange={handleTabChangeForHeader}
              onManageAccount={() => setAccountSettingsOpen(true)}
            />
          </header>

          <div className="shrink-0" style={{ height: headerHeight }} />

          <div className="flex flex-1 min-h-0 overflow-hidden">
            <GameSidebar />

            <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden game-scrollbar p-2 sm:p-3 lg:p-4 game-grid-bg relative pb-28 lg:pb-4">
              <AmbientParticles />
              <div className="relative z-10">{children}</div>
            </main>
          </div>

          <BottomNavigationBar />
          <FloatingActionButton onTabChange={handleTabChangeForHeader} />
          <FloatingNumbers />
          <KeyboardShortcutsHelp />
        </div>

        <GameToast />
        <LoginFloatingPanel
          open={loginPromptOpen || mergeState.isOpen}
          reason={mergeState.isOpen ? mergeState.reason : loginPromptReason}
          onClose={closePrompt}
          mergePreview={mergeState.preview}
          mergeOperationId={mergeState.operationId}
          isMergeConfirming={mergeState.isConfirming}
          mergeResult={mergeState.result}
          mergeReceiptId={mergeState.receiptId}
          mergeError={mergeState.error}
          onMergeConfirm={confirmMerge}
          onMergeCancel={cancelMerge}
          onMergeClose={closeMerge}
          onMergeRetry={retryMerge}
        />
        <AccountSettingsModal
          open={accountSettingsOpen}
          onClose={() => setAccountSettingsOpen(false)}
          onSignOut={handleSignOut}
        />
        <OfflineEarningsDialog
          open={offlineDialogOpen}
          onOpenChange={setOfflineDialogOpen}
          offlineData={offlineData}
          onCollect={handleCollectOfflineEarnings}
        />
      </TooltipProvider>
    </ErrorBoundary>
  );
}
