'use client';

import { useCallback, useRef, useState } from 'react';
import { useGameStore, formatNumber } from '@/lib/game/store';
import { BUILDING_DEFS, WEATHER_DEFS } from '@/lib/game/configCache';
import { GameTab, ResourceType } from '@/lib/game/types';
import { DashboardPanel } from '@/components/game/DashboardPanel';
import { ResourcePanel } from '@/components/game/ResourcePanel';
import { FactoryPanel } from '@/components/game/FactoryPanel';
import { TransportPanel } from '@/components/game/TransportPanel';
import { PowerPanel } from '@/components/game/PowerPanel';
import { MarketPanel } from '@/components/game/MarketPanel';
import { ResearchPanel } from '@/components/game/ResearchPanel';
import { WorkerPanel } from '@/components/game/WorkerPanel';
import { ContractPanel } from '@/components/game/ContractPanel';
import { AutomationPanel } from '@/components/game/AutomationPanel';
import { PrestigePanel } from '@/components/game/PrestigePanel';
import { EventPanel } from '@/components/game/EventPanel';
import { BlueprintPanel } from '@/components/game/BlueprintPanel';
import { OnboardingPanel } from '@/components/game/OnboardingPanel';
import { AchievementPanel } from '@/components/game/AchievementPanel';
import { MegaProjectPanel } from '@/components/game/MegaProjectPanel';
import { SettingsPanel } from '@/components/game/SettingsPanel';
import StatisticsPanel from '@/components/game/StatisticsPanel';
import FactoryMapPanel from '@/components/game/FactoryMapPanel';
import GameToast from '@/components/game/GameToast';
import FloatingNumbers from '@/components/game/FloatingNumbers';
import KeyboardShortcutsHelp from '@/components/game/KeyboardShortcutsHelp';
import AmbientParticles from '@/components/game/AmbientParticles';
import LeaderboardPanel from '@/components/game/LeaderboardPanel';
import DailyRewardsPanel from '@/components/game/DailyRewardsPanel';
import { QuestPanel } from '@/components/game/QuestPanel';
import { NotificationCenterPanel } from '@/components/game/NotificationCenterPanel';
import { PayoutPanel } from '@/components/game/PayoutPanel';
import DroneDeliveryPanel from '@/components/game/DroneDeliveryPanel';
import { TradingPostPanel } from '@/components/game/TradingPostPanel';
import { StoragePanel } from '@/components/game/StoragePanel';
import GlobalResourceMonitorPanel from '@/components/game/GlobalResourceMonitorPanel';
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
import { GameLoadingSkeleton } from '@/components/game/GameLoadingSkeleton';
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

  // Login prompt system
  const { isOpen: loginPromptOpen, reason: loginPromptReason, promptLogin, closePrompt } = useLoginPrompt();

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
    if (confirm('Are you sure you want to reset? All progress will be lost!')) {
      resetGame();
    }
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

  const powerPercent = 0; // unused after header extraction (DesktopHeader computes internally)

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
      <div className="h-screen flex flex-col bg-[#0a0e17] text-subtle overflow-hidden safe-area-container">
        <header ref={headerRef} className="fixed top-0 left-0 right-0 z-50 top-bar-gradient border-b border-cyan-900/30 px-2 lg:px-3 py-1.5 lg:py-2" style={{ paddingTop: 'calc(0.375rem + env(safe-area-inset-top, 0px))' }}>
          <DesktopHeader
            onExport={handleExport}
            onImport={handleImport}
            onReset={handleReset}
            onTabChange={handleTabChange}
          />
          <MobileHeader
            onExport={handleExport}
            onImport={handleImport}
            onReset={handleReset}
            onTabChange={handleTabChange}
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

      {/* Login Floating Panel */}
      <LoginFloatingPanel
        open={loginPromptOpen}
        reason={loginPromptReason}
        onClose={closePrompt}
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
