'use client';

import { useEffect, useCallback, useRef } from 'react';
import { useGameStore, formatNumber } from '@/lib/game/store';
import { RESOURCE_META } from '@/lib/game/data';
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
import {
  Factory, Pickaxe, Cog, Truck, Zap, TrendingUp,
  FlaskConical, Users, ScrollText, Bot, Globe, AlertTriangle,
  Save, Play, Pause, FastForward, RotateCcw, ChevronRight, Bell, X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

const TABS = [
  { id: 'dashboard' as const, label: 'Dashboard', icon: Factory, color: 'text-neon-cyan' },
  { id: 'resources' as const, label: 'Extraction', icon: Pickaxe, color: 'text-amber-400' },
  { id: 'factories' as const, label: 'Factories', icon: Cog, color: 'text-orange-400' },
  { id: 'transport' as const, label: 'Transport', icon: Truck, color: 'text-blue-400' },
  { id: 'power' as const, label: 'Power', icon: Zap, color: 'text-yellow-400' },
  { id: 'market' as const, label: 'Market', icon: TrendingUp, color: 'text-green-400' },
  { id: 'research' as const, label: 'Research', icon: FlaskConical, color: 'text-purple-400' },
  { id: 'workers' as const, label: 'Workers', icon: Users, color: 'text-sky-400' },
  { id: 'contracts' as const, label: 'Contracts', icon: ScrollText, color: 'text-rose-400' },
  { id: 'automation' as const, label: 'Automation', icon: Bot, color: 'text-teal-400' },
  { id: 'prestige' as const, label: 'Expand', icon: Globe, color: 'text-fuchsia-400' },
  { id: 'events' as const, label: 'Events', icon: AlertTriangle, color: 'text-red-400' },
  { id: 'blueprints' as const, label: 'Blueprints', icon: Save, color: 'text-indigo-400' },
];

export default function Home() {
  const store = useGameStore();
  const tickRef = useRef<NodeJS.Timeout | null>(null);
  const notifRef = useRef<HTMLDivElement>(null);

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

  const handleReset = useCallback(() => {
    if (confirm('Are you sure you want to reset? All progress will be lost!')) {
      store.resetGame();
    }
  }, [store]);

  const unreadNotifications = store.notifications.filter(n => !n.read).length;

  const renderPanel = () => {
    switch (store.activeTab) {
      case 'dashboard': return <DashboardPanel />;
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
      case 'blueprints': return <BlueprintPanel />;
      default: return <DashboardPanel />;
    }
  };

  const powerPercent = store.powerGrid.totalConsumption > 0
    ? Math.min(100, (store.powerGrid.totalProduction / store.powerGrid.totalConsumption) * 100)
    : 100;

  return (
    <TooltipProvider>
      <div className="min-h-screen flex flex-col bg-[#0a0e17] text-gray-100 overflow-hidden">
        {/* TOP BAR */}
        <header className="sticky top-0 z-50 bg-[#0d1220] border-b border-cyan-900/30 px-3 py-2">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            {/* Logo & Money */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-teal-600 flex items-center justify-center text-sm font-bold">
                  FD
                </div>
                <div>
                  <h1 className="text-sm font-bold text-cyan-400 neon-glow-cyan tracking-wider">FACTORY DOMINION</h1>
                  <p className="text-[10px] text-gray-500 -mt-0.5">Automated Empire</p>
                </div>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <div className="bg-[#111827] rounded-lg px-3 py-1.5 border border-cyan-900/20">
                  <span className="text-gray-500">💰 </span>
                  <span className="text-green-400 font-mono font-bold">${formatNumber(store.money)}</span>
                </div>
                <div className="bg-[#111827] rounded-lg px-3 py-1.5 border border-cyan-900/20">
                  <span className="text-gray-500">⚡ </span>
                  <span className={powerPercent >= 80 ? 'text-yellow-400' : powerPercent >= 50 ? 'text-orange-400' : 'text-red-400'}>
                    {formatNumber(store.powerGrid.totalProduction)}MW
                  </span>
                  <span className="text-gray-600"> / </span>
                  <span className="text-gray-400">{formatNumber(store.powerGrid.totalConsumption)}MW</span>
                </div>
                <div className="bg-[#111827] rounded-lg px-3 py-1.5 border border-cyan-900/20">
                  <span className="text-gray-500">🔬 </span>
                  <span className="text-purple-400 font-mono">{formatNumber(store.researchPoints)} RP</span>
                </div>
                <div className="bg-[#111827] rounded-lg px-3 py-1.5 border border-cyan-900/20">
                  <span className="text-gray-500">🏢 </span>
                  <span className="text-fuchsia-400 font-mono">{store.prestigeState.corporationPoints} CP</span>
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
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 relative">
                    <Bell className="w-3.5 h-3.5 text-gray-400" />
                    {unreadNotifications > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-red-500 rounded-full text-[8px] text-white flex items-center justify-center">
                        {unreadNotifications > 9 ? '9+' : unreadNotifications}
                      </span>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="w-80 max-h-60 overflow-y-auto game-scrollbar bg-[#111827] border-cyan-900/30">
                  {store.notifications.length === 0 ? (
                    <p className="text-xs text-gray-500">No notifications</p>
                  ) : (
                    store.notifications.slice(0, 10).map(n => (
                      <div key={n.id} className={`text-xs py-1 border-b border-gray-800 last:border-0 ${
                        n.type === 'success' ? 'text-green-400' :
                        n.type === 'warning' ? 'text-yellow-400' :
                        n.type === 'error' ? 'text-red-400' : 'text-gray-400'
                      }`}>
                        {n.message}
                      </div>
                    ))
                  )}
                </TooltipContent>
              </Tooltip>

              {/* Active events */}
              {store.activeEvents.length > 0 && (
                <div className="flex items-center gap-1">
                  {store.activeEvents.map(e => (
                    <Tooltip key={e.id}>
                      <TooltipTrigger asChild>
                        <Badge variant="outline" className="text-[10px] border-orange-500/50 text-orange-400 bg-orange-900/20 px-1.5 py-0">
                          {e.emoji} {e.name}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="bg-[#111827] border-cyan-900/30">
                        <p className="text-xs">{e.description}</p>
                        <p className="text-[10px] text-gray-500 mt-1">Remaining: {e.remaining} ticks</p>
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </div>
              )}

              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-gray-500" onClick={handleReset}>
                <RotateCcw className="w-3 h-3" />
              </Button>
            </div>
          </div>
        </header>

        {/* MAIN CONTENT */}
        <div className="flex flex-1 overflow-hidden">
          {/* SIDEBAR NAV */}
          <nav className="w-14 lg:w-44 flex-shrink-0 bg-[#0d1220] border-r border-cyan-900/20 overflow-y-auto game-scrollbar">
            <div className="flex flex-col py-1">
              {TABS.map(tab => {
                const isActive = store.activeTab === tab.id;
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => store.setActiveTab(tab.id)}
                    className={`flex items-center gap-2 px-2 lg:px-3 py-2 text-xs transition-all duration-200 group relative ${
                      isActive
                        ? 'bg-cyan-900/20 text-cyan-400 border-r-2 border-cyan-400'
                        : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/30'
                    }`}
                  >
                    <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? tab.color : ''}`} />
                    <span className="hidden lg:block truncate">{tab.label}</span>
                    {tab.id === 'contracts' && store.contracts.filter(c => !c.completed && !c.failed).length > 0 && (
                      <span className="hidden lg:block ml-auto bg-rose-500/20 text-rose-400 text-[9px] px-1 rounded">
                        {store.contracts.filter(c => !c.completed && !c.failed).length}
                      </span>
                    )}
                    {tab.id === 'events' && store.activeEvents.length > 0 && (
                      <span className="hidden lg:block ml-auto bg-orange-500/20 text-orange-400 text-[9px] px-1 rounded">
                        {store.activeEvents.length}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </nav>

          {/* PANEL AREA */}
          <main className="flex-1 overflow-y-auto game-scrollbar p-3 lg:p-4">
            {renderPanel()}
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}
