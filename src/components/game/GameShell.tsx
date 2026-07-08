"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useGameStore } from "@/lib/game/store";
import { GameTab } from "@/lib/game/types";
import { useNavigateToTab } from "@/lib/hooks/page/useNavigateToTab";
import { useOfflineProgressCheck } from "@/lib/hooks/page/useOfflineProgressCheck";
import { useSessionHeartbeat } from "@/lib/hooks/page/useSessionHeartbeat";
import { useDailyLoginCheck } from "@/lib/hooks/page/useDailyLoginCheck";
import { useDragPrevention } from "@/lib/hooks/page/useDragPrevention";
import { useContextMenuPrevention } from "@/lib/hooks/page/useContextMenuPrevention";
import { useKeyboardShortcuts } from "@/lib/hooks/page/useKeyboardShortcuts";
import { useAutoOpenGuide } from "@/lib/hooks/page/useAutoOpenGuide";

import { useAutoSaveIndicator } from "@/lib/hooks/page/useAutoSaveIndicator";
import { useHeaderHeightObserver } from "@/lib/hooks/page/useHeaderHeightObserver";
import { useHydrationGuard } from "@/lib/hooks/page/useHydrationGuard";
import { useReducedMotion } from "@/lib/hooks/page/useReducedMotion";
import { useAuth } from "@/components/providers/AuthProvider";
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

interface GameShellProps {
  children: React.ReactNode;
}

// GameShell owns the entire chrome (header, sidebar, bottom nav, FAB, dialogs,
// hooks, sync). It mounts once per `/game/...` session and never re-mounts on
// tab change — keeping Zustand state, game tick loop, cloud sync, and all
// timers alive across instant Next.js client-side route transitions.
export function GameShell({ children }: GameShellProps) {
  // Phase 7: server owns game time. Client only renders. Removed
  // gameTick/effectiveSpeed/paused selectors — they only fed the now-removed
  // useGameTickLoop call. The 1Hz UI animation is colocated with displays
  // that need it (coin counters, countdown bars).

  const headerRef = useRef<HTMLElement>(null);

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
  useAutoOpenGuide();

  useServerMarket();
  const { showSavedFlash } = useAutoSaveIndicator();
  const navigateToTab = useNavigateToTab();
  const { signInWithGoogle } = useAuth();
  const { blockedState, flushSaveOnUnload } = useCloudSync();

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

  return (
    <ErrorBoundary>
      <TooltipProvider>
        {blockedState?.isBlocked && (
          <CloudSyncBlockBanner
            blockedState={blockedState}
            onSignInAgain={
              blockedState.code === "SESSION_EXPIRED"
                ? signInWithGoogle
                : undefined
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
