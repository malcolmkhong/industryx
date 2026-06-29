'use client';

import { useCallback, useRef, useState } from 'react';
import { useGameStore } from '@/lib/game/store';
import { GameTab } from '@/lib/game/types';
import { useNavigateToTab } from '@/lib/hooks/page/useNavigateToTab';
import { useOfflineProgressCheck } from '@/lib/hooks/page/useOfflineProgressCheck';
import { useDailyLoginCheck } from '@/lib/hooks/page/useDailyLoginCheck';
import { useDragPrevention } from '@/lib/hooks/page/useDragPrevention';
import { useContextMenuPrevention } from '@/lib/hooks/page/useContextMenuPrevention';
import { useKeyboardShortcuts } from '@/lib/hooks/page/useKeyboardShortcuts';
import { useAutoOpenGuide } from '@/lib/hooks/page/useAutoOpenGuide';
import { useGameTickLoop } from '@/lib/hooks/page/useGameTickLoop';
import { useAutoSaveIndicator } from '@/lib/hooks/page/useAutoSaveIndicator';
import { useHeaderHeightObserver } from '@/lib/hooks/page/useHeaderHeightObserver';
import { useHydrationGuard } from '@/lib/hooks/page/useHydrationGuard';
import { useReducedMotion } from '@/lib/hooks/page/useReducedMotion';
import { useAuth } from '@/components/providers/AuthProvider';
import { useCloudSync } from '@/lib/hooks/useCloudSync';
import { useLoginPrompt } from '@/lib/hooks/useLoginPrompt';
import { useMergeFlow } from '@/lib/hooks/useMergeFlow';
import { useServerMarket } from '@/lib/hooks/useServerMarket';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { GameLoadingSkeleton } from '@/components/game/GameLoadingSkeleton';

import { DesktopHeader } from '@/components/game/headers/DesktopHeader';
import { MobileHeader } from '@/components/game/headers/MobileHeader';
import { GameSidebar } from '@/components/game/GameSidebar';
import { BottomNavigationBar } from '@/components/game/BottomNavigationBar';
import { FloatingActionButton } from '@/components/game/FloatingActionButton';
import FloatingNumbers from '@/components/game/FloatingNumbers';
import KeyboardShortcutsHelp from '@/components/game/KeyboardShortcutsHelp';
import AmbientParticles from '@/components/game/AmbientParticles';
import GameToast from '@/components/game/GameToast';
import { CloudSyncBlockBanner } from '@/components/game/CloudSyncBlockBanner';
import { LoginFloatingPanel } from '@/components/game/LoginFloatingPanel';
import { AccountSettingsModal } from '@/components/game/AccountSettingsModal';
import { OfflineEarningsDialog } from '@/components/game/dialogs/OfflineEarningsDialog';
import { ExportDialog } from '@/components/game/dialogs/ExportDialog';
import { ImportDialog } from '@/components/game/dialogs/ImportDialog';

interface GameShellProps {
  children: React.ReactNode;
}

// GameShell owns the entire chrome (header, sidebar, bottom nav, FAB, dialogs,
// hooks, sync). It mounts once per `/game/...` session and never re-mounts on
// tab change — keeping Zustand state, game tick loop, cloud sync, and all
// timers alive across instant Next.js client-side route transitions.
export function GameShell({ children }: GameShellProps) {
  const gameTick = useGameStore(s => s.gameTick);
  const gameSpeed = useGameStore(s => s.gameSpeed);
  const prestigeSpeedBonus = useGameStore(s =>
    s.prestigeState.bonuses
      .filter(b => b.purchased && b.effect.type === 'gameSpeed')
      .reduce((sum, b) => sum + b.effect.value, 0)
  );
  const effectiveSpeed = gameSpeed * (1 + prestigeSpeedBonus);
  const paused = useGameStore(s => s.paused);

  const exportSave = useGameStore(s => s.exportSave);
  const importSave = useGameStore(s => s.importSave);
  const resetGame = useGameStore(s => s.resetGame);

  const headerRef = useRef<HTMLElement>(null);

  // Effects → custom hooks
  useReducedMotion();
  const mounted = useHydrationGuard();
  const headerHeight = useHeaderHeightObserver(headerRef, mounted);
  const { offlineData, setOfflineData, offlineDialogOpen, setOfflineDialogOpen } = useOfflineProgressCheck();
  useDailyLoginCheck();
  useDragPrevention();
  useContextMenuPrevention();
  useKeyboardShortcuts();
  useAutoOpenGuide();
  useGameTickLoop(effectiveSpeed, paused);
  useServerMarket();
  const { showSavedFlash } = useAutoSaveIndicator();
  const navigateToTab = useNavigateToTab();
  const { signInWithGoogle } = useAuth();
  const { blockedState } = useCloudSync();

  // Save system state
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [exportString, setExportString] = useState('');
  const [importString, setImportString] = useState('');
  const [importError, setImportError] = useState('');
  const [copiedToClipboard, setCopiedToClipboard] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  // Login prompt + merge flow
  const { isOpen: loginPromptOpen, reason: loginPromptReason, closePrompt } = useLoginPrompt();

  const { state: mergeState, confirmMerge, cancelMerge, closeMerge, retryMerge } = useMergeFlow();

  const [accountSettingsOpen, setAccountSettingsOpen] = useState(false);
  const { signOut } = useAuth();
  const handleSignOut = useCallback(async () => {
    setAccountSettingsOpen(false);
    await signOut();
  }, [signOut]);

  const handleExport = useCallback(() => {
    const saveStr = exportSave();
    setExportString(saveStr);
    setExportDialogOpen(true);
    setCopiedToClipboard(false);
  }, [exportSave]);

  const handleCopyToClipboard = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(exportString);
      setCopiedToClipboard(true);
      setTimeout(() => setCopiedToClipboard(false), 2000);
    } catch {
      setCopiedToClipboard(false);
    }
  }, [exportString]);

  const handleImport = useCallback(() => {
    setImportString('');
    setImportError('');
    setImportDialogOpen(true);
  }, []);

  const handleImportConfirm = useCallback(() => {
    if (!importString.trim()) {
      setImportError('Please paste a save string.');
      return;
    }
    const success = importSave(importString.trim());
    if (success) {
      setImportDialogOpen(false);
      setImportString('');
      setImportError('');
    } else {
      setImportError('Invalid save data. Please check your save string and try again.');
    }
  }, [importSave, importString]);

  const handleReset = useCallback(() => {
    setResetConfirmOpen(true);
  }, []);

  const confirmReset = useCallback(() => {
    resetGame();
    setResetConfirmOpen(false);
  }, [resetGame]);

  const handleCollectOfflineEarnings = useCallback(() => {
    if (offlineData) {
      useGameStore.getState().collectOfflineProgress(offlineData);
      setOfflineData(null);
    }
  }, [offlineData, setOfflineData]);

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
            onSignInAgain={blockedState.code === 'SESSION_EXPIRED' ? signInWithGoogle : undefined}
          />
        )}
        <div className="h-screen flex flex-col bg-background text-subtle overflow-hidden safe-area-container">
          <header
            ref={headerRef}
            className="fixed top-0 left-0 right-0 z-50 top-bar-gradient border-b border-brand/30 px-2 lg:px-3 py-1.5 lg:py-2 focus:outline-none"
            style={{ paddingTop: 'calc(0.375rem + env(safe-area-inset-top, 0px))' }}
            aria-label="Game header"
          >
            <DesktopHeader
              onExport={handleExport}
              onImport={handleImport}
              onReset={handleReset}
              onTabChange={handleTabChangeForHeader}
              onManageAccount={() => setAccountSettingsOpen(true)}
            />
            <MobileHeader
              onExport={handleExport}
              onImport={handleImport}
              onReset={handleReset}
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

        <ExportDialog
          open={exportDialogOpen}
          onOpenChange={setExportDialogOpen}
          exportString={exportString}
          onCopy={handleCopyToClipboard}
          copiedToClipboard={copiedToClipboard}
        />
        <ImportDialog
          open={importDialogOpen}
          onOpenChange={setImportDialogOpen}
          importString={importString}
          setImportString={setImportString}
          importError={importError}
          setImportError={setImportError}
          onImport={handleImportConfirm}
        />
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
        <AlertDialog open={resetConfirmOpen} onOpenChange={setResetConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reset game progress?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently erase all your factories, resources, research, and prestige.
                This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmReset}
                className="bg-danger text-white hover:bg-danger/90 focus-visible:ring-danger"
              >
                Yes, reset everything
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </TooltipProvider>
    </ErrorBoundary>
  );
}