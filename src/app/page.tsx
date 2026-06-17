'use client';

import { useCallback, useRef, useState } from 'react';
import { useGameStore, formatNumber } from '@/lib/game/store';
import { BUILDING_DEFS, WEATHER_DEFS } from '@/lib/game/configCache';
import { GameTab, ResourceType } from '@/lib/game/types';
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
import { DashboardPanel } from '@/components/game/DashboardPanel';
const AIAdvisorPanel = dynamic(() => import('@/components/game/AIAdvisorPanel').then(m => m.default), { loading: () => <DynamicPanelFallback /> });
const ResourcePanel = dynamic(() => import('@/components/game/ResourcePanel').then(m => ({ default: m.ResourcePanel })), { loading: () => <DynamicPanelFallback /> });
const FactoryPanel = dynamic(() => import('@/components/game/FactoryPanel').then(m => ({ default: m.FactoryPanel })), { loading: () => <DynamicPanelFallback /> });
const TransportPanel = dynamic(() => import('@/components/game/TransportPanel').then(m => ({ default: m.TransportPanel })), { loading: () => <DynamicPanelFallback /> });
const PowerPanel = dynamic(() => import('@/components/game/PowerPanel').then(m => ({ default: m.PowerPanel })), { loading: () => <DynamicPanelFallback /> });
const MarketPanel = dynamic(() => import('@/components/game/MarketPanel').then(m => ({ default: m.MarketPanel })), { loading: () => <DynamicPanelFallback /> });
const ResearchPanel = dynamic(() => import('@/components/game/ResearchPanel').then(m => ({ default: m.ResearchPanel })), { loading: () => <DynamicPanelFallback /> });
const WorkerPanel = dynamic(() => import('@/components/game/WorkerPanel').then(m => ({ default: m.WorkerPanel })), { loading: () => <DynamicPanelFallback /> });
const ContractPanel = dynamic(() => import('@/components/game/ContractPanel').then(m => ({ default: m.ContractPanel })), { loading: () => <DynamicPanelFallback /> });
const AutomationPanel = dynamic(() => import('@/components/game/AutomationPanel').then(m => ({ default: m.AutomationPanel })), { loading: () => <DynamicPanelFallback /> });
const PrestigePanel = dynamic(() => import('@/components/game/PrestigePanel').then(m => ({ default: m.PrestigePanel })), { loading: () => <DynamicPanelFallback /> });
const EventPanel = dynamic(() => import('@/components/game/EventPanel').then(m => ({ default: m.EventPanel })), { loading: () => <DynamicPanelFallback /> });
const BlueprintPanel = dynamic(() => import('@/components/game/BlueprintPanel').then(m => ({ default: m.BlueprintPanel })), { loading: () => <DynamicPanelFallback /> });
const OnboardingPanel = dynamic(() => import('@/components/game/OnboardingPanel').then(m => ({ default: m.OnboardingPanel })), { loading: () => <DynamicPanelFallback /> });
const AchievementPanel = dynamic(() => import('@/components/game/AchievementPanel').then(m => ({ default: m.AchievementPanel })), { loading: () => <DynamicPanelFallback /> });
const MegaProjectPanel = dynamic(() => import('@/components/game/MegaProjectPanel').then(m => ({ default: m.MegaProjectPanel })), { loading: () => <DynamicPanelFallback /> });
const SettingsPanel = dynamic(() => import('@/components/game/SettingsPanel').then(m => ({ default: m.SettingsPanel })), { loading: () => <DynamicPanelFallback /> });
const StatisticsPanel = dynamic(() => import('@/components/game/StatisticsPanel').then(m => m.default), { loading: () => <DynamicPanelFallback /> });
const FactoryMapPanel = dynamic(() => import('@/components/game/FactoryMapPanel').then(m => m.default), { loading: () => <DynamicPanelFallback /> });
import GameToast from '@/components/game/GameToast';
import FloatingNumbers from '@/components/game/FloatingNumbers';
import KeyboardShortcutsHelp from '@/components/game/KeyboardShortcutsHelp';
import AmbientParticles from '@/components/game/AmbientParticles';
const LeaderboardPanel = dynamic(() => import('@/components/game/LeaderboardPanel').then(m => m.default), { loading: () => <DynamicPanelFallback /> });
const DailyRewardsPanel = dynamic(() => import('@/components/game/DailyRewardsPanel').then(m => m.default), { loading: () => <DynamicPanelFallback /> });
const QuestPanel = dynamic(() => import('@/components/game/QuestPanel').then(m => ({ default: m.QuestPanel })), { loading: () => <DynamicPanelFallback /> });
const NotificationCenterPanel = dynamic(() => import('@/components/game/NotificationCenterPanel').then(m => ({ default: m.NotificationCenterPanel })), { loading: () => <DynamicPanelFallback /> });
const PayoutPanel = dynamic(() => import('@/components/game/PayoutPanel').then(m => m.default), { loading: () => <DynamicPanelFallback /> });
const DroneDeliveryPanel = dynamic(() => import('@/components/game/DroneDeliveryPanel').then(m => m.default), { loading: () => <DynamicPanelFallback /> });
const TradingPostPanel = dynamic(() => import('@/components/game/TradingPostPanel').then(m => ({ default: m.TradingPostPanel })), { loading: () => <DynamicPanelFallback /> });
const StoragePanel = dynamic(() => import('@/components/game/StoragePanel').then(m => ({ default: m.StoragePanel })), { loading: () => <DynamicPanelFallback /> });
const GlobalResourceMonitorPanel = dynamic(() => import('@/components/game/GlobalResourceMonitorPanel').then(m => m.default), { loading: () => <DynamicPanelFallback /> });
import {
  Play, Pause, RotateCcw, Bell,
  Download, Upload, Check, Settings,
  Cloud, CloudOff, Loader2, LogOut, LogIn, RefreshCw, Wifi, WifiOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ExportDialog } from '@/components/game/dialogs/ExportDialog';
import { ImportDialog } from '@/components/game/dialogs/ImportDialog';
import { OfflineEarningsDialog } from '@/components/game/dialogs/OfflineEarningsDialog';
import { DesktopHeader } from '@/components/game/headers/DesktopHeader';
import { MobileHeader } from '@/components/game/headers/MobileHeader';
import { TooltipProvider } from '@/components/ui/tooltip';
import { GameSidebar } from '@/components/game/GameSidebar';
import { GameIcon } from '@/components/game/shared/GameIcon';
import { BottomNavigationBar } from '@/components/game/BottomNavigationBar';
import { FloatingActionButton } from '@/components/game/FloatingActionButton';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useAuth } from '@/components/providers/AuthProvider';
import { useCloudSync } from '@/lib/hooks/useCloudSync';
import { OnlineCount } from '@/components/game/OnlineCount';
import { CloudSyncBlockBanner } from '@/components/game/CloudSyncBlockBanner';
import { LoginFloatingPanel } from '@/components/game/LoginFloatingPanel';
import { useLoginPrompt } from '@/lib/hooks/useLoginPrompt';
import { useMergeFlow } from '@/lib/hooks/useMergeFlow';
import { useReducedMotion } from '@/lib/hooks/page/useReducedMotion';
import { useHydrationGuard } from '@/lib/hooks/page/useHydrationGuard';
import { useHeaderHeightObserver } from '@/lib/hooks/page/useHeaderHeightObserver';
import { useOfflineProgressCheck } from '@/lib/hooks/page/useOfflineProgressCheck';
import { useDailyLoginCheck } from '@/lib/hooks/page/useDailyLoginCheck';
import { useDragPrevention } from '@/lib/hooks/page/useDragPrevention';
import { useContextMenuPrevention } from '@/lib/hooks/page/useContextMenuPrevention';
import { useKeyboardShortcuts } from '@/lib/hooks/page/useKeyboardShortcuts';
import { useAutoOpenGuide } from '@/lib/hooks/page/useAutoOpenGuide';
import { useGameTickLoop } from '@/lib/hooks/page/useGameTickLoop';
import { useAutoSaveIndicator } from '@/lib/hooks/page/useAutoSaveIndicator';
import { useTabChange } from '@/lib/hooks/page/useTabChange';
import { useServerMarket } from '@/lib/hooks/useServerMarket';
import { useEffect } from 'react';
import dynamic from 'next/dynamic';
import { GameLoadingSkeleton } from '@/components/game/GameLoadingSkeleton';
import { toast } from 'sonner';
import { AccountSettingsModal } from '@/components/game/AccountSettingsModal';

// Fallback for dynamic panel loading - no props required
function DynamicPanelFallback() {
  if (typeof window === 'undefined') return null;
  return (
    <div
      className="flex items-center justify-center h-64"
      style={{ minHeight: '400px' }}
    >
      <div className="flex flex-col items-center gap-2">
        <div className="w-8 h-8 border-2 border-brand/30 border-t-brand rounded-full animate-spin" />
        <span className="text-[10px] text-muted-label uppercase tracking-wider">Loading panel</span>
      </div>
    </div>
  );
}

export default function Home() {
  // Select only the state slices needed (instead of subscribing to entire store)
  // This prevents re-renders from unrelated state changes (~80% fewer re-renders/tick)
  const gameTick = useGameStore(s => s.gameTick);
  const gameSpeed = useGameStore(s => s.gameSpeed);
  const prestigeSpeedBonus = useGameStore(s => s.prestigeState.bonuses.filter(b => b.purchased && b.effect.type === 'gameSpeed').reduce((sum, b) => sum + b.effect.value, 0));
  const effectiveSpeed = gameSpeed * (1 + prestigeSpeedBonus);
  const paused = useGameStore(s => s.paused);
  const activeTab = useGameStore(s => s.activeTab);
  const transportLines = useGameStore(s => s.transportLines);

  // Get action references (stable across renders)
  const gameTickAction = useGameStore(s => s.gameTickAction);
  const setActiveTab = useGameStore(s => s.setActiveTab);
  const togglePause = useGameStore(s => s.togglePause);
  const setGameSpeed = useGameStore(s => s.setGameSpeed);
  const selectBuilding = useGameStore(s => s.selectBuilding);
  const exportSave = useGameStore(s => s.exportSave);
  const importSave = useGameStore(s => s.importSave);
  const resetGame = useGameStore(s => s.resetGame);
  const calculateOfflineProgress = useGameStore(s => s.calculateOfflineProgress);
  const checkDailyLogin = useGameStore(s => s.checkDailyLogin);
  const loginStreak = useGameStore(s => s.loginStreak);
  const collectPayout = useGameStore(s => s.collectPayout);
  const headerRef = useRef<HTMLElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  // 04.3 Phase 1: Effects → custom hooks
  useReducedMotion();
  const mounted = useHydrationGuard();
  const headerHeight = useHeaderHeightObserver(headerRef, mounted);
  const { offlineData, setOfflineData, offlineDialogOpen, setOfflineDialogOpen } = useOfflineProgressCheck();
  const { dailyRewardDialogOpen, setDailyRewardDialogOpen } = useDailyLoginCheck();
  useDragPrevention();
  useContextMenuPrevention();
  useKeyboardShortcuts();
  useAutoOpenGuide();
  useGameTickLoop(effectiveSpeed, paused);
  useServerMarket();
  const { lastSaveTime, showSavedFlash } = useAutoSaveIndicator();
  const handleTabChange = useTabChange();
  const { signInWithGoogle } = useAuth();
  const { blockedState } = useCloudSync();

  // Save system state (Phase 2 will extract with dialogs)
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [exportString, setExportString] = useState('');
  const [importString, setImportString] = useState('');
  const [importError, setImportError] = useState('');
  const [copiedToClipboard, setCopiedToClipboard] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  // Login prompt system
  const { isOpen: loginPromptOpen, reason: loginPromptReason, promptLogin, closePrompt } = useLoginPrompt();

  // Phase 1.5.5: Toast on ?auth=error
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('auth') === 'error') {
      toast.error('Sign-in failed. Please try again.');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // Phase 1.7: Merge flow (drives the merge dialog)
  const { state: mergeState, confirmMerge, cancelMerge, closeMerge, retryMerge } = useMergeFlow();

  // Phase 1.5.7: Account settings modal
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
      // Fallback: select textarea content
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
  }, [offlineData]);

  const renderPanel = () => {
    switch (activeTab) {
      case 'dashboard': return <DashboardPanel />;
      case 'advisor': return <AIAdvisorPanel />;
      case 'factoryMap': return <FactoryMapPanel />;
      case 'resourceMonitor': return <GlobalResourceMonitorPanel />;
      case 'resources': return <ResourcePanel />;
      case 'factories': return <FactoryPanel />;
      case 'storage': return <StoragePanel />;
      case 'transport': return <TransportPanel />;
      case 'power': return <PowerPanel />;
      case 'market': return <MarketPanel />;
      case 'research': return <ResearchPanel />;
      case 'workers': return <WorkerPanel />;
      case 'contracts': return <ContractPanel />;
      case 'automation': return <AutomationPanel />;
      case 'prestige': return <PrestigePanel />;
      case 'events': return <EventPanel />;
      case 'megaprojects': return <MegaProjectPanel />;
      case 'statistics': return <StatisticsPanel />;
      case 'blueprints': return <BlueprintPanel />;
      case 'guide': return <OnboardingPanel />;
      case 'achievements': return <AchievementPanel />;
      case 'leaderboard': return <LeaderboardPanel />;
      case 'dailyRewards': return <DailyRewardsPanel />;
      case 'payouts': return <PayoutPanel />;
      case 'droneDelivery': return <DroneDeliveryPanel />;
      case 'tradePost': return <TradingPostPanel />;
      case 'quests': return <QuestPanel />;
      case 'notifications': return <NotificationCenterPanel />;
      case 'settings': return <SettingsPanel />;
      default: return <DashboardPanel />;
    }
  };


  // Show loading skeleton during SSR to prevent hydration mismatch
  // Zustand persist rehydrates from localStorage on client, causing different initial state
  if (!mounted) {
    return <GameLoadingSkeleton headerHeight={headerHeight} />;
  }

  return (
    <ErrorBoundary>
    <TooltipProvider>
      {/* Cloud Sync Block Banner - full screen overlay when account is locked/sync blocked */}
      {blockedState?.isBlocked && (
        <CloudSyncBlockBanner
          blockedState={blockedState}
          onSignInAgain={blockedState.code === 'SESSION_EXPIRED' ? signInWithGoogle : undefined}
        />
      )}
      <div className="h-screen flex flex-col bg-background text-subtle overflow-hidden safe-area-container">
        <header ref={headerRef} className="fixed top-0 left-0 right-0 z-50 top-bar-gradient border-b border-brand/30 px-2 lg:px-3 py-1.5 lg:py-2 focus:outline-none" style={{ paddingTop: 'calc(0.375rem + env(safe-area-inset-top, 0px))' }} aria-label="Game header">
          <DesktopHeader
            onExport={handleExport}
            onImport={handleImport}
            onReset={handleReset}
            onTabChange={handleTabChange}
            onManageAccount={() => setAccountSettingsOpen(true)}
          />
          <MobileHeader
            onExport={handleExport}
            onImport={handleImport}
            onReset={handleReset}
            onTabChange={handleTabChange}
            onManageAccount={() => setAccountSettingsOpen(true)}
          />
        </header>

        {/* Spacer for fixed header — height tracks header dynamically via ResizeObserver */}
        <div className="flex-shrink-0" style={{ height: headerHeight }} />

        {/* MAIN CONTENT */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* SIDEBAR NAV - desktop only (grouped categories) */}
          <GameSidebar activeTab={activeTab} onTabChange={handleTabChange} />

          {/* PANEL AREA */}
          <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden game-scrollbar p-2 sm:p-3 lg:p-4 game-grid-bg relative pb-28 lg:pb-4">
            <AmbientParticles />
            <div className="relative z-10 game-content-appear" key={activeTab}>
              {renderPanel()}
            </div>
          </main>
        </div>

        {/* Fixed bottom navigation (mobile only) */}
        <BottomNavigationBar activeTab={activeTab} onTabChange={handleTabChange} />

        {/* Floating action button (mobile only) */}
        <FloatingActionButton onTabChange={handleTabChange} />

        {/* Floating production numbers */}
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

      {/* Toast notifications */}
      <GameToast />

      {/* Login Floating Panel (also drives merge dialog via mergeState) */}
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

      {/* Account Settings Modal */}
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
