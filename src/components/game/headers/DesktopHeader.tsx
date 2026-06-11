import { useMemo, useState } from 'react';
import {
  Bell, Check, Cloud, CloudOff, Download, Loader2, LogIn, LogOut,
  Pause, Play, RefreshCw, RotateCcw, Settings, Upload, Wifi, WifiOff,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from '@/components/ui/tooltip';
import { useGameStore, formatNumber } from '@/lib/game/store';
import { WEATHER_DEFS } from '@/lib/game/configCache';
import { GameIcon } from '@/components/game/shared/GameIcon';
import { OnlineCount } from '@/components/game/OnlineCount';
import { useAuth } from '@/components/providers/AuthProvider';
import { useGameConfig } from '@/components/providers/GameConfigProvider';
import { useCloudSync } from '@/lib/hooks/useCloudSync';
import { useLoginPrompt } from '@/lib/hooks/useLoginPrompt';
import { useAutoSaveIndicator } from '@/lib/hooks/page/useAutoSaveIndicator';
import { useMoneyGlowEffect } from '@/lib/hooks/page/useMoneyGlowEffect';
import type { GameTab } from '@/lib/game/types';

interface DesktopHeaderProps {
  onExport: () => void;
  onImport: () => void;
  onReset: () => void;
  onTabChange: (tab: GameTab) => void;
}

const SPEED_OPTIONS = [1, 2, 5, 10] as const;

export function DesktopHeader({ onExport, onImport, onReset, onTabChange }: DesktopHeaderProps) {
  const gameTick = useGameStore(s => s.gameTick);
  const gameSpeed = useGameStore(s => s.gameSpeed);
  const paused = useGameStore(s => s.paused);
  const prestigeState = useGameStore(s => s.prestigeState);
  const effectiveSpeed = gameSpeed * (1 + prestigeState.bonuses.filter(b => b.purchased && b.effect.type === 'gameSpeed').reduce((sum, b) => sum + b.effect.value, 0));
  const money = useGameStore(s => s.money);
  const totalMoneyEarned = useGameStore(s => s.totalMoneyEarned);
  const pendingPayout = useGameStore(s => s.pendingPayout);
  const payoutConfig = useGameStore(s => s.payoutConfig);
  const collectPayout = useGameStore(s => s.collectPayout);
  const togglePause = useGameStore(s => s.togglePause);
  const setGameSpeed = useGameStore(s => s.setGameSpeed);
  const powerGrid = useGameStore(s => s.powerGrid);
  const productionSnapshot = useGameStore(s => s.productionSnapshot);
  const buildings = useGameStore(s => s.buildings);
  const researchPoints = useGameStore(s => s.researchPoints);
  const notifications = useGameStore(s => s.notifications);
  const activeEvents = useGameStore(s => s.activeEvents);
  const weather = useGameStore(s => s.weather);

  const { showSavedFlash } = useAutoSaveIndicator();
  const { moneyGlow } = useMoneyGlowEffect();
  const { user, signOut, loading: authLoading } = useAuth();
  const { isUsingSupabase, reload: reloadConfig } = useGameConfig();
  const { saveToCloud } = useCloudSync();
  const { promptLogin } = useLoginPrompt();

  const [cloudStatus, setCloudStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');

  const powerPercent = powerGrid.totalConsumption > 0
    ? Math.min(100, (powerGrid.totalProduction / powerGrid.totalConsumption) * 100)
    : powerGrid.totalProduction > 0 ? 100 : 0;

  const incomePerMinute = useMemo(() => {
    const rawPayoutPerCycle = productionSnapshot.payoutPerCycle || 0;
    const cyclesPerMinute = effectiveSpeed / payoutConfig.basePayoutInterval * 60;
    return Math.floor(rawPayoutPerCycle * cyclesPerMinute);
  }, [productionSnapshot.payoutPerCycle, effectiveSpeed, payoutConfig.basePayoutInterval]);

  const factoryEfficiency = useMemo(() => {
    const activeBuildings = buildings.filter(b => b.active);
    if (activeBuildings.length === 0) return 0;
    return activeBuildings.reduce((sum, b) => sum + b.efficiency, 0) / activeBuildings.length * powerGrid.efficiency;
  }, [buildings, powerGrid.efficiency]);

  const unreadNotifications = notifications.filter(n => !n.read).length;
  const userName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Commander';
  const userAvatar = user?.user_metadata?.avatar_url;

  const handleCloudSave = async () => {
    setCloudStatus('saving');
    const result = await saveToCloud();
    setCloudStatus(result.success ? 'success' : 'error');
    setTimeout(() => setCloudStatus('idle'), 2000);
  };

  return (
    <>
      <div className="hidden lg:flex items-center justify-between gap-4 flex-wrap">
        {/* Logo & Money */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500 to-teal-600 flex items-center justify-center text-base font-bold shadow-[0_0_12px_rgba(0,255,242,0.2)]">
              IX
            </div>
            <div>
              <h1 className="text-sm font-bold text-cyan-400 neon-glow-cyan tracking-wider">INDUSTRIAX</h1>
              <p className="text-[10px] text-muted-label -mt-0.5">Factory Dominion</p>
            </div>
          </div>
          <div className="stat-badge-separator" />
          <div className="flex items-center gap-4 text-xs">
            <Tooltip>
              <TooltipTrigger asChild>
                <div className={`stat-badge stat-badge-money bg-card rounded-lg px-3 py-1.5 border border-cyan-900/20 cursor-default ${moneyGlow ? 'money-glow' : ''}`}>
                  <span className="text-muted-label inline-flex items-center gap-1"><GameIcon ui="money" size={14} /></span>
                  <span className="text-success font-mono font-bold text-sm">${formatNumber(money)}</span>
                  {pendingPayout > 0 && !payoutConfig.autoCollect && (
                    <button
                      onClick={collectPayout}
                      className="ml-2 animate-pulse inline-flex items-center gap-1 bg-success/40 hover:bg-emerald-800/50 text-success text-[10px] px-1.5 py-0.5 rounded-md border border-success/30 transition-colors"
                      title="Click to collect pending payout"
                    >
                      <GameIcon ui="money" size={12} className="inline-flex" /> ${formatNumber(pendingPayout)}
                    </button>
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="w-64 bg-card border-cyan-900/30 p-0 overflow-hidden">
                <div className="bg-gradient-to-r from-green-900/30 to-emerald-900/20 px-3 py-2 border-b border-cyan-900/20">
                  <p className="text-xs font-bold text-success inline-flex items-center gap-1"><GameIcon ui="money" size={14} className="inline-flex" /> Financial Overview</p>
                </div>
                <div className="px-3 py-2 space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-subtle">Current Balance</span>
                    <span className="text-success font-mono font-bold">${formatNumber(money)}</span>
                  </div>
                  {pendingPayout > 0 && (
                    <div className="flex justify-between text-xs">
                      <span className="text-subtle">Pending Payout</span>
                      <span className="text-warning font-mono">${formatNumber(pendingPayout)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-xs">
                    <span className="text-subtle">Income/min</span>
                    <span className="text-cyan-400 font-mono">~${formatNumber(incomePerMinute)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-subtle">Total Earned</span>
                    <span className="text-success font-mono">${formatNumber(totalMoneyEarned)}</span>
                  </div>
                </div>
              </TooltipContent>
            </Tooltip>
            <div className={`stat-badge stat-badge-power bg-card rounded-lg px-3 py-1.5 border border-cyan-900/20 cursor-default ${powerGrid.overload ? 'warning-pulse' : ''}`}>
              <span className="text-muted-label inline-flex items-center gap-1"><GameIcon ui="power" size={14} /></span>
              <span className={`text-sm ${powerPercent >= 80 ? 'text-warning' : powerPercent >= 50 ? 'text-orange-400' : 'text-danger'}`}>
                {formatNumber(powerGrid.totalProduction)}MW
              </span>
              <span className="text-muted-label"> / </span>
              <span className="text-subtle text-sm">{formatNumber(powerGrid.totalConsumption)}MW</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className={`ml-1.5 inline-block w-2 h-2 rounded-full ${
                      factoryEfficiency >= 0.8
                        ? 'bg-success shadow-[0_0_6px_rgba(74,222,128,0.6)]'
                        : factoryEfficiency >= 0.5
                          ? 'bg-warning shadow-[0_0_6px_rgba(250,204,21,0.6)]'
                          : 'bg-danger shadow-[0_0_6px_rgba(248,113,113,0.6)]'
                    } ${buildings.filter(b => b.active).length > 0 ? 'animate-pulse' : ''}`}
                  />
                </TooltipTrigger>
                <TooltipContent side="bottom" className="bg-card border-cyan-900/30">
                  <p className="text-xs font-semibold mb-1" style={{ color: factoryEfficiency >= 0.8 ? '#4ade80' : factoryEfficiency >= 0.5 ? '#facc15' : '#f87171' }}>
                    Factory Efficiency: {(factoryEfficiency * 100).toFixed(0)}%
                  </p>
                  <p className="text-[10px] text-subtle">
                    {factoryEfficiency >= 0.8 ? 'Running smoothly!' : factoryEfficiency >= 0.5 ? 'Some buildings need attention' : 'Critical: Check power & buildings'}
                  </p>
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="stat-badge-separator" />
            <div className="stat-badge stat-badge-rp bg-card rounded-lg px-3 py-1.5 border border-cyan-900/20 cursor-default">
              <span className="text-muted-label inline-flex items-center gap-1"><GameIcon ui="researchPoints" size={14} /></span>
              <span className="text-purple-400 font-mono text-sm">{formatNumber(researchPoints)} RP</span>
            </div>
            <div className="stat-badge stat-badge-cp bg-card rounded-lg px-3 py-1.5 border border-cyan-900/20 cursor-default">
              <span className="text-muted-label inline-flex items-center gap-1"><GameIcon ui="corporationPoints" size={14} /></span>
              <span className="text-fuchsia-400 font-mono text-sm">{prestigeState.corporationPoints} CP</span>
            </div>
          </div>
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-2">
          <div className="w-24 h-2 bg-muted-label rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${
                powerPercent >= 80 ? 'bg-success' : powerPercent >= 50 ? 'bg-warning' : 'bg-danger'
              }`}
              style={{ width: `${powerPercent}%` }}
            />
          </div>

          <div className="flex items-center bg-card rounded-lg border border-cyan-900/20 overflow-hidden">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={togglePause}
              aria-label={paused ? "Resume game" : "Pause game"}
            >
              {paused ? <Play className="w-3 h-3 text-success" /> : <Pause className="w-3 h-3 text-warning" />}
            </Button>
            {SPEED_OPTIONS.map(speed => (
              <Button
                key={speed}
                variant="ghost"
                size="sm"
                className={`h-7 px-2 text-xs ${gameSpeed === speed ? 'text-cyan-400 bg-cyan-900/20' : 'text-muted-label'}`}
                onClick={() => setGameSpeed(speed)}
              >
                {speed}x
              </Button>
            ))}
          </div>

          <div className="text-[10px] text-muted-label font-mono">
            Tick: {formatNumber(gameTick)}
          </div>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 relative" aria-label="Notifications" onClick={() => onTabChange('notifications')}>
                <Bell className="w-3.5 h-3.5 text-subtle" />
                {unreadNotifications > 0 && (
                  <span className={`absolute -top-0.5 -right-0.5 h-4 rounded-full text-[8px] text-white flex items-center justify-center px-1 ${
                    notifications[0]?.type === 'error' ? 'bg-danger' :
                    notifications[0]?.type === 'warning' ? 'bg-orange-500' :
                    'bg-cyan-500'
                  }`}>
                    {unreadNotifications > 9 ? '9+' : unreadNotifications}
                  </span>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="w-80 max-h-60 overflow-y-auto game-scrollbar bg-card border-cyan-900/30">
              {notifications.length === 0 ? (
                <p className="text-xs text-muted-label">No notifications</p>
              ) : (
                <>
                  <div className="flex items-center gap-2 mb-2 pb-1.5 border-b border-muted-label">
                    <Bell className="w-3 h-3 text-subtle" />
                    <span className="text-[10px] font-semibold text-subtle">
                      {unreadNotifications > 0 ? `${unreadNotifications} New ${notifications[0]?.type === 'error' ? 'Alert' : notifications[0]?.type === 'warning' ? 'Warning' : 'Event'}${unreadNotifications > 1 ? 's' : ''}` : 'No New Notifications'}
                    </span>
                  </div>
                  {notifications.slice(0, 10).map(n => (
                    <div key={n.id} className={`text-xs py-1 border-b border-muted-label last:border-0 ${
                      n.type === 'success' ? 'text-success' :
                      n.type === 'warning' ? 'text-warning' :
                      n.type === 'error' ? 'text-danger' : 'text-subtle'
                    }`}>
                      {n.message}
                    </div>
                  ))}
                </>
              )}
            </TooltipContent>
          </Tooltip>

          {activeEvents.length > 0 && (
            <div className="flex items-center gap-1">
              {activeEvents.map(e => (
                <Tooltip key={e.id}>
                  <TooltipTrigger asChild>
                    <Badge variant="outline" className="text-[10px] border-orange-500/50 text-orange-400 bg-orange-900/20 px-1.5 py-0 neon-pulse">
                      <GameIcon icon={e.icon} size={12} className="inline-flex" /> {e.remaining <= 50 ? `${e.remaining}t` : e.name}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="bg-card border-cyan-900/30">
                    <p className="text-xs font-medium text-orange-300">{e.name}</p>
                    <p className="text-[10px] text-subtle mt-0.5">{e.description}</p>
                    <p className="text-[10px] text-muted-label mt-1">Remaining: {e.remaining} ticks</p>
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${
                weather.current === 'clear'
                  ? 'border-muted-label text-muted-label bg-muted-label/20'
                  : 'border-sky-500/50 text-sky-400 bg-sky-900/20'
              }`}>
                <GameIcon icon={WEATHER_DEFS[weather.current]?.icon} size={12} className="inline-flex" /> {WEATHER_DEFS[weather.current]?.name}
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="bg-card border-cyan-900/30">
              <p className="text-xs font-medium text-sky-300">{WEATHER_DEFS[weather.current]?.name}</p>
              <p className="text-[10px] text-subtle mt-0.5">{WEATHER_DEFS[weather.current]?.description}</p>
              {weather.remaining > 0 && <p className="text-[10px] text-muted-label mt-1">Remaining: {weather.remaining} ticks</p>}
              {weather.current === 'clear' && <p className="text-[10px] text-muted-label mt-1">Weather changes over time and affects production</p>}
            </TooltipContent>
          </Tooltip>

          {/* Auto-save indicator */}
          <div className={`flex items-center gap-1 text-[10px] transition-opacity duration-500 ${showSavedFlash ? 'opacity-100' : 'opacity-40'}`}>
            <Check className={`w-3 h-3 transition-colors duration-300 ${showSavedFlash ? 'text-success' : 'text-muted-label'}`} />
            <span className={showSavedFlash ? 'text-success' : 'text-muted-label'}>Saved</span>
          </div>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-label hover:text-cyan-400" onClick={onExport} aria-label="Export save">
                <Download className="w-3 h-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="bg-card border-cyan-900/30">
              <p className="text-xs">Export Save</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-label hover:text-cyan-400" onClick={onImport} aria-label="Import save">
                <Upload className="w-3 h-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="bg-card border-cyan-900/30">
              <p className="text-xs">Import Save</p>
            </TooltipContent>
          </Tooltip>

          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-label" onClick={onReset} aria-label="Reset game">
            <RotateCcw className="w-3 h-3" />
          </Button>

          <OnlineCount />

          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 cursor-default ${
                isUsingSupabase ? 'border-success/50 text-success bg-success/20' : 'border-warning/50 text-warning bg-amber-900/20'
              }`}>
                {isUsingSupabase ? <Wifi className="w-2.5 h-2.5 mr-0.5" /> : <WifiOff className="w-2.5 h-2.5 mr-0.5" />}
                {isUsingSupabase ? 'Live' : 'Local'}
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="bg-card border-cyan-900/30">
              <p className="text-xs font-medium">{isUsingSupabase ? 'Supabase Connected' : 'Using Local Config'}</p>
              <p className="text-[10px] text-subtle mt-0.5">Game data source</p>
              <Button variant="ghost" size="sm" className="h-6 text-[10px] mt-1 w-full" onClick={reloadConfig}>
                <RefreshCw className="w-2.5 h-2.5 mr-1" /> Refresh Config
              </Button>
            </TooltipContent>
          </Tooltip>

          {user ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={handleCloudSave} disabled={cloudStatus === 'saving'}>
                  {cloudStatus === 'saving' ? <Loader2 className="w-3 h-3 animate-spin" />
                  : cloudStatus === 'success' ? <Cloud className="w-3 h-3 text-success" />
                  : cloudStatus === 'error' ? <CloudOff className="w-3 h-3 text-danger" />
                  : <Cloud className="w-3 h-3 text-subtle" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="bg-card border-cyan-900/30">
                <p className="text-xs">Save to Cloud</p>
              </TooltipContent>
            </Tooltip>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-label hover:text-cyan-400" onClick={() => promptLogin('cloud_save')}>
                  <Cloud className="w-3 h-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="bg-card border-cyan-900/30">
                <p className="text-xs">Sign in for Cloud Save</p>
              </TooltipContent>
            </Tooltip>
          )}

          {authLoading ? (
            <Loader2 className="w-4 h-4 text-muted-label animate-spin" />
          ) : user ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button className="flex items-center gap-1.5 bg-card rounded-lg px-2 py-1 border border-cyan-900/20 hover:border-cyan-500/30 transition-colors cursor-pointer">
                  {userAvatar ? (
                    <img src={userAvatar} alt="" className="w-5 h-5 rounded-full" />
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-gradient-to-br from-cyan-500 to-teal-600 flex items-center justify-center text-[9px] font-bold">
                      {userName.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <span className="text-[10px] text-subtle max-w-[80px] truncate">{userName}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="w-56 bg-card border-cyan-900/30 p-0 overflow-hidden">
                <div className="bg-gradient-to-r from-cyan-900/30 to-teal-900/20 px-3 py-2 border-b border-cyan-900/20">
                  <p className="text-xs font-bold text-cyan-300">{userName}</p>
                  <p className="text-[10px] text-subtle">{user.email}</p>
                </div>
                <div className="p-2 space-y-1">
                  <Button variant="ghost" size="sm" className="w-full justify-start h-7 text-xs" onClick={handleCloudSave}><Cloud className="w-3 h-3 mr-1.5" /> Save to Cloud</Button>
                  <Button variant="ghost" size="sm" className="w-full justify-start h-7 text-xs" onClick={reloadConfig}><RefreshCw className="w-3 h-3 mr-1.5" /> Reload Config</Button>
                  <div className="border-t border-cyan-900/20 my-1" />
                  <Button variant="ghost" size="sm" className="w-full justify-start h-7 text-xs text-danger hover:text-danger" onClick={signOut}><LogOut className="w-3 h-3 mr-1.5" /> Sign Out</Button>
                </div>
              </TooltipContent>
            </Tooltip>
          ) : (
            <Button variant="ghost" size="sm" className="h-7 px-3 text-xs text-cyan-400 hover:text-cyan-300 border border-cyan-900/30 hover:border-cyan-500/30 rounded-lg" onClick={() => promptLogin('manual')}>
              <LogIn className="w-3 h-3 mr-1" /> Sign In
            </Button>
          )}
        </div>
      </div>

      {/* News Ticker - desktop only, inside fixed header */}
      <div className="hidden lg:block bg-[#0a0e17] border-t border-cyan-900/20 overflow-hidden h-6">
        <div className="flex items-center h-full px-3">
          <span className="text-[10px] text-cyan-400 font-bold mr-3 flex-shrink-0">📰 NEWS</span>
          <div className="overflow-hidden flex-1 relative">
            <div className="news-ticker-content text-[10px] text-subtle">
              {notifications.slice(0, 8).map((n, i) => (
                <span key={n.id}>
                  {i > 0 && <span className="text-cyan-700 mx-3">•</span>}
                  {n.message}
                </span>
              ))}
              {notifications.length === 0 && 'Welcome to IndustriaX! Build your first Mining Drill to start producing resources.'}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
