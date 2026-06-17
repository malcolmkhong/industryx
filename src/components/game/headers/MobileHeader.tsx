import Image from 'next/image';
import { useMemo, useState } from 'react';
import {
  Bell, Check, Cloud, CloudOff, Download, Loader2, LogIn, LogOut,
  Pause, Play, RefreshCw, RotateCcw, Settings, Upload, User, Wifi, WifiOff,
  TrendingUp, TrendingDown,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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

interface MobileHeaderProps {
  onExport: () => void;
  onImport: () => void;
  onReset: () => void;
  onTabChange: (tab: GameTab) => void;
  onManageAccount?: () => void;
}

const SPEED_OPTIONS = [1, 2, 5, 10] as const;

export function MobileHeader({ onExport, onImport, onReset, onTabChange, onManageAccount }: MobileHeaderProps) {
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
  const { user, isGuest, signOut, loading: authLoading } = useAuth();
  const { isUsingSupabase, reload: reloadConfig } = useGameConfig();
  const { saveToCloud, loadFromCloud } = useCloudSync();
  const { promptLogin } = useLoginPrompt();

  const [cloudStatus, setCloudStatus] = useState<'idle' | 'saving' | 'loading' | 'success' | 'error'>('idle');

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

  const handleCloudLoad = async () => {
    setCloudStatus('loading');
    const result = await loadFromCloud();
    setCloudStatus(result.success ? 'success' : 'error');
    setTimeout(() => setCloudStatus('idle'), 2000);
  };

  /* ── shared button classes for 44x44 touch targets ── */
  const btn44 = 'h-11 w-11 min-h-[44px] min-w-[44px] p-0 flex items-center justify-center rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background';
  const btn44Ghost = `${btn44} text-muted-label hover:text-brand hover:bg-white/[0.04]`;

  return (
    <div className="flex lg:hidden flex-col gap-1">
      {/* ── Row 1: Logo + branding + tick counter ── */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="w-7 h-7 rounded-md bg-gradient-to-br from-brand to-success/80 flex items-center justify-center text-[10px] font-bold flex-shrink-0 shadow-[0_0_8px_rgba(0,255,242,0.2)]">
            IX
          </div>
          <div className="min-w-0">
            <h1 className="text-[11px] font-bold text-brand neon-glow-cyan tracking-wider truncate">INDUSTRIAX</h1>
            <p className="text-[11px] text-muted-label -mt-0.5 hidden xs:block">Factory Dominion</p>
          </div>
        </div>
        <span className="text-[9px] text-muted-label font-mono flex-shrink-0">Tick: {formatNumber(gameTick)}</span>
      </div>

      {/* ── Row 2: Stats — money (with glow + tooltip), power, RP, CP ── */}
      <div className="flex items-center gap-1 flex-wrap text-[10px]">
        {/* Money badge with Financial Overview tooltip */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={`inline-flex items-center gap-1 bg-card rounded-md px-2 py-1 border border-brand/20 cursor-default ${moneyGlow ? 'money-glow' : ''}`}>
              <GameIcon ui="money" size={12} className="inline-flex" />
              <span className="text-success font-mono font-bold text-xs">${formatNumber(money)}</span>
              {pendingPayout > 0 && !payoutConfig.autoCollect && (
                <button
                  type="button"
                  onClick={collectPayout}
                  className="animate-pulse inline-flex items-center gap-0.5 bg-success/40 hover:bg-success/50/50 text-success text-[11px] px-1 py-0.5 rounded border border-success/30 transition-colors min-h-[28px]"
                  aria-label={`Collect pending payout: $${formatNumber(pendingPayout)}`}
                  title="Tap to collect pending payout"
                >
                  <GameIcon ui="money" size={10} className="inline-flex" /> ${formatNumber(pendingPayout)}
                </button>
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="w-60 bg-card border-brand/30 p-0 overflow-hidden">
            <div className="bg-gradient-to-r from-success/30/30 to-success/30/20 px-3 py-1.5 border-b border-brand/20">
              <p className="text-xs font-bold text-success inline-flex items-center gap-1"><GameIcon ui="money" size={12} className="inline-flex" /> Financial Overview</p>
            </div>
            <div className="px-3 py-1.5 space-y-1">
              <div className="flex justify-between text-[10px]">
                <span className="text-subtle">Balance</span>
                <span className="text-success font-mono font-bold">${formatNumber(money)}</span>
              </div>
              {pendingPayout > 0 && (
                <div className="flex justify-between text-[10px]">
                  <span className="text-subtle">Pending Payout</span>
                  <span className="text-warning font-mono">${formatNumber(pendingPayout)}</span>
                </div>
              )}
              <div className="flex justify-between text-[10px]">
                <span className="text-subtle">Income/min</span>
                <span className="text-brand font-mono">~${formatNumber(incomePerMinute)}</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-subtle">Total Earned</span>
                <span className="text-success font-mono">${formatNumber(totalMoneyEarned)}</span>
              </div>
            </div>
          </TooltipContent>
        </Tooltip>

        {/* Power badge with efficiency dot */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={`inline-flex items-center gap-1 bg-card rounded-md px-2 py-1 border border-brand/20 cursor-default ${powerGrid.overload ? 'warning-pulse' : ''}`}>
              <GameIcon ui="power" size={12} className="inline-flex" />
              <span className={`font-mono ${powerPercent >= 80 ? 'text-warning' : powerPercent >= 50 ? 'text-domain' : 'text-danger'}`}>
                {formatNumber(powerGrid.totalProduction)}/{formatNumber(powerGrid.totalConsumption)}
              </span>
              <span
                className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                  factoryEfficiency >= 0.8
                    ? 'bg-success shadow-[0_0_4px_rgba(74,222,128,0.6)]'
                    : factoryEfficiency >= 0.5
                      ? 'bg-warning shadow-[0_0_4px_rgba(250,204,21,0.6)]'
                      : 'bg-danger shadow-[0_0_4px_rgba(248,113,113,0.6)]'
                } ${buildings.filter(b => b.active).length > 0 ? 'animate-pulse' : ''}`}
              />
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="bg-card border-brand/30">
            <p className="text-xs font-semibold mb-1" style={{ color: factoryEfficiency >= 0.8 ? '#4ade80' : factoryEfficiency >= 0.5 ? '#facc15' : '#f87171' }}>
              Factory Efficiency: {(factoryEfficiency * 100).toFixed(0)}%
            </p>
            <p className="text-[10px] text-subtle">
              {factoryEfficiency >= 0.8 ? 'Running smoothly!' : factoryEfficiency >= 0.5 ? 'Some buildings need attention' : 'Critical: Check power & buildings'}
            </p>
          </TooltipContent>
        </Tooltip>

        {/* RP badge */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="inline-flex items-center gap-1 bg-card rounded-md px-2 py-1 border border-brand/20 cursor-default">
              <GameIcon ui="researchPoints" size={12} className="inline-flex" />
              <span className="text-research font-mono">{formatNumber(researchPoints)}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="bg-card border-brand/30">
            <p className="text-xs text-research font-medium">Research Points</p>
            <p className="text-[10px] text-subtle mt-0.5">Earned through exploration and research</p>
          </TooltipContent>
        </Tooltip>

        {/* CP badge */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="inline-flex items-center gap-1 bg-card rounded-md px-2 py-1 border border-brand/20 cursor-default">
              <GameIcon ui="corporationPoints" size={12} className="inline-flex" />
              <span className="text-premium font-mono">{prestigeState.corporationPoints}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="bg-card border-brand/30">
            <p className="text-xs text-premium font-medium">Corporation Points</p>
            <p className="text-[10px] text-subtle mt-0.5">Gained on prestige reset</p>
          </TooltipContent>
        </Tooltip>
      </div>

      {/* ── Row 3: Speed controls + power bar ── */}
      <div className="flex items-center gap-2">
        <div className="flex items-center bg-card rounded-lg border border-brand/20 overflow-hidden flex-shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className={`${btn44} ${paused ? 'text-success' : 'text-warning'}`}
            onClick={togglePause}
            aria-label={paused ? "Resume game" : "Pause game"}
          >
            {paused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
          </Button>
          {SPEED_OPTIONS.map(speed => (
            <Button
              key={speed}
              variant="ghost"
              size="sm"
              className={`h-11 min-h-[44px] px-2.5 text-xs font-mono transition-colors focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background ${gameSpeed === speed ? 'text-brand bg-brand/20 font-bold' : 'text-muted-label'}`}
              onClick={() => setGameSpeed(speed)}
              aria-label={`Set game speed to ${speed}x`}
            >
              {speed}x
            </Button>
          ))}
        </div>

        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <span className="text-[9px] text-muted-label font-mono flex-shrink-0">PWR</span>
          <div className="flex-1 h-2 bg-muted-label rounded-full overflow-hidden min-w-[30px]">
            <div
              className={`h-full transition-all duration-500 rounded-full ${
                powerPercent >= 80 ? 'bg-success' : powerPercent >= 50 ? 'bg-warning' : 'bg-danger'
              }`}
              style={{ width: `${powerPercent}%` }}
            />
          </div>
          <span className={`text-[9px] font-mono flex-shrink-0 ${powerPercent >= 80 ? 'text-success' : powerPercent >= 50 ? 'text-warning' : 'text-danger'}`}>
            {powerPercent.toFixed(0)}%
          </span>
        </div>
      </div>

      {/* ── Row 4: Status indicators ── */}
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-1 flex-wrap">
          {/* Auto-save indicator */}
          <Tooltip>
            <TooltipTrigger asChild>
              <div className={`flex items-center gap-0.5 px-1 transition-opacity duration-500 ${showSavedFlash ? 'opacity-100' : 'opacity-40'}`}>
                <Check className={`w-3 h-3 transition-colors duration-300 ${showSavedFlash ? 'text-success' : 'text-muted-label'}`} />
                <span className={`text-[9px] ${showSavedFlash ? 'text-success' : 'text-muted-label'}`}>Saved</span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="bg-card border-brand/30">
              <p className="text-xs">{showSavedFlash ? 'Game saved to browser' : 'Auto-save enabled'}</p>
            </TooltipContent>
          </Tooltip>

          {/* Notification bell with type-coded badge */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className={`${btn44Ghost} relative`}
                onClick={() => onTabChange('notifications')}
                aria-label={`Notifications: ${unreadNotifications} unread`}
              >
                <Bell className="w-4 h-4" />
                {unreadNotifications > 0 && (
                  <span className={`absolute -top-0.5 -right-0.5 min-w-[16px] h-4 rounded-full text-[11px] text-white flex items-center justify-center px-1 font-bold ${
                    notifications[0]?.type === 'error' ? 'bg-danger' :
                    notifications[0]?.type === 'warning' ? 'bg-domain' :
                    'bg-brand'
                  }`}>
                    {unreadNotifications > 9 ? '9+' : unreadNotifications}
                  </span>
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="w-72 max-h-48 overflow-y-auto game-scrollbar bg-card border-brand/30">
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

          {/* Active events */}
          {activeEvents.length > 0 && (
            <div className="flex items-center gap-0.5">
              {activeEvents.map(e => (
                <Tooltip key={e.id}>
                  <TooltipTrigger asChild>
                    <Badge variant="outline" className="text-[9px] border-domain/50 text-domain bg-domain/20 px-1.5 py-0 h-5 neon-pulse cursor-default">
                      <GameIcon icon={e.icon} size={10} className="inline-flex" /> {e.remaining <= 50 ? `${e.remaining}t` : e.name}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="bg-card border-brand/30 w-56">
                    <p className="text-xs font-medium text-domain mb-1">{e.name}</p>
                    <p className="text-[10px] text-subtle">{e.description}</p>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {e.effects.filter(ef => ef.type === 'marketPriceMultiplier').map((ef, i) => (
                        <span key={`${ef.target}-${i}`} className={`text-[9px] px-1 py-0.5 rounded border ${ef.value > 1 ? 'border-success/40 text-success bg-success/5' : 'border-danger/40 text-danger bg-danger/5'}`}>
                          {ef.value > 1 ? <TrendingUp className="w-2.5 h-2.5 inline mr-0.5" /> : <TrendingDown className="w-2.5 h-2.5 inline mr-0.5" />}
                          {ef.target?.slice(0, 12)}{(ef.target?.length ?? 0) > 12 ? '…' : ''} {ef.value > 1 ? '+' : ''}{((ef.value - 1) * 100).toFixed(0)}%
                        </span>
                      ))}
                    </div>
                    <p className="text-[10px] text-muted-label mt-1.5">Remaining: {e.remaining} ticks</p>
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
          )}

          {/* Weather badge */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className={`text-[9px] px-1.5 py-0 h-5 cursor-default ${
                weather.current === 'clear'
                  ? 'border-muted-label text-muted-label bg-muted-label/20'
                  : 'border-brand/50 text-brand bg-brand/20'
              }`}>
                <GameIcon icon={WEATHER_DEFS[weather.current]?.icon} size={10} className="inline-flex" /> {WEATHER_DEFS[weather.current]?.name}
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="bg-card border-brand/30">
              <p className="text-xs font-medium text-brand">{WEATHER_DEFS[weather.current]?.name}</p>
              <p className="text-[10px] text-subtle mt-0.5">{WEATHER_DEFS[weather.current]?.description}</p>
              {weather.remaining > 0 && <p className="text-[10px] text-muted-label mt-1">Remaining: {weather.remaining} ticks</p>}
              {weather.current === 'clear' && <p className="text-[10px] text-muted-label mt-1">Weather changes over time and affects production</p>}
            </TooltipContent>
          </Tooltip>

          {/* Config source badge with reload */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className={`text-[9px] px-1.5 py-0 h-5 cursor-default ${
                isUsingSupabase ? 'border-success/50 text-success bg-success/20' : 'border-warning/50 text-warning bg-warning/20'
              }`}>
                {isUsingSupabase ? <Wifi className="w-2 h-2 mr-0.5" /> : <WifiOff className="w-2 h-2 mr-0.5" />}
                {isUsingSupabase ? 'Live' : 'Local'}
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="bg-card border-brand/30">
              <p className="text-xs font-medium">{isUsingSupabase ? 'Supabase Connected' : 'Using Local Config'}</p>
              <p className="text-[10px] text-subtle mt-0.5">Game data source</p>
              <Button variant="ghost" size="sm" className="h-7 text-[10px] mt-1 w-full" onClick={reloadConfig}>
                <RefreshCw className="w-2.5 h-2.5 mr-1" /> Refresh Config
              </Button>
            </TooltipContent>
          </Tooltip>

          {/* Online count */}
          <OnlineCount compact />
        </div>
      </div>

      {/* ── Row 5: User menu + more actions ── */}
      <div className="flex items-center gap-1">
        {authLoading ? (
          <Loader2 className="w-5 h-5 text-muted-label animate-spin" />
        ) : isGuest ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-11 min-h-[44px] px-3 text-xs text-brand hover:text-brand border border-brand/30 hover:border-brand/30 rounded-lg focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            onClick={() => promptLogin('manual')}
          >
            <LogIn className="w-3.5 h-3.5 mr-1" /> Bind Account
          </Button>
        ) : user ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-1.5 bg-card rounded-lg px-2 py-1.5 border border-brand/20 hover:border-brand/30 transition-colors cursor-pointer min-h-[44px] focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                aria-label={`Account menu for ${userName}${isGuest ? ' (guest)' : ''}`}
                aria-haspopup="menu"
              >
                {userAvatar ? (
                  <Image src={userAvatar} alt={userName} width={24} height={24} className="rounded-full" />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-brand to-success/80 flex items-center justify-center text-[10px] font-bold" aria-hidden="true">
                    {userName.charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="text-[10px] text-subtle max-w-[60px] truncate">{userName}</span>
                {isGuest && (
                  <span className="text-[11px] px-1 py-0.5 rounded bg-warning/30 text-warning border border-warning/30 font-bold uppercase tracking-wider">
                    Guest
                  </span>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52 bg-card border-brand/30">
              <DropdownMenuLabel className="text-xs">
                <div className="text-brand font-bold">{userName}</div>
                <div className="text-[10px] text-muted-label font-normal">
                  {isGuest ? 'Playing as Guest' : (user.email ?? 'Google account')}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {onManageAccount && (
                <DropdownMenuItem onSelect={onManageAccount} className="text-xs cursor-pointer focus-visible:ring-2 focus-visible:ring-brand">
                  <User className="w-3 h-3 mr-2" /> Manage Account
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={handleCloudSave} className="text-xs cursor-pointer focus-visible:ring-2 focus-visible:ring-brand" disabled={cloudStatus === 'saving'}>
                <Cloud className="w-3 h-3 mr-2" /> Save to Cloud
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={handleCloudLoad} className="text-xs cursor-pointer focus-visible:ring-2 focus-visible:ring-brand" disabled={cloudStatus === 'loading'}>
                <Download className="w-3 h-3 mr-2" /> Load from Cloud
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onExport} className="text-xs cursor-pointer focus-visible:ring-2 focus-visible:ring-brand">
                <Download className="w-3 h-3 mr-2" /> Export Save
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onImport} className="text-xs cursor-pointer focus-visible:ring-2 focus-visible:ring-brand">
                <Upload className="w-3 h-3 mr-2" /> Import Save
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={reloadConfig} className="text-xs cursor-pointer focus-visible:ring-2 focus-visible:ring-brand">
                <RefreshCw className="w-3 h-3 mr-2" /> Reload Config
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={signOut} className="text-xs cursor-pointer text-danger focus:text-danger focus-visible:ring-2 focus-visible:ring-danger">
                <LogOut className="w-3 h-3 mr-2" /> Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="h-11 min-h-[44px] px-3 text-xs text-brand hover:text-brand border border-brand/30 hover:border-brand/30 rounded-lg focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            onClick={() => promptLogin('manual')}
          >
            <LogIn className="w-3.5 h-3.5 mr-1" /> Sign In
          </Button>
        )}

        {/* More actions for non-auth users (or when no user menu) */}
        {!user && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={`${btn44Ghost}`}
                aria-label="Tools menu"
              >
                <Settings aria-hidden="true" className="w-4 h-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44 bg-card border-brand/30">
              <DropdownMenuLabel className="text-xs">Tools</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onExport} className="text-xs cursor-pointer focus-visible:ring-2 focus-visible:ring-brand">
                <Download className="w-3 h-3 mr-2" aria-hidden="true" /> Export Save
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onImport} className="text-xs cursor-pointer focus-visible:ring-2 focus-visible:ring-brand">
                <Upload className="w-3 h-3 mr-2" aria-hidden="true" /> Import Save
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={reloadConfig} className="text-xs cursor-pointer focus-visible:ring-2 focus-visible:ring-brand">
                <RefreshCw className="w-3 h-3 mr-2" aria-hidden="true" /> Reload Config
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onReset} className="text-xs cursor-pointer text-danger focus:text-danger focus-visible:ring-2 focus-visible:ring-danger">
                <RotateCcw className="w-3 h-3 mr-2" aria-hidden="true" /> Reset Game
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}
