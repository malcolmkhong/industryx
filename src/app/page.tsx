'use client';

import { useEffect, useCallback, useRef, useState } from 'react';
import { useGameStore, formatNumber } from '@/lib/game/store';
import { BUILDING_DEFS, RESOURCE_META, WEATHER_DEFS } from '@/lib/game/data';
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
import {
  Play, Pause, RotateCcw, Bell, X,
  Download, Upload, Copy, Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { GameSidebar, MobileNav, KEY_TAB_MAP } from '@/components/game/GameSidebar';

// Navigation is now managed by GameSidebar component
// KEY_TAB_MAP is imported from GameSidebar

const SPEED_OPTIONS = [1, 2, 5, 10];

export default function Home() {
  const store = useGameStore();
  const tickRef = useRef<NodeJS.Timeout | null>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const hasAutoOpenedGuide = useRef(false);

  // Hydration guard: prevent rendering dynamic game UI during SSR
  // This avoids hydration mismatch because Zustand persist rehydrates from localStorage on client
  // Using a slightly longer delay (50ms) ensures Zustand persist has fully rehydrated
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(t);
  }, []);

  // Save system state
  const [lastSaveTime, setLastSaveTime] = useState<number | null>(null);
  const [showSavedFlash, setShowSavedFlash] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [exportString, setExportString] = useState('');
  const [importString, setImportString] = useState('');
  const [importError, setImportError] = useState('');
  const [copiedToClipboard, setCopiedToClipboard] = useState(false);
  const prevGameTickRef = useRef(store.gameTick);
  const prevMoneyRef = useRef(store.money);
  const [moneyGlow, setMoneyGlow] = useState(false);

  // Offline earnings state
  const [offlineDialogOpen, setOfflineDialogOpen] = useState(false);
  const [offlineData, setOfflineData] = useState<{ resources: Record<string, number>; money: number; ticksElapsed: number } | null>(null);
  const hasCheckedOffline = useRef(false);

  // Daily rewards auto-popup state
  const [dailyRewardDialogOpen, setDailyRewardDialogOpen] = useState(false);
  const hasCheckedDailyLogin = useRef(false);

  // Check for offline progress on mount (after rehydration)
  useEffect(() => {
    if (hasCheckedOffline.current) return;
    // Wait for store to be rehydrated (gameTick > 0 means a save exists)
    if (store.gameTick === 0 && store.buildings.length === 0) {
      hasCheckedOffline.current = true;
      return;
    }
    hasCheckedOffline.current = true;
    const result = store.calculateOfflineProgress();
    if (result && (result.money > 0 || Object.values(result.resources).some(v => v > 0))) {
      // Defer state updates to avoid cascading renders
      const timer = setTimeout(() => {
        setOfflineData(result);
        setOfflineDialogOpen(true);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [store]);

  // Check daily login on mount
  useEffect(() => {
    if (hasCheckedDailyLogin.current) return;
    hasCheckedDailyLogin.current = true;
    const timer = setTimeout(() => {
      store.checkDailyLogin();
      // Check if today's reward is unclaimed
      const ls = store.loginStreak;
      const currentDay = ((ls.currentStreak - 1) % 7) + 1;
      const todayReward = ls.weeklyRewards.find(r => r.day === currentDay && !r.claimed);
      if (todayReward) {
        setDailyRewardDialogOpen(true);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [store]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input/textarea
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      // Number keys 1-9: switch tabs
      if (KEY_TAB_MAP[e.key]) {
        e.preventDefault();
        store.setActiveTab(KEY_TAB_MAP[e.key]);
        return;
      }

      // Space: toggle pause
      if (e.key === ' ') {
        e.preventDefault();
        store.togglePause();
        return;
      }

      // + / = : increase speed
      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        const currentIdx = SPEED_OPTIONS.indexOf(store.gameSpeed);
        const nextIdx = Math.min(SPEED_OPTIONS.length - 1, currentIdx + 1);
        store.setGameSpeed(SPEED_OPTIONS[nextIdx]);
        return;
      }

      // - : decrease speed
      if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        const currentIdx = SPEED_OPTIONS.indexOf(store.gameSpeed);
        const prevIdx = Math.max(0, currentIdx - 1);
        store.setGameSpeed(SPEED_OPTIONS[prevIdx]);
        return;
      }

      // Escape: deselect building
      if (e.key === 'Escape') {
        store.selectBuilding(null);
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [store]);

  // Auto-open Guide for new players
  useEffect(() => {
    if (!hasAutoOpenedGuide.current && store.buildings.length === 0 && store.gameTick < 5) {
      hasAutoOpenedGuide.current = true;
      store.setActiveTab('guide');
    }
  }, [store.buildings.length, store.gameTick]);

  // Game tick loop
  useEffect(() => {
    const speed = store.gameSpeed;
    const interval = Math.max(50, 1000 / speed);

    if (tickRef.current) clearInterval(tickRef.current);
    if (!store.paused) {
      tickRef.current = setInterval(() => {
        store.gameTickAction();
      }, interval);
    }

    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [store.gameSpeed, store.paused, store.gameTick]);

  // Auto-save indicator: detect when Zustand persists (gameTick changes)
  useEffect(() => {
    if (prevGameTickRef.current !== store.gameTick && store.gameTick > 0) {
      // Show save indicator every 50 ticks
      if (store.gameTick % 50 === 0) {
        const now = Date.now();
        // Use setTimeout to defer state updates out of the effect body
        const t1 = setTimeout(() => setLastSaveTime(now), 0);
        const t2 = setTimeout(() => setShowSavedFlash(true), 0);
        const t3 = setTimeout(() => setShowSavedFlash(false), 2000);
        return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
      }
    }
    prevGameTickRef.current = store.gameTick;
  }, [store.gameTick]);

  // Money glow effect when money increases significantly
  useEffect(() => {
    if (store.money > prevMoneyRef.current + 10) {
      const t1 = setTimeout(() => setMoneyGlow(true), 0);
      const t2 = setTimeout(() => setMoneyGlow(false), 1000);
      prevMoneyRef.current = store.money;
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
    prevMoneyRef.current = store.money;
  }, [store.money]);

  const handleExport = useCallback(() => {
    const saveStr = store.exportSave();
    setExportString(saveStr);
    setExportDialogOpen(true);
    setCopiedToClipboard(false);
  }, [store]);

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
    const success = store.importSave(importString.trim());
    if (success) {
      setImportDialogOpen(false);
      setImportString('');
      setImportError('');
    } else {
      setImportError('Invalid save data. Please check your save string and try again.');
    }
  }, [store, importString]);

  const handleReset = useCallback(() => {
    if (confirm('Are you sure you want to reset? All progress will be lost!')) {
      store.resetGame();
    }
  }, [store]);

  const unreadNotifications = store.notifications.filter(n => !n.read).length;

  const renderPanel = () => {
    switch (store.activeTab) {
      case 'dashboard': return <DashboardPanel />;
      case 'factoryMap': return <FactoryMapPanel />;
      case 'resources': return <ResourcePanel />;
      case 'factories': return <FactoryPanel />;
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
      case 'quests': return <QuestPanel />;
      case 'notifications': return <NotificationCenterPanel />;
      case 'settings': return <SettingsPanel />;
      default: return <DashboardPanel />;
    }
  };

  const powerPercent = store.powerGrid.totalConsumption > 0
    ? Math.min(100, (store.powerGrid.totalProduction / store.powerGrid.totalConsumption) * 100)
    : store.powerGrid.totalProduction > 0 ? 100 : 0;

  // Compute income per minute estimate for tooltip
  const incomePerMinute = (() => {
    const activeBuildings = store.buildings.filter(b => b.active);
    const extractors = activeBuildings.filter(b => BUILDING_DEFS[b.type]?.category === 'extractor');
    const factories = activeBuildings.filter(b => BUILDING_DEFS[b.type]?.category === 'factory');
    const powerPlants = activeBuildings.filter(b => BUILDING_DEFS[b.type]?.category === 'power');
    const extractorRate = 2;
    const factoryRate = 5;
    const powerRate = 1;
    const extractorIncome = extractors.reduce((sum, b) => sum + extractorRate * b.level * b.efficiency, 0);
    const factoryIncome = factories.reduce((sum, b) => sum + factoryRate * b.level * b.efficiency, 0);
    const powerIncome = powerPlants.reduce((sum, b) => sum + powerRate * b.level * b.efficiency, 0);
    const rawPayoutPerCycle = (extractorIncome + factoryIncome + powerIncome) * store.powerGrid.efficiency * store.gameSpeed;
    const cyclesPerMinute = (60 / (store.payoutConfig.basePayoutInterval / store.gameSpeed));
    return Math.floor(rawPayoutPerCycle * cyclesPerMinute);
  })();

  // Compute overall factory efficiency for indicator
  const factoryEfficiency = (() => {
    const activeBuildings = store.buildings.filter(b => b.active);
    if (activeBuildings.length === 0) return 0;
    return activeBuildings.reduce((sum, b) => sum + b.efficiency, 0) / activeBuildings.length * store.powerGrid.efficiency;
  })();

  // Show loading skeleton during SSR to prevent hydration mismatch
  // Zustand persist rehydrates from localStorage on client, causing different initial state
  if (!mounted) {
    return (
      <div className="min-h-screen flex flex-col bg-[#0a0e17] text-gray-100 overflow-hidden safe-area-container">
        <header className="sticky top-0 z-50 border-b border-cyan-900/30 px-2 lg:px-3 py-1.5 lg:py-2">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500 to-teal-600 flex items-center justify-center text-base font-bold shadow-[0_0_12px_rgba(0,255,242,0.2)]">
              FD
            </div>
            <div>
              <h1 className="text-sm font-bold text-cyan-400 tracking-wider">FACTORY DOMINION</h1>
              <p className="text-[10px] text-gray-500 -mt-0.5">Automated Empire</p>
            </div>
            <div className="flex items-center gap-3 ml-4">
              <div className="h-5 w-24 bg-gray-800/60 rounded shimmer-loading" />
              <div className="h-5 w-20 bg-gray-800/60 rounded shimmer-loading" />
              <div className="h-5 w-16 bg-gray-800/60 rounded shimmer-loading" />
            </div>
          </div>
        </header>
        <div className="flex flex-1 overflow-hidden">
          <nav className="hidden lg:block w-44 flex-shrink-0 bg-[#0d1220] border-r border-cyan-900/20">
            <div className="flex flex-col py-1 gap-1 px-3">
              {[1,2,3,4,5,6,7,8].map(i => (
                <div key={i} className="h-8 bg-gray-800/30 rounded shimmer-loading" />
              ))}
            </div>
          </nav>
          <main className="flex-1 p-4 flex items-center justify-center">
            <div className="text-center loading-skeleton-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-xl bg-gradient-to-br from-cyan-500/20 to-teal-600/20 flex items-center justify-center text-3xl loading-icon-pulse">
                🏭
              </div>
              <p className="text-cyan-400 font-bold text-lg">Loading Factory...</p>
              <p className="text-gray-500 text-xs mt-1">Initializing industrial empire</p>
              <div className="mt-4 w-48 h-1 bg-gray-800 rounded-full overflow-hidden mx-auto">
                <div className="h-full bg-gradient-to-r from-cyan-600 to-teal-500 rounded-full loading-progress-bar" />
              </div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="min-h-screen flex flex-col bg-[#0a0e17] text-gray-100 overflow-hidden safe-area-container">
        {/* TOP BAR */}
        <header className="sticky top-0 z-50 top-bar-gradient border-b border-cyan-900/30 px-2 lg:px-3 py-1.5 lg:py-2">
          {/* Desktop header row */}
          <div className="hidden lg:flex items-center justify-between gap-4 flex-wrap">
            {/* Logo & Money */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500 to-teal-600 flex items-center justify-center text-base font-bold shadow-[0_0_12px_rgba(0,255,242,0.2)]">
                  FD
                </div>
                <div>
                  <h1 className="text-sm font-bold text-cyan-400 neon-glow-cyan tracking-wider">FACTORY DOMINION</h1>
                  <p className="text-[10px] text-gray-500 -mt-0.5">Automated Empire</p>
                </div>
              </div>
              {/* Separator */}
              <div className="stat-badge-separator" />
              <div className="flex items-center gap-4 text-xs">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className={`stat-badge stat-badge-money bg-[#111827] rounded-lg px-3 py-1.5 border border-cyan-900/20 cursor-default ${moneyGlow ? 'money-glow' : ''}`}>
                      <span className="text-gray-500">💰 </span>
                      <span className="text-green-400 font-mono font-bold text-sm">${formatNumber(store.money)}</span>
                      {store.pendingPayout > 0 && !store.payoutConfig.autoCollect && (
                        <button
                          onClick={store.collectPayout}
                          className="ml-2 animate-pulse inline-flex items-center gap-1 bg-green-900/40 hover:bg-green-800/50 text-green-400 text-[10px] px-1.5 py-0.5 rounded-md border border-green-500/30 transition-colors"
                          title="Click to collect pending payout"
                        >
                          💰 ${formatNumber(store.pendingPayout)}
                        </button>
                      )}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="w-64 bg-[#111827] border-cyan-900/30 p-0 overflow-hidden">
                    <div className="bg-gradient-to-r from-green-900/30 to-emerald-900/20 px-3 py-2 border-b border-cyan-900/20">
                      <p className="text-xs font-bold text-green-300">💰 Financial Overview</p>
                    </div>
                    <div className="px-3 py-2 space-y-1.5">
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-400">Current Balance</span>
                        <span className="text-green-400 font-mono font-bold">${formatNumber(store.money)}</span>
                      </div>
                      {store.pendingPayout > 0 && (
                        <div className="flex justify-between text-xs">
                          <span className="text-gray-400">Pending Payout</span>
                          <span className="text-yellow-400 font-mono">${formatNumber(store.pendingPayout)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-400">Income/min</span>
                        <span className="text-cyan-400 font-mono">~${formatNumber(incomePerMinute)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-400">Total Earned</span>
                        <span className="text-emerald-400 font-mono">${formatNumber(store.totalMoneyEarned)}</span>
                      </div>
                    </div>
                  </TooltipContent>
                </Tooltip>
                <div className={`stat-badge stat-badge-power bg-[#111827] rounded-lg px-3 py-1.5 border border-cyan-900/20 cursor-default ${store.powerGrid.overload ? 'warning-pulse' : ''}`}>
                  <span className="text-gray-500">⚡ </span>
                  <span className={`text-sm ${powerPercent >= 80 ? 'text-yellow-400' : powerPercent >= 50 ? 'text-orange-400' : 'text-red-400'}`}>
                    {formatNumber(store.powerGrid.totalProduction)}MW
                  </span>
                  <span className="text-gray-600"> / </span>
                  <span className="text-gray-400 text-sm">{formatNumber(store.powerGrid.totalConsumption)}MW</span>
                  {/* Efficiency indicator dot */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span
                        className={`ml-1.5 inline-block w-2 h-2 rounded-full ${
                          factoryEfficiency >= 0.8
                            ? 'bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.6)]'
                            : factoryEfficiency >= 0.5
                              ? 'bg-yellow-400 shadow-[0_0_6px_rgba(250,204,21,0.6)]'
                              : 'bg-red-400 shadow-[0_0_6px_rgba(248,113,113,0.6)]'
                        } ${store.buildings.filter(b => b.active).length > 0 ? 'animate-pulse' : ''}`}
                      />
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="bg-[#111827] border-cyan-900/30">
                      <p className="text-xs font-semibold mb-1" style={{ color: factoryEfficiency >= 0.8 ? '#4ade80' : factoryEfficiency >= 0.5 ? '#facc15' : '#f87171' }}>
                        Factory Efficiency: {(factoryEfficiency * 100).toFixed(0)}%
                      </p>
                      <p className="text-[10px] text-gray-400">
                        {factoryEfficiency >= 0.8 ? 'Running smoothly!' : factoryEfficiency >= 0.5 ? 'Some buildings need attention' : 'Critical: Check power & buildings'}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                {/* Separator */}
                <div className="stat-badge-separator" />
                <div className="stat-badge stat-badge-rp bg-[#111827] rounded-lg px-3 py-1.5 border border-cyan-900/20 cursor-default">
                  <span className="text-gray-500">🔬 </span>
                  <span className="text-purple-400 font-mono text-sm">{formatNumber(store.researchPoints)} RP</span>
                </div>
                <div className="stat-badge stat-badge-cp bg-[#111827] rounded-lg px-3 py-1.5 border border-cyan-900/20 cursor-default">
                  <span className="text-gray-500">🏢 </span>
                  <span className="text-fuchsia-400 font-mono text-sm">{store.prestigeState.corporationPoints} CP</span>
                </div>
              </div>
            </div>

            {/* Right controls */}
            <div className="flex items-center gap-2">
              {/* Power bar */}
              <div className="w-24 h-2 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 ${
                    powerPercent >= 80 ? 'bg-green-500' : powerPercent >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${powerPercent}%` }}
                />
              </div>

              {/* Speed controls */}
              <div className="flex items-center bg-[#111827] rounded-lg border border-cyan-900/20 overflow-hidden">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={store.togglePause}
                  aria-label={store.paused ? "Resume game" : "Pause game"}
                >
                  {store.paused ? <Play className="w-3 h-3 text-green-400" /> : <Pause className="w-3 h-3 text-yellow-400" />}
                </Button>
                {[1, 2, 5, 10].map(speed => (
                  <Button
                    key={speed}
                    variant="ghost"
                    size="sm"
                    className={`h-7 px-2 text-xs ${store.gameSpeed === speed ? 'text-cyan-400 bg-cyan-900/20' : 'text-gray-500'}`}
                    onClick={() => store.setGameSpeed(speed)}
                  >
                    {speed}x
                  </Button>
                ))}
              </div>

              {/* Tick counter */}
              <div className="text-[10px] text-gray-500 font-mono">
                Tick: {formatNumber(store.gameTick)}
              </div>

              {/* Notifications */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 relative" aria-label="Notifications">
                    <Bell className="w-3.5 h-3.5 text-gray-400" />
                    {unreadNotifications > 0 && (
                      <span className={`absolute -top-0.5 -right-0.5 h-4 rounded-full text-[8px] text-white flex items-center justify-center px-1 ${
                        store.notifications[0]?.type === 'error' ? 'bg-red-500' :
                        store.notifications[0]?.type === 'warning' ? 'bg-orange-500' :
                        'bg-cyan-500'
                      }`}>
                        {unreadNotifications > 9 ? '9+' : unreadNotifications}
                      </span>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="w-80 max-h-60 overflow-y-auto game-scrollbar bg-[#111827] border-cyan-900/30">
                  {store.notifications.length === 0 ? (
                    <p className="text-xs text-gray-500">No notifications</p>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 mb-2 pb-1.5 border-b border-gray-800">
                        <Bell className="w-3 h-3 text-gray-400" />
                        <span className="text-[10px] font-semibold text-gray-300">
                          {unreadNotifications > 0 ? `${unreadNotifications} New ${store.notifications[0]?.type === 'error' ? 'Alert' : store.notifications[0]?.type === 'warning' ? 'Warning' : 'Event'}${unreadNotifications > 1 ? 's' : ''}` : 'No New Notifications'}
                        </span>
                      </div>
                      {store.notifications.slice(0, 10).map(n => (
                        <div key={n.id} className={`text-xs py-1 border-b border-gray-800 last:border-0 ${
                          n.type === 'success' ? 'text-green-400' :
                          n.type === 'warning' ? 'text-yellow-400' :
                          n.type === 'error' ? 'text-red-400' : 'text-gray-400'
                        }`}>
                          {n.message}
                        </div>
                      ))}
                    </>
                  )}
                </TooltipContent>
              </Tooltip>

              {/* Active events */}
              {store.activeEvents.length > 0 && (
                <div className="flex items-center gap-1">
                  {store.activeEvents.map(e => (
                    <Tooltip key={e.id}>
                      <TooltipTrigger asChild>
                        <Badge variant="outline" className="text-[10px] border-orange-500/50 text-orange-400 bg-orange-900/20 px-1.5 py-0 neon-pulse">
                          {e.emoji} {e.remaining <= 50 ? `${e.remaining}t` : e.name}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="bg-[#111827] border-cyan-900/30">
                        <p className="text-xs font-medium text-orange-300">{e.name}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">{e.description}</p>
                        <p className="text-[10px] text-gray-500 mt-1">Remaining: {e.remaining} ticks</p>
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </div>
              )}

              {/* Weather indicator - always visible */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${
                    store.weather.current === 'clear'
                      ? 'border-gray-700 text-gray-500 bg-gray-900/20'
                      : 'border-sky-500/50 text-sky-400 bg-sky-900/20'
                  }`}>
                    {WEATHER_DEFS[store.weather.current]?.emoji} {WEATHER_DEFS[store.weather.current]?.name}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="bg-[#111827] border-cyan-900/30">
                  <p className="text-xs font-medium text-sky-300">{WEATHER_DEFS[store.weather.current]?.name}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">{WEATHER_DEFS[store.weather.current]?.description}</p>
                  {store.weather.remaining > 0 && <p className="text-[10px] text-gray-500 mt-1">Remaining: {store.weather.remaining} ticks</p>}
                  {store.weather.current === 'clear' && <p className="text-[10px] text-gray-500 mt-1">Weather changes over time and affects production</p>}
                </TooltipContent>
              </Tooltip>

              {/* Auto-save indicator */}
              <div className={`flex items-center gap-1 text-[10px] transition-opacity duration-500 ${showSavedFlash ? 'opacity-100' : 'opacity-40'}`}>
                <Check className={`w-3 h-3 transition-colors duration-300 ${showSavedFlash ? 'text-green-400' : 'text-gray-600'}`} />
                <span className={showSavedFlash ? 'text-green-400' : 'text-gray-600'}>Saved</span>
              </div>

              {/* Export save */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-gray-500 hover:text-cyan-400" onClick={handleExport} aria-label="Export save">
                    <Download className="w-3 h-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="bg-[#111827] border-cyan-900/30">
                  <p className="text-xs">Export Save</p>
                </TooltipContent>
              </Tooltip>

              {/* Import save */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-gray-500 hover:text-cyan-400" onClick={handleImport} aria-label="Import save">
                    <Upload className="w-3 h-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="bg-[#111827] border-cyan-900/30">
                  <p className="text-xs">Import Save</p>
                </TooltipContent>
              </Tooltip>

              {/* Reset */}
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-gray-500" onClick={handleReset} aria-label="Reset game">
                <RotateCcw className="w-3 h-3" />
              </Button>
            </div>
          </div>

          {/* Mobile header - compact two rows */}
          <div className="flex lg:hidden flex-col gap-1">
            {/* Row 1: Logo + compact stats + controls */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <div className="w-7 h-7 rounded-md bg-gradient-to-br from-cyan-500 to-teal-600 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                  FD
                </div>
                <span className="text-[11px] font-bold text-cyan-400 tracking-wider truncate">FACTORY DOMINION</span>
              </div>

              {/* Compact stats */}
              <div className="flex items-center gap-1 text-[10px] flex-shrink-0">
                <span className="text-green-400 font-mono font-bold">${formatNumber(store.money)}</span>
                {store.pendingPayout > 0 && !store.payoutConfig.autoCollect && (
                  <button
                    onClick={store.collectPayout}
                    className="animate-pulse inline-flex items-center bg-green-900/40 text-green-400 text-[9px] px-1 py-0 rounded border border-green-500/30"
                    title="Click to collect pending payout"
                  >
                    💰${formatNumber(store.pendingPayout)}
                  </button>
                )}
                <span className="text-gray-600">|</span>
                <span className={powerPercent >= 80 ? 'text-yellow-400' : powerPercent >= 50 ? 'text-orange-400' : 'text-red-400'}>
                  ⚡{formatNumber(store.powerGrid.totalProduction)}/{formatNumber(store.powerGrid.totalConsumption)}
                </span>
                <span className="text-gray-600">|</span>
                <span className="text-purple-400 font-mono">🔬{formatNumber(store.researchPoints)}</span>
              </div>
            </div>

            {/* Row 2: Speed controls + actions */}
            <div className="flex items-center justify-between gap-1">
              {/* Speed controls - compact */}
              <div className="flex items-center bg-[#111827] rounded-md border border-cyan-900/20 overflow-hidden">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 min-w-[24px] flex items-center justify-center"
                  onClick={store.togglePause}
                  aria-label={store.paused ? "Resume game" : "Pause game"}
                >
                  {store.paused ? <Play className="w-3 h-3 text-green-400" /> : <Pause className="w-3 h-3 text-yellow-400" />}
                </Button>
                {[1, 2, 5, 10].map(speed => (
                  <Button
                    key={speed}
                    variant="ghost"
                    size="sm"
                    className={`h-6 px-1.5 text-[10px] min-w-[28px] min-h-[24px] ${store.gameSpeed === speed ? 'text-cyan-400 bg-cyan-900/20' : 'text-gray-500'}`}
                    onClick={() => store.setGameSpeed(speed)}
                  >
                    {speed}x
                  </Button>
                ))}
              </div>

              {/* Power bar - compact */}
              <div className="w-16 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 ${
                    powerPercent >= 80 ? 'bg-green-500' : powerPercent >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${powerPercent}%` }}
                />
              </div>

              {/* Auto-save icon only */}
              <Check className={`w-3 h-3 transition-colors duration-300 ${showSavedFlash ? 'text-green-400' : 'text-gray-600'}`} />

              {/* Notification bell */}
              <div className="relative" role="status" aria-label="Notifications">
                <Bell className="w-3.5 h-3.5 text-gray-400" />
                {unreadNotifications > 0 && (
                  <span className="absolute -top-1 -right-1.5 w-3 h-3 bg-red-500 rounded-full text-[7px] text-white flex items-center justify-center">
                    {unreadNotifications > 9 ? '9+' : unreadNotifications}
                  </span>
                )}
              </div>

              {/* Active events badge */}
              {store.activeEvents.length > 0 && (
                <Badge variant="outline" className="text-[9px] border-orange-500/50 text-orange-400 bg-orange-900/20 px-1 py-0 h-5">
                  {store.activeEvents[0].emoji} {store.activeEvents.length}
                </Badge>
              )}

              {/* Weather badge - mobile */}
              <Badge variant="outline" className={`text-[9px] px-1 py-0 h-5 ${
                store.weather.current === 'clear'
                  ? 'border-gray-700 text-gray-500 bg-gray-900/20'
                  : 'border-sky-500/50 text-sky-400 bg-sky-900/20'
              }`}>
                {WEATHER_DEFS[store.weather.current]?.emoji}
              </Badge>

              {/* Export */}
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 min-w-[24px] text-gray-500" onClick={handleExport} aria-label="Export save">
                <Download className="w-3 h-3" />
              </Button>

              {/* Import */}
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 min-w-[24px] text-gray-500" onClick={handleImport} aria-label="Import save">
                <Upload className="w-3 h-3" />
              </Button>

              {/* Reset */}
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 min-w-[24px] text-gray-500" onClick={handleReset} aria-label="Reset game">
                <RotateCcw className="w-3 h-3" />
              </Button>
            </div>
          </div>
        </header>

        {/* News Ticker - desktop only */}
        <div className="hidden lg:block bg-[#0a0e17] border-b border-cyan-900/20 overflow-hidden h-6">
          <div className="flex items-center h-full px-3">
            <span className="text-[10px] text-cyan-400 font-bold mr-3 flex-shrink-0">📰 NEWS</span>
            <div className="overflow-hidden flex-1 relative">
              <div className="news-ticker-content text-[10px] text-gray-400">
                {store.notifications.slice(0, 8).map((n, i) => (
                  <span key={n.id}>
                    {i > 0 && <span className="text-cyan-700 mx-3">•</span>}
                    {n.message}
                  </span>
                ))}
                {store.notifications.length === 0 && 'Welcome to Factory Dominion! Build your first Mining Drill to start producing resources.'}
              </div>
            </div>
          </div>
        </div>

        {/* MAIN CONTENT */}
        <div className="flex flex-1 overflow-hidden">
          {/* SIDEBAR NAV - desktop only (grouped categories) */}
          <GameSidebar activeTab={store.activeTab} onTabChange={store.setActiveTab} />

          {/* PANEL AREA */}
          <main className="flex-1 overflow-y-auto game-scrollbar p-2 lg:p-4 game-grid-bg relative">
            <AmbientParticles />
            <div className="relative z-10 game-content-appear" key={store.activeTab}>
              {renderPanel()}
            </div>
          </main>
        </div>

        {/* MOBILE NAVIGATION - category-based instead of More overflow */}
        <MobileNav activeTab={store.activeTab} onTabChange={store.setActiveTab} />

        {/* Floating production numbers */}
        <FloatingNumbers />
        <KeyboardShortcutsHelp />
      </div>

      {/* Export Save Dialog - full-screen on mobile */}
      <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
        <DialogContent className="bg-[#111827] border-cyan-900/30 text-gray-100 max-w-lg w-[calc(100%-1rem)] lg:w-full h-auto lg:h-auto max-h-[90vh] lg:max-h-none p-4 lg:p-6">
          <DialogHeader>
            <DialogTitle className="text-cyan-400 flex items-center gap-2 text-sm lg:text-base">
              <Download className="w-4 h-4" /> Export Save
            </DialogTitle>
            <DialogDescription className="text-gray-400 text-xs lg:text-sm">
              Copy your save data below to back up your progress or transfer to another device.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea
              readOnly
              value={exportString}
              className="bg-[#0a0e17] border-cyan-900/20 text-xs font-mono text-gray-300 min-h-24 lg:min-h-32 max-h-36 lg:max-h-48 game-scrollbar"
              onClick={(e) => (e.target as HTMLTextAreaElement).select()}
            />
            <div className="flex items-center gap-2">
              <Button
                onClick={handleCopyToClipboard}
                className="flex-1 bg-cyan-600 hover:bg-cyan-700 text-white min-h-[44px] lg:min-h-0"
                size="sm"
              >
                {copiedToClipboard ? (
                  <>
                    <Check className="w-3.5 h-3.5 mr-1" /> Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 mr-1" /> Copy to Clipboard
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => setExportDialogOpen(false)}
                className="border-gray-700 text-gray-400 hover:text-gray-200 min-h-[44px] lg:min-h-0"
                size="sm"
              >
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Import Save Dialog - full-screen on mobile */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="bg-[#111827] border-cyan-900/30 text-gray-100 max-w-lg w-[calc(100%-1rem)] lg:w-full h-auto lg:h-auto max-h-[90vh] lg:max-h-none p-4 lg:p-6">
          <DialogHeader>
            <DialogTitle className="text-cyan-400 flex items-center gap-2 text-sm lg:text-base">
              <Upload className="w-4 h-4" /> Import Save
            </DialogTitle>
            <DialogDescription className="text-gray-400 text-xs lg:text-sm">
              Paste your save data below to restore progress. This will overwrite your current game!
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea
              value={importString}
              onChange={(e) => { setImportString(e.target.value); setImportError(''); }}
              placeholder="Paste your save string here..."
              className="bg-[#0a0e17] border-cyan-900/20 text-xs font-mono text-gray-300 min-h-24 lg:min-h-32 max-h-36 lg:max-h-48 game-scrollbar placeholder:text-gray-600"
            />
            {importError && (
              <p className="text-xs text-red-400 flex items-center gap-1">
                <X className="w-3 h-3" /> {importError}
              </p>
            )}
            <div className="flex items-center gap-2">
              <Button
                onClick={handleImportConfirm}
                className="flex-1 bg-amber-600 hover:bg-amber-700 text-white min-h-[44px] lg:min-h-0"
                size="sm"
              >
                <Upload className="w-3.5 h-3.5 mr-1" /> Import Save
              </Button>
              <Button
                variant="outline"
                onClick={() => { setImportDialogOpen(false); setImportError(''); }}
                className="border-gray-700 text-gray-400 hover:text-gray-200 min-h-[44px] lg:min-h-0"
                size="sm"
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Toast notifications */}
      <GameToast />

      {/* Offline Earnings Dialog */}
      <Dialog open={offlineDialogOpen} onOpenChange={setOfflineDialogOpen}>
        <DialogContent className="bg-[#111827] border-cyan-900/30 text-gray-100 max-w-md w-[calc(100%-1rem)] p-5">
          <DialogHeader>
            <DialogTitle className="text-cyan-400 flex items-center gap-2 text-lg">
              <span className="text-2xl">👋</span> Welcome Back!
            </DialogTitle>
            <DialogDescription className="text-gray-400 text-sm mt-1">
              {offlineData && (
                <>
                  You were away for{' '}
                  <span className="text-cyan-300 font-bold">
                    {offlineData.ticksElapsed >= 3600
                      ? `${(offlineData.ticksElapsed / 3600).toFixed(1)} hours`
                      : offlineData.ticksElapsed >= 60
                        ? `${Math.floor(offlineData.ticksElapsed / 60)} minutes`
                        : `${offlineData.ticksElapsed} seconds`}
                  </span>
                  . During that time:
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {offlineData && (
            <div className="space-y-3 mt-2">
              {/* Money earned */}
              {offlineData.money > 0 && (
                <div className="bg-[#0a0e17] rounded-lg p-3 border border-green-900/30">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">Money Earned</span>
                    <span className="text-sm text-green-400 font-mono font-bold">
                      +${formatNumber(offlineData.money)}
                    </span>
                  </div>
                </div>
              )}

              {/* Resources earned */}
              <div className="bg-[#0a0e17] rounded-lg p-3 border border-cyan-900/30 max-h-48 overflow-y-auto game-scrollbar">
                <div className="text-[10px] text-gray-500 mb-2 uppercase tracking-wider">Resources Produced</div>
                <div className="space-y-1">
                  {(Object.entries(offlineData.resources) as [string, number][])
                    .filter(([, amount]) => amount > 0)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 8)
                    .map(([resource, amount]) => {
                      const meta = RESOURCE_META[resource as keyof typeof RESOURCE_META];
                      return (
                        <div key={resource} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm">{meta?.emoji ?? '📦'}</span>
                            <span className="text-gray-300">{meta?.name ?? resource}</span>
                          </div>
                          <span className="text-cyan-400 font-mono">+{formatNumber(amount)}</span>
                        </div>
                      );
                    })}
                  {(Object.entries(offlineData.resources) as [string, number][])
                    .filter(([, amount]) => amount > 0).length === 0 && (
                    <div className="text-xs text-gray-500 text-center py-2">No resources produced</div>
                  )}
                </div>
              </div>

              {/* Offline rate note */}
              <p className="text-[10px] text-gray-600 text-center">
                Offline production runs at 50% efficiency (capped at 10 hours)
              </p>

              {/* Collect button */}
              <Button
                className="w-full bg-cyan-600 hover:bg-cyan-700 text-white min-h-[44px]"
                onClick={() => {
                  if (offlineData) {
                    store.collectOfflineProgress(offlineData as { resources: Record<string, number>; money: number; ticksElapsed: number });
                    setOfflineDialogOpen(false);
                    setOfflineData(null);
                  }
                }}
              >
                Collect Earnings
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
