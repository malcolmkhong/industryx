import Image from 'next/image';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell, Check, Cloud, CloudOff, Download, Loader2, LogIn, LogOut,
  Newspaper, Pause, Play, RefreshCw, User, Wifi, WifiOff,
  Wrench, TrendingUp, TrendingDown,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  HoverCard, HoverCardContent, HoverCardTrigger,
} from '@/components/ui/hover-card';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useGameStore, formatNumber } from '@/lib/game/store';
import { WEATHER_DEFS } from '@/lib/game/configCache';
import { GameIcon, BrandLogo } from '@/components/icons';
import { OnlineCount } from '@/components/game/OnlineCount';
import { useTickFormat } from '@/lib/hooks/useTickFormat';
import { formatByMode, formatRemaining } from '@/lib/utils/time';
import { useAuth } from '@/components/providers/AuthProvider';
import { useGameConfig } from '@/components/providers/GameConfigProvider';
import { useCloudSync } from '@/lib/hooks/useCloudSync';
import { useLoginPrompt } from '@/lib/hooks/useLoginPrompt';
import { useAutoSaveIndicator } from '@/lib/hooks/page/useAutoSaveIndicator';
import { useMoneyGlowEffect } from '@/lib/hooks/page/useMoneyGlowEffect';
import type { GameTab } from '@/lib/game/types';

interface MobileHeaderProps {
  onTabChange: (tab: GameTab) => void;
  onManageAccount?: () => void;
}

const SPEED_OPTIONS = [1, 2, 5, 10] as const;

export function MobileHeader({ onTabChange, onManageAccount }: MobileHeaderProps) {
  const gameTick = useGameStore(s => s.gameTick);
  const [tickFormat] = useTickFormat();
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
  const { saveToCloud, loadFromCloud, isSyncing } = useCloudSync();
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

  // News ticker: rotate through top 3 notifications every 5s
  const [headlineIndex, setHeadlineIndex] = useState(0);
  const topHeadlines = notifications.slice(0, 3);
  const safeIndex = topHeadlines.length > 0 ? Math.min(headlineIndex, topHeadlines.length - 1) : 0;
  useEffect(() => {
    if (topHeadlines.length < 2) return;
    const t = setInterval(() => setHeadlineIndex(i => (i + 1) % topHeadlines.length), 5000);
    return () => clearInterval(t);
  }, [topHeadlines.length]);

  // Phase 5.5: debounce + reactive isSyncing guard. See DesktopHeader for
  // full rationale. Same pattern in both headers.
  const lastSaveClickRef = useRef(0);
  const SAVE_DEBOUNCE_MS = 2000;
  const handleCloudSave = async () => {
    if (isSyncing) return;
    const now = Date.now();
    if (now - lastSaveClickRef.current < SAVE_DEBOUNCE_MS) return;
    lastSaveClickRef.current = now;
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
  const btn44 = 'h-11 w-11 min-h-11 min-w-11 p-0 flex items-center justify-center rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background';
  const btn44Ghost = `${btn44} text-subtle hover:text-brand hover:bg-white/[0.04]`;

  return (
    <div className="flex lg:hidden flex-col gap-1">
      {/* ── Row 1: Logo + news ticker + tick counter ── */}
      <div className="flex items-center gap-1.5 min-h-7">
        <HoverCard openDelay={300} closeDelay={100}>
          <HoverCardTrigger asChild>
            <div className="flex items-center gap-1.5 cursor-pointer shrink-0" tabIndex={0}>
              <BrandLogo size="sm" />
              <h1 className="text-[11px] font-bold text-brand neon-glow-cyan tracking-wider">INDUSTRIAX</h1>
            </div>
          </HoverCardTrigger>
          <HoverCardContent side="bottom" align="start" className="w-72 bg-card border-brand/30 p-0 overflow-hidden">
            <div className="bg-linear-to-r from-brand/20 to-success/20 px-3 py-1.5 border-b border-brand/20">
              <p className="text-xs font-bold text-brand">INDUSTRIAX</p>
              <p className="text-[10px] text-subtle mt-0.5">Factory Dominion — v1.0</p>
            </div>
            <div className="px-3 py-1.5">
              <p className="text-[10px] text-subtle leading-relaxed">
                A resource-management idle empire. Build extractors, process materials, research tech, and expand into megaprojects across 5 tiers.
              </p>
            </div>
          </HoverCardContent>
        </HoverCard>

        <div className="flex-1 min-w-0 flex items-center gap-1 px-1.5 h-6 rounded bg-card/40 border border-brand/10 overflow-hidden">
          <Newspaper aria-hidden="true" className="w-3 h-3 text-brand shrink-0" />
          <div className="flex-1 min-w-0 overflow-hidden">
            {topHeadlines.length > 0 ? (
              <p key={topHeadlines[safeIndex]?.id ?? 'h'} className="text-[10px] text-subtle truncate animate-in fade-in duration-300">
                {topHeadlines[safeIndex]?.message}
              </p>
            ) : (
              <p className="text-[10px] text-subtle truncate">Factory Dominion — manage resources, research, expand.</p>
            )}
          </div>
          {topHeadlines.length > 1 && (
            <span className="text-[9px] font-mono shrink-0 text-subtle">{safeIndex + 1}/{topHeadlines.length}</span>
          )}
        </div>

        <HoverCard openDelay={200} closeDelay={100}>
          <HoverCardTrigger asChild>
            <span className="text-[9px] font-mono shrink-0 cursor-default text-subtle hover:text-brand transition-colors">Tick: {formatByMode(gameTick, tickFormat)}</span>
          </HoverCardTrigger>
          <HoverCardContent side="bottom" className="w-56 bg-card border-brand/30">
            <p className="text-xs font-bold text-brand">Game Tick</p>
            <p className="text-[10px] text-subtle mt-0.5">Speed: {gameSpeed}x · {paused ? 'Paused' : 'Running'}</p>
            <p className="text-[10px] text-subtle mt-1 leading-relaxed">Each tick advances production, consumption, and event timers.</p>
          </HoverCardContent>
        </HoverCard>
      </div>

      {/* ── Row 2: Stats — money (with glow + tooltip), power, RP, CP ── */}
      <div className="flex items-center gap-1 flex-wrap text-[10px]">
        {/* Money badge with Financial Overview hover card */}
        <HoverCard openDelay={150} closeDelay={100}>
          <HoverCardTrigger asChild>
            <div className={`inline-flex items-center gap-1 bg-card rounded-md px-2 py-1 border border-brand/20 cursor-default ${moneyGlow ? 'money-glow' : ''}`}>
              <GameIcon ui="money" size={12} className="inline-flex" />
              <span className="text-success font-mono font-bold text-xs">${formatNumber(money)}</span>
              {pendingPayout > 0 && !payoutConfig.autoCollect && (
                <button
                  type="button"
                  onClick={collectPayout}
                  className="animate-pulse inline-flex items-center gap-0.5 bg-success/40 hover:bg-success/50/50 text-success text-[11px] px-1 py-0.5 rounded border border-success/30 transition-colors min-h-7"
                  aria-label={`Collect pending payout: $${formatNumber(pendingPayout)}`}
                  title="Tap to collect pending payout"
                >
                  <GameIcon ui="money" size={10} className="inline-flex" /> ${formatNumber(pendingPayout)}
                </button>
              )}
            </div>
          </HoverCardTrigger>
          <HoverCardContent side="bottom" className="w-64 bg-card border-brand/30 p-0 overflow-hidden">
            <div className="bg-linear-to-r from-success/30/30 to-success/30/20 px-3 py-1.5 border-b border-brand/20">
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
          </HoverCardContent>
        </HoverCard>

        {/* Power badge with efficiency hover card */}
        <HoverCard openDelay={150} closeDelay={100}>
          <HoverCardTrigger asChild>
            <div className={`inline-flex items-center gap-1 bg-card rounded-md px-2 py-1 border border-brand/20 cursor-default ${powerGrid.overload ? 'warning-pulse' : ''}`}>
              <GameIcon ui="power" size={12} className="inline-flex" />
              <span className={`font-mono ${powerPercent >= 80 ? 'text-warning' : powerPercent >= 50 ? 'text-domain' : 'text-danger'}`}>
                {formatNumber(powerGrid.totalProduction)}/{formatNumber(powerGrid.totalConsumption)}
              </span>
              <span
                className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  factoryEfficiency >= 0.8
                    ? 'bg-success shadow-[0_0_4px_rgba(74,222,128,0.6)]'
                    : factoryEfficiency >= 0.5
                      ? 'bg-warning shadow-[0_0_4px_rgba(250,204,21,0.6)]'
                      : 'bg-danger shadow-[0_0_4px_rgba(248,113,113,0.6)]'
                } ${buildings.filter(b => b.active).length > 0 ? 'animate-pulse' : ''}`}
              />
            </div>
          </HoverCardTrigger>
          <HoverCardContent side="bottom" className="w-64 bg-card border-brand/30 p-0 overflow-hidden">
            <div className={`px-3 py-1.5 border-b border-brand/20 ${
              factoryEfficiency >= 0.8 ? 'bg-success/20' :
              factoryEfficiency >= 0.5 ? 'bg-warning/20' :
              'bg-danger/20'
            }`}>
              <p className="text-xs font-bold" style={{ color: factoryEfficiency >= 0.8 ? '#4ade80' : factoryEfficiency >= 0.5 ? '#facc15' : '#f87171' }}>
                Factory Efficiency: {(factoryEfficiency * 100).toFixed(0)}%
              </p>
            </div>
            <div className="px-3 py-1.5 space-y-1">
              <div className="flex justify-between text-[10px]">
                <span className="text-subtle">Status</span>
                <span className="font-mono text-subtle">{factoryEfficiency >= 0.8 ? 'Running smoothly' : factoryEfficiency >= 0.5 ? 'Needs attention' : 'Critical'}</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-subtle">Production</span>
                <span className="text-success font-mono">{formatNumber(powerGrid.totalProduction)} MW</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-subtle">Consumption</span>
                <span className="text-warning font-mono">{formatNumber(powerGrid.totalConsumption)} MW</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-subtle">Capacity</span>
                <span className="text-brand font-mono">{powerPercent.toFixed(0)}%</span>
              </div>
            </div>
          </HoverCardContent>
        </HoverCard>

        {/* RP badge */}
        <HoverCard openDelay={200} closeDelay={100}>
          <HoverCardTrigger asChild>
            <div className="inline-flex items-center gap-1 bg-card rounded-md px-2 py-1 border border-brand/20 cursor-default">
              <GameIcon ui="researchPoints" size={12} className="inline-flex" />
              <span className="text-research font-mono">{formatNumber(researchPoints)}</span>
            </div>
          </HoverCardTrigger>
          <HoverCardContent side="bottom" className="w-56 bg-card border-research/30">
            <p className="text-xs font-bold text-research">Research Points</p>
            <p className="text-[10px] text-subtle mt-0.5">Earned through exploration and research. Spend in the Research Lab to unlock permanent tech upgrades.</p>
          </HoverCardContent>
        </HoverCard>

        {/* CP badge */}
        <HoverCard openDelay={200} closeDelay={100}>
          <HoverCardTrigger asChild>
            <div className="inline-flex items-center gap-1 bg-card rounded-md px-2 py-1 border border-brand/20 cursor-default">
              <GameIcon ui="corporationPoints" size={12} className="inline-flex" />
              <span className="text-premium font-mono">{prestigeState.corporationPoints}</span>
            </div>
          </HoverCardTrigger>
          <HoverCardContent side="bottom" className="w-56 bg-card border-premium/30">
            <p className="text-xs font-bold text-premium">Corporation Points</p>
            <p className="text-[10px] text-subtle mt-0.5">Gained on Global Expansion. Spend on permanent bonuses like game speed, production multipliers, and new building tiers.</p>
          </HoverCardContent>
        </HoverCard>
      </div>

      {/* ── Row 3: Speed controls + power bar ── */}
      <div className="flex items-center gap-2">
        <div className="flex items-center bg-card rounded-lg border border-brand/20 overflow-hidden shrink-0">
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
              className={`h-11 min-h-11 px-2.5 text-xs font-mono transition-colors focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background ${gameSpeed === speed ? 'text-brand bg-brand/20 font-bold' : 'text-subtle hover:text-brand'}`}
              onClick={() => setGameSpeed(speed)}
              aria-label={`Set game speed to ${speed}x`}
            >
              {speed}x
            </Button>
          ))}
        </div>

        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <span className="text-[9px] text-subtle font-mono shrink-0">PWR</span>
          <div className="flex-1 h-2 bg-muted-label rounded-full overflow-hidden min-w-7.5">
            <div
              className={`h-full transition-all duration-500 rounded-full ${
                powerPercent >= 80 ? 'bg-success' : powerPercent >= 50 ? 'bg-warning' : 'bg-danger'
              }`}
              style={{ width: `${powerPercent}%` }}
            />
          </div>
          <span className={`text-[9px] font-mono shrink-0 ${powerPercent >= 80 ? 'text-success' : powerPercent >= 50 ? 'text-warning' : 'text-danger'}`}>
            {powerPercent.toFixed(0)}%
          </span>
        </div>
      </div>

      {/* ── Row 4: Status indicators ── */}
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-1 flex-wrap">
          {/* Auto-save indicator */}
          <HoverCard openDelay={200} closeDelay={100}>
            <HoverCardTrigger asChild>
              <div className={`flex items-center gap-0.5 px-1 transition-opacity duration-500 cursor-default ${showSavedFlash ? 'opacity-100' : 'opacity-40'}`}>
                <Check className={`w-3 h-3 transition-colors duration-300 ${showSavedFlash ? 'text-success' : 'text-subtle'}`} />
                <span className={`text-[9px] ${showSavedFlash ? 'text-success' : 'text-subtle'}`}>Saved</span>
              </div>
            </HoverCardTrigger>
            <HoverCardContent side="bottom" className="w-60 bg-card border-brand/30 p-0 overflow-hidden">
              <div className="bg-linear-to-r from-success/20 to-brand/10 px-3 py-1.5 border-b border-success/20">
                <p className="text-xs font-bold text-success inline-flex items-center gap-1.5">
                  <Check className="w-3 h-3" /> Auto-Save
                </p>
              </div>
              <div className="px-3 py-1.5 space-y-1">
                <p className="text-[10px] text-subtle leading-relaxed">
                  Progress saves automatically to your browser every few seconds. Sign in and bind an account to enable cloud sync.
                </p>
              </div>
            </HoverCardContent>
          </HoverCard>

          {/* Notification bell with type-coded badge */}
          <HoverCard openDelay={200} closeDelay={100}>
            <HoverCardTrigger asChild>
              <button
                type="button"
                className={`${btn44Ghost} relative`}
                onClick={() => onTabChange('notifications')}
                aria-label={`Notifications: ${unreadNotifications} unread`}
              >
                <Bell className="w-4 h-4" />
                {unreadNotifications > 0 && (
                  <span className={`absolute -top-0.5 -right-0.5 min-w-4 h-4 rounded-full text-[11px] text-white flex items-center justify-center px-1 font-bold ${
                    notifications[0]?.type === 'error' ? 'bg-danger' :
                    notifications[0]?.type === 'warning' ? 'bg-domain' :
                    'bg-brand'
                  }`}>
                    {unreadNotifications > 9 ? '9+' : unreadNotifications}
                  </span>
                )}
              </button>
            </HoverCardTrigger>
            <HoverCardContent side="bottom" className="w-72 bg-card border-brand/30 p-0 overflow-hidden">
              <div className="bg-linear-to-r from-brand/20 to-research/10 px-3 py-1.5 border-b border-brand/20">
                <p className="text-xs font-bold text-brand inline-flex items-center gap-1.5">
                  <Bell className="w-3 h-3" /> Notifications
                </p>
              </div>
              <div className="px-3 py-1.5 space-y-1">
                <div className="flex justify-between text-[10px]">
                  <span className="text-subtle">Unread</span>
                  <span className={`font-mono font-bold ${unreadNotifications > 0 ? 'text-brand' : 'text-subtle'}`}>{unreadNotifications}</span>
                </div>
                {notifications.length === 0 ? (
                  <p className="text-[10px] text-muted-label pt-1 border-t border-muted-label/20">No notifications yet. Tap to view the activity log.</p>
                ) : (
                  <div className="pt-1 border-t border-muted-label/20 max-h-32 overflow-y-auto game-scrollbar space-y-1">
                    {notifications.slice(0, 10).map(n => (
                      <div key={n.id} className={`text-[10px] py-0.5 ${
                        n.type === 'success' ? 'text-success' :
                        n.type === 'warning' ? 'text-warning' :
                        n.type === 'error' ? 'text-danger' : 'text-subtle'
                      }`}>
                        {n.message}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </HoverCardContent>
          </HoverCard>

          {/* Active events */}
          {activeEvents.length > 0 && (
            <div className="flex items-center gap-0.5">
              {activeEvents.map(e => (
                <HoverCard key={e.id} openDelay={200} closeDelay={100}>
                  <HoverCardTrigger asChild>
                    <Badge variant="outline" className="text-[9px] border-domain/50 text-domain bg-domain/20 px-1.5 py-0 h-5 neon-pulse cursor-default">
                      <GameIcon icon={e.icon} size={10} className="inline-flex" /> {e.remaining <= 50 ? `${e.remaining}t` : e.name}
                    </Badge>
                  </HoverCardTrigger>
                  <HoverCardContent side="bottom" className="w-64 bg-card border-domain/30 p-0 overflow-hidden">
                    <div className="bg-linear-to-r from-domain/20 to-warning/10 px-3 py-1.5 border-b border-domain/20">
                      <p className="text-xs font-bold text-domain inline-flex items-center gap-1.5">
                        <GameIcon icon={e.icon} size={12} className="inline-flex" /> {e.name}
                      </p>
                    </div>
                    <div className="px-3 py-1.5 space-y-1">
                      <p className="text-[10px] text-subtle leading-relaxed">{e.description}</p>
                      <div className="flex flex-wrap gap-1 pt-1">
                        {e.effects.filter(ef => ef.type === 'marketPriceMultiplier').map((ef, i) => (
                          <span key={`${ef.target}-${i}`} className={`text-[9px] px-1 py-0.5 rounded border ${ef.value > 1 ? 'border-success/40 text-success bg-success/5' : 'border-danger/40 text-danger bg-danger/5'}`}>
                            {ef.value > 1 ? <TrendingUp className="w-2.5 h-2.5 inline mr-0.5" /> : <TrendingDown className="w-2.5 h-2.5 inline mr-0.5" />}
                            {ef.target?.slice(0, 12)}{(ef.target?.length ?? 0) > 12 ? '…' : ''} {ef.value > 1 ? '+' : ''}{((ef.value - 1) * 100).toFixed(0)}%
                          </span>
                        ))}
                      </div>
                      <div className="flex justify-between text-[10px] pt-1 border-t border-muted-label/20">
                        <span className="text-subtle">Remaining</span>
                        <span className="text-warning font-mono font-bold">{formatRemaining(e.remaining)}</span>
                      </div>
                    </div>
                  </HoverCardContent>
                </HoverCard>
              ))}
            </div>
          )}

          {/* Weather badge */}
          <HoverCard openDelay={200} closeDelay={100}>
            <HoverCardTrigger asChild>
              <Badge variant="outline" className={`text-[9px] px-1.5 py-0 h-5 cursor-default ${
                weather.current === 'clear'
                  ? 'border-subtle/50 text-subtle bg-subtle/20'
                  : 'border-brand/50 text-brand bg-brand/20'
              }`}>
                <GameIcon icon={WEATHER_DEFS[weather.current]?.icon} size={10} className="inline-flex" /> {WEATHER_DEFS[weather.current]?.name}
              </Badge>
            </HoverCardTrigger>
            <HoverCardContent side="bottom" className="w-64 bg-card border-brand/30 p-0 overflow-hidden">
              <div className="bg-linear-to-r from-brand/20 to-research/10 px-3 py-1.5 border-b border-brand/20">
                <p className="text-xs font-bold text-brand inline-flex items-center gap-1.5">
                  <GameIcon icon={WEATHER_DEFS[weather.current]?.icon} size={12} className="inline-flex" /> {WEATHER_DEFS[weather.current]?.name}
                </p>
              </div>
              <div className="px-3 py-1.5 space-y-1">
                <p className="text-[10px] text-subtle leading-relaxed">{WEATHER_DEFS[weather.current]?.description}</p>
                {weather.remaining > 0 && (
                  <div className="flex justify-between text-[10px] pt-1 border-t border-muted-label/20">
                    <span className="text-subtle">Remaining</span>
                    <span className="text-brand font-mono font-bold">{formatRemaining(weather.remaining)}</span>
                  </div>
                )}
                <p className="text-[10px] text-muted-label pt-1 border-t border-muted-label/20 leading-relaxed">
                  Weather shifts over time and modifies production rates across all buildings.
                </p>
              </div>
            </HoverCardContent>
          </HoverCard>

          {/* Config source badge with reload */}
          <HoverCard openDelay={200} closeDelay={100}>
            <HoverCardTrigger asChild>
              <Badge variant="outline" className={`text-[9px] px-1.5 py-0 h-5 cursor-default ${
                isUsingSupabase ? 'border-success/50 text-success bg-success/20' : 'border-warning/50 text-warning bg-warning/20'
              }`}>
                {isUsingSupabase ? <Wifi className="w-2 h-2 mr-0.5" /> : <WifiOff className="w-2 h-2 mr-0.5" />}
                {isUsingSupabase ? 'Live' : 'Local'}
              </Badge>
            </HoverCardTrigger>
            <HoverCardContent side="bottom" className="w-64 bg-card border-brand/30 p-0 overflow-hidden">
              <div className={`bg-linear-to-r px-3 py-1.5 border-b ${isUsingSupabase ? 'from-success/20 to-brand/10 border-success/20' : 'from-warning/20 to-domain/10 border-warning/20'}`}>
                <p className={`text-xs font-bold inline-flex items-center gap-1.5 ${isUsingSupabase ? 'text-success' : 'text-warning'}`}>
                  {isUsingSupabase ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                  {isUsingSupabase ? 'Live (Supabase)' : 'Local Config'}
                </p>
              </div>
              <div className="px-3 py-1.5 space-y-1">
                <p className="text-[10px] text-subtle leading-relaxed">
                  {isUsingSupabase
                    ? 'Game data is fetched live from the Supabase backend. All players see the same economy.'
                    : 'Game data is served from your browser cache. Sign in to switch to the live shared economy.'}
                </p>
                <Button variant="ghost" size="sm" className="h-7 text-[10px] mt-1 w-full text-brand hover:text-brand hover:bg-brand/10 focus-visible:ring-2 focus-visible:ring-brand" onClick={reloadConfig}>
                  <RefreshCw className="w-2.5 h-2.5 mr-1" /> Refresh Config
                </Button>
              </div>
            </HoverCardContent>
          </HoverCard>

          {/* Online count */}
          <OnlineCount compact />

          {/* Cloud save — mirrors desktop standalone button */}
          {user ? (
            <HoverCard openDelay={200} closeDelay={100}>
              <HoverCardTrigger asChild>
                <button
                  type="button"
                  className="h-9 w-9 min-h-9 min-w-9 p-0 flex items-center justify-center rounded-lg text-subtle hover:text-brand hover:bg-white/[0.04] transition-colors focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background relative"
                  onClick={handleCloudSave}
                  aria-label="Save to Cloud"
                  disabled={cloudStatus === 'saving' || isSyncing}
                >
                  {cloudStatus === 'saving' ? (
                    <Loader2 className="w-4 h-4 text-brand animate-spin" aria-hidden="true" />
                  ) : cloudStatus === 'success' ? (
                    <Cloud className="w-4 h-4 text-success" aria-hidden="true" />
                  ) : cloudStatus === 'error' ? (
                    <CloudOff className="w-4 h-4 text-danger" aria-hidden="true" />
                  ) : (
                    <Cloud className="w-4 h-4" aria-hidden="true" />
                  )}
                </button>
              </HoverCardTrigger>
              <HoverCardContent side="bottom" className="w-60 bg-card border-brand/30 p-0 overflow-hidden">
                <div className="bg-linear-to-r from-brand/20 to-research/10 px-3 py-1.5 border-b border-brand/20">
                  <p className="text-xs font-bold text-brand inline-flex items-center gap-1.5">
                    <Cloud className="w-3 h-3" /> Cloud Save
                  </p>
                </div>
                <div className="px-3 py-1.5 space-y-1">
                  <div className="flex justify-between text-[10px]">
                    <span className="text-subtle">Status</span>
                    <span className="font-mono font-bold text-subtle">
                      {cloudStatus === 'saving' ? 'Saving…' : cloudStatus === 'success' ? 'Synced' : cloudStatus === 'error' ? 'Failed' : 'Idle'}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-label pt-1 border-t border-muted-label/20 leading-relaxed">
                    Tap to push your save to Supabase. Auto-saves locally every few seconds.
                  </p>
                </div>
              </HoverCardContent>
            </HoverCard>
          ) : (
            <HoverCard openDelay={200} closeDelay={100}>
              <HoverCardTrigger asChild>
                <button
                  type="button"
                  className="h-9 w-9 min-h-9 min-w-9 p-0 flex items-center justify-center rounded-lg text-subtle hover:text-brand hover:bg-white/[0.04] transition-colors focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  onClick={() => promptLogin('cloud_save')}
                  aria-label="Sign in for Cloud Save"
                >
                  <Cloud className="w-4 h-4" aria-hidden="true" />
                </button>
              </HoverCardTrigger>
              <HoverCardContent side="bottom" className="w-60 bg-card border-warning/30 p-0 overflow-hidden">
                <div className="bg-linear-to-r from-warning/20 to-domain/10 px-3 py-1.5 border-b border-warning/20">
                  <p className="text-xs font-bold text-warning inline-flex items-center gap-1.5">
                    <Cloud className="w-3 h-3" /> Cloud Save Locked
                  </p>
                </div>
                <div className="px-3 py-1.5">
                  <p className="text-[10px] text-subtle leading-relaxed">
                    Sign in to enable cloud saves that sync across all your devices.
                  </p>
                </div>
              </HoverCardContent>
            </HoverCard>
          )}
        </div>
      </div>

      {/* ── Row 5: User menu + more actions ── */}
      <div className="flex items-center gap-1">
        {authLoading ? (
          <Loader2 className="w-5 h-5 text-subtle animate-spin" />
        ) : isGuest ? (
          <HoverCard openDelay={200} closeDelay={100}>
            <HoverCardTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-11 min-h-11 px-3 text-xs text-brand hover:text-brand border border-brand/30 hover:border-brand/40 hover:bg-brand/10 rounded-lg focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                onClick={() => promptLogin('manual')}
              >
                <LogIn className="w-3.5 h-3.5 mr-1" /> Bind Account
              </Button>
            </HoverCardTrigger>
            <HoverCardContent side="bottom" className="w-64 bg-card border-brand/30 p-0 overflow-hidden">
              <div className="bg-linear-to-r from-brand/20 to-success/10 px-3 py-1.5 border-b border-brand/20">
                <p className="text-xs font-bold text-brand inline-flex items-center gap-1.5">
                  <LogIn className="w-3 h-3" /> Bind Account
                </p>
              </div>
              <div className="px-3 py-1.5 space-y-1">
                <p className="text-[10px] text-subtle leading-relaxed">
                  Link a permanent account to your progress to unlock cloud save, cross-device sync, and leaderboards.
                </p>
                <p className="text-[10px] text-muted-label pt-1 border-t border-muted-label/20 leading-relaxed">
                  Currently playing as guest — your save stays in this browser until you bind.
                </p>
              </div>
            </HoverCardContent>
          </HoverCard>
        ) : user ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-1.5 bg-card rounded-lg px-2 py-1.5 border border-brand/20 hover:border-brand/30 transition-colors cursor-pointer min-h-11 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                aria-label={`Account menu for ${userName}${isGuest ? ' (guest)' : ''}`}
                aria-haspopup="menu"
              >
                {userAvatar ? (
                  <Image src={userAvatar} alt={userName} width={24} height={24} className="rounded-full" />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-linear-to-br from-brand to-success/80 flex items-center justify-center text-[10px] font-bold" aria-hidden="true">
                    {userName.charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="text-[10px] text-subtle max-w-15 truncate">{userName}</span>
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
                <div className="text-[10px] text-subtle font-normal">
                  {isGuest ? 'Playing as Guest' : (user.email ?? 'Google account')}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {onManageAccount && (
                <DropdownMenuItem onSelect={onManageAccount} className="text-xs cursor-pointer focus-visible:ring-2 focus-visible:ring-brand">
                  <User className="w-3 h-3 mr-2" /> Manage Account
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={handleCloudSave} className="text-xs cursor-pointer focus-visible:ring-2 focus-visible:ring-brand" disabled={cloudStatus === 'saving' || isSyncing}>
                <Cloud className="w-3 h-3 mr-2" /> Save to Cloud
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={handleCloudLoad} className="text-xs cursor-pointer focus-visible:ring-2 focus-visible:ring-brand" disabled={cloudStatus === 'loading'}>
                <Download className="w-3 h-3 mr-2" /> Load from Cloud
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
            className="h-11 min-h-11 px-3 text-xs text-brand hover:text-brand border border-brand/30 hover:border-brand/40 hover:bg-brand/10 rounded-lg focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            onClick={() => promptLogin('manual')}
          >
            <LogIn className="w-3.5 h-3.5 mr-1" /> Sign In
          </Button>
        )}

        {/* Tools menu — always visible (matches desktop) */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={`${btn44Ghost}`}
              aria-label="Tools menu"
            >
              <Wrench aria-hidden="true" className="w-4 h-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44 bg-card border-brand/30">
            <DropdownMenuLabel className="text-xs">Tools</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={reloadConfig} className="text-xs cursor-pointer focus-visible:ring-2 focus-visible:ring-brand">
              <RefreshCw className="w-3 h-3 mr-2" aria-hidden="true" /> Reload Config
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
