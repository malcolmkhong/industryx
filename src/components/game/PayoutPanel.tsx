"use client";

import { useGameStore, formatNumber } from "@/lib/game/state/store";
import { BUILDING_DEFS } from "@/lib/game/config/configCache";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DollarSign,
  Clock,
  TrendingUp,
  Zap,
  Factory,
  Pickaxe,
  Sun,
  Wind,
  Coins,
  Info,
  ChevronDown,
  ChevronUp,
  User,
  Users,
  Sparkles,
  Cloud,
  CloudRain,
  CloudLightning,
  Flame,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { GameIcon } from "@/components/icons";
import { formatRemaining, formatDuration } from "@/lib/utils/time";
import { useAuth } from "@/components/providers/AuthProvider";
import type { WeatherType } from "@/lib/game/shared/types/production";
export function PayoutPanel() {
  const buildings = useGameStore((s) => s.buildings);
  const gameTick = useGameStore((s) => s.gameTick);
  const gameSpeed = useGameStore((s) => s.gameSpeed);
  const prestigeState = useGameStore((s) => s.prestigeState);
  const payoutConfig = useGameStore((s) => s.payoutConfig);
  const pendingPayout = useGameStore((s) => s.pendingPayout);
  const payoutHistory = useGameStore((s) => s.payoutHistory);
  const money = useGameStore((s) => s.money);
  const totalMoneyEarned = useGameStore((s) => s.totalMoneyEarned);
  const collectPayout = useGameStore((s) => s.collectPayout);
  const toggleAutoCollect = useGameStore((s) => s.toggleAutoCollect);
  const activeEvents = useGameStore((s) => s.activeEvents);
  const weather = useGameStore((s) => s.weather);
  const loginStreak = useGameStore((s) => s.loginStreak);
  const { user, isGuest } = useAuth();
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [tipsExpanded, setTipsExpanded] = useState(true);
  const [lastCollectedAt, setLastCollectedAt] = useState<number | null>(() => {
    if (payoutHistory.length === 0) return null;
    return payoutHistory[payoutHistory.length - 1].tick;
  });
  // Fix #4: a wall-clock "now" that ticks every 15s so the
  // lastCollectedLabel can be computed without calling Date.now() in a
  // useMemo (which React's purity rules forbid — `useMemo` should be a
  // pure function of its inputs and snapshot of Date.now() is not).
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 15000);
    return () => window.clearInterval(id);
  }, []);
  const activeBuildings = useMemo(
    () => buildings.filter(b => b.active),
    [buildings],
  );
  const extractors = useMemo(
    () => activeBuildings.filter(b => BUILDING_DEFS[b.type]?.category === 'extractor'),
    [activeBuildings],
  );
  const factories = useMemo(
    () => activeBuildings.filter(b => BUILDING_DEFS[b.type]?.category === 'factory'),
    [activeBuildings],
  );
  const powerPlants = useMemo(
    () => activeBuildings.filter(b => BUILDING_DEFS[b.type]?.category === 'power'),
    [activeBuildings],
  );

  const extractorRate = 20;
  const factoryRate = 50;
  const powerRate = 10;

  const incomeBreakdown = useMemo(() => {
    const extractorIncome = extractors.reduce((sum, b) => sum + extractorRate * b.level * b.efficiency, 0);
    const factoryIncome = factories.reduce((sum, b) => sum + factoryRate * b.level * b.efficiency, 0);
    const powerIncome = powerPlants.reduce((sum, b) => sum + powerRate * b.level * b.efficiency, 0);
    const totalRawIncome = extractorIncome + factoryIncome + powerIncome;
    return { extractorIncome, factoryIncome, powerIncome, totalRawIncome };
  }, [extractors, factories, powerPlants]);
  const { extractorIncome, factoryIncome, powerIncome, totalRawIncome } = incomeBreakdown;

  const avgEfficiency = useMemo(
    () => activeBuildings.length > 0
      ? activeBuildings.reduce((sum, b) => sum + b.efficiency, 0) / activeBuildings.length
      : 0,
    [activeBuildings],
  );

  const purchasedGameSpeedBonuses = useMemo(
    () => prestigeState.bonuses.filter(b => b.purchased && b.effect.type === 'gameSpeed'),
    [prestigeState.bonuses],
  );
  const prestigeSpeedBonus = useMemo(
    () => purchasedGameSpeedBonuses.reduce((sum, b) => sum + b.effect.value, 0),
    [purchasedGameSpeedBonuses],
  );

  const effectiveSpeed = useMemo(
    () => gameSpeed * (1 + prestigeSpeedBonus),
    [gameSpeed, prestigeSpeedBonus],
  );
  const activeProductionMultipliers = useMemo(() => {
    const result: Array<{ id: string; eventName: string; target: string | undefined; value: number }> = [];
    for (const ev of activeEvents) {
      for (const eff of ev.effects ?? []) {
        if (eff.type === 'productionMultiplier') {
          result.push({ id: eff.id, eventName: ev.name, target: eff.target, value: eff.value });
        }
      }
    }
    return result;
  }, [activeEvents]);
  const eventMultiplier = useMemo(
    () => activeProductionMultipliers.reduce((acc, m) => acc * m.value, 1),
    [activeProductionMultipliers],
  );

  const weatherModifier = useMemo(() => {
    const current: WeatherType = weather?.current ?? 'clear';
    const intensity = weather?.intensity ?? 0;
    const sign = current === 'sunny' ? 1 : current === 'clear' ? 0 : -1;
    return 1 + sign * intensity;
  }, [weather]);

  const loginStreakMultiplier = useMemo(() => {
    const days = loginStreak?.currentStreak ?? 0;
    if (days <= 0) return 1;
    return 1 + Math.min(days, 30) * 0.005;
  }, [loginStreak]);

  const estimatedPayout = useMemo(
    () => Math.floor(
      incomeBreakdown.totalRawIncome
        * avgEfficiency
        * eventMultiplier
        * weatherModifier
        * loginStreakMultiplier,
    ),
    [incomeBreakdown.totalRawIncome, avgEfficiency, eventMultiplier, weatherModifier, loginStreakMultiplier],
  );

  const ticksSinceLastPayout = gameTick - payoutConfig.lastPayoutTick;
  const ticksUntilPayout = Math.max(0, payoutConfig.basePayoutInterval - ticksSinceLastPayout);
  const payoutProgress = Math.min(100, (ticksSinceLastPayout / payoutConfig.basePayoutInterval) * 100);
  const secondsUntilPayout = Math.floor(ticksUntilPayout / effectiveSpeed);
  const payoutsPerMinute = 60 / payoutConfig.basePayoutInterval * effectiveSpeed;
  const incomePerMinute = estimatedPayout * payoutsPerMinute;
  const tips = useMemo<Array<{ id: string; node: ReactNode }>>(() => {
    const result: Array<{ id: string; node: ReactNode }> = [];
    if (buildings.length === 0) {
      result.push({ id: 'no-buildings', node: <><GameIcon icon="game-icons:castle" size={14} className="inline" /> Build your first building to start receiving payouts!</> });
    } else {
      if (factories.length === 0) result.push({ id: 'no-factories', node: <><GameIcon icon="game-icons:factory" size={14} className="inline" /> Build factories to increase your payout — they earn $50/cycle per building!</> });
      if (extractors.length === 0) result.push({ id: 'no-extractors', node: <><GameIcon icon="game-icons:mining" size={14} className="inline" /> Build extractors to earn $20/cycle per building from raw material production!</> });
      if (avgEfficiency < 0.8) result.push({ id: 'low-efficiency', node: <><GameIcon icon="game-icons:lightning-frequency" size={14} className="inline" /> Improve power efficiency to boost payouts — build more power plants!</> });
      if (payoutConfig.autoCollect) result.push({ id: 'auto-collect-on', node: <><GameIcon icon="game-icons:spinning-wheel" size={14} className="inline" /> Auto-collect is ON — payouts go directly to your balance.</> });
      else result.push({ id: 'auto-collect-off', node: <><GameIcon icon="game-icons:hand" size={14} className="inline" /> Click &quot;Collect&quot; to claim your pending payout, or enable auto-collect.</> });
      if (factories.length > extractors.length * 2) result.push({ id: 'imbalance', node: <><GameIcon icon="game-icons:scales" size={14} className="inline" /> Consider building more extractors to supply your factories.</> });
      if (gameSpeed === 1) result.push({ id: 'speed-up', node: <><GameIcon icon="game-icons:fast-forward-button" size={14} className="inline" /> Increase game speed to receive payouts more frequently!</> });
      if (estimatedPayout < 10) result.push({ id: 'low-payout', node: <><GameIcon icon="game-icons:profit" size={14} className="inline" /> Build more buildings or upgrade existing ones to increase payout amounts.</> });
    }
    return result;
  }, [buildings.length, factories.length, extractors.length, avgEfficiency, payoutConfig.autoCollect, gameSpeed, estimatedPayout]);

  const weatherDisplay = useMemo(() => {
    const current: WeatherType = weather?.current ?? 'clear';
    const intensity = Math.round((weather?.intensity ?? 0) * 100);
    const map: Record<WeatherType, { label: string; tone: string; Icon: typeof Sun }> = {
      clear: { label: 'Clear', tone: 'text-brand', Icon: Sun },
      sunny: { label: 'Sunny', tone: 'text-warning', Icon: Sun },
      rainy: { label: 'Rainy', tone: 'text-info', Icon: CloudRain },
      stormy: { label: 'Stormy', tone: 'text-danger', Icon: CloudLightning },
      foggy: { label: 'Foggy', tone: 'text-muted-label', Icon: Cloud },
      snowy: { label: 'Snowy', tone: 'text-info', Icon: Cloud },
    };
    return { ...map[current], intensity };
  }, [weather]);

  const identity = useMemo(() => {
    if (user) {
      const meta = user.user_metadata as { name?: string; full_name?: string; user_name?: string } | null;
      const name = meta?.name || meta?.full_name || meta?.user_name || user.email || 'Player';
      return { label: name, kind: 'authenticated' as const };
    }
    if (isGuest) return { label: 'Guest', kind: 'guest' as const };
    return { label: 'Anonymous', kind: 'anonymous' as const };
  }, [user, isGuest]);

  const handleCollectWithTimestamp = () => {
    setLastCollectedAt(Date.now());
    collectPayout();
  };

  const lastCollectedLabel = useMemo(() => {
    if (lastCollectedAt === null) return null;
    const diffMs = nowMs - lastCollectedAt;
    if (diffMs < 0) return 'just now';
    const sec = Math.floor(diffMs / 1000);
    if (sec < 5) return 'just now';
    if (sec < 60) return `${sec}s ago`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min} minute${min === 1 ? '' : 's'} ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr} hour${hr === 1 ? '' : 's'} ago`;
    const day = Math.floor(hr / 24);
    return `${day} day${day === 1 ? '' : 's'} ago`;
  }, [lastCollectedAt, nowMs]);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-2 min-w-0">
          {identity.kind === 'authenticated' ? (
            <User className="w-3.5 h-3.5 text-success shrink-0" aria-label="authenticated" />
          ) : identity.kind === 'guest' ? (
            <Users className="w-3.5 h-3.5 text-warning shrink-0" aria-label="guest" />
          ) : (
            <User className="w-3.5 h-3.5 text-muted-label shrink-0" aria-label="anonymous" />
          )}
          <span className="text-xs text-muted-label truncate">{identity.label}</span>
          <Badge
            variant="outline"
            className={
              identity.kind === 'authenticated'
                ? 'text-[9px] border-success/40 text-success bg-success/10 uppercase tracking-wider'
                : identity.kind === 'guest'
                  ? 'text-[9px] border-warning/40 text-warning bg-warning/10 uppercase tracking-wider'
                  : 'text-[9px] border-muted-label/40 text-muted-label bg-muted-label/10 uppercase tracking-wider'
            }
          >
            {identity.kind}
          </Badge>
        </div>
        {loginStreak && loginStreak.currentStreak > 0 && (
          <div className="flex items-center gap-1 text-[10px] text-warning shrink-0">
            <Flame className="w-3 h-3" aria-label="streak" />
            <span className="font-mono">{loginStreak.currentStreak}d streak</span>
            {loginStreak.longestStreak > loginStreak.currentStreak && (
              <span className="text-muted-label ml-1">(best {loginStreak.longestStreak}d)</span>
            )}
          </div>
        )}
      </div>

      <Card className="bg-card border-brand/30 overflow-hidden">
        <div className="absolute inset-0 bg-linear-to-r from-success/30/10 via-transparent to-success/30/10 pointer-events-none" />
        <CardContent className="p-4 relative">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-label uppercase tracking-wider">Current Balance</p>
              <p className="text-3xl font-bold text-success font-mono mt-1">
                ${formatNumber(money)}
              </p>
              <p className="text-[10px] text-muted-label mt-1">
                Total earned: ${formatNumber(totalMoneyEarned)}
              </p>
            </div>
            <div className="text-right">
              <div className="w-16 h-16 rounded-full bg-success/20 border-2 border-success/30 flex items-center justify-center">
                <DollarSign className="w-8 h-8 text-success" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="bg-card border-brand/30">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-xs text-brand flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" /> Next Payout
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold text-brand font-mono">
                  {formatRemaining(ticksUntilPayout)}
                </span>
                <span className="text-xs text-muted-label">~{secondsUntilPayout}s</span>
              </div>
              <Progress value={payoutProgress} className="h-2 bg-muted-label [&>div]:bg-brand" />
              <div className="flex items-center justify-between text-[10px] text-muted-label">
                <span>Every {formatDuration(payoutConfig.basePayoutInterval)}</span>
                <span>{Math.round(payoutProgress)}%</span>
              </div>
              {lastCollectedLabel && (
                <div className="flex items-center gap-1 text-[10px] text-muted-label pt-1 border-t border-brand/15">
                  <Clock className="w-3 h-3" aria-hidden="true" />
                  <span>Last collected: {lastCollectedLabel}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-brand/30">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-xs text-success flex items-center gap-1.5">
              <Coins className="w-3.5 h-3.5" /> Pending Payout
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold text-success font-mono">
                  ${formatNumber(pendingPayout)}
                </span>
                {!payoutConfig.autoCollect && pendingPayout > 0 && (
                  <Button
                    size="sm"
                    className="bg-success hover:bg-success text-white text-xs h-8 animate-pulse"
                    onClick={handleCollectWithTimestamp}
                  >
                    Collect
                  </Button>
                )}
                {payoutConfig.autoCollect && (
                  <Badge variant="outline" className="text-[10px] border-success/40 text-success bg-success/20">
                    AUTO
                  </Badge>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-label">Auto-collect</span>
                <Switch
                  checked={payoutConfig.autoCollect}
                  onCheckedChange={toggleAutoCollect}
                  className="data-[state=checked]:bg-success"
                />
              </div>
              <p className="text-[10px] text-muted-label">
                {payoutConfig.autoCollect
                  ? 'Payouts are automatically added to your balance'
                  : 'Payouts accumulate until you manually collect them'}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
      <Card className="bg-card border-brand/30">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-xs text-brand flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5" /> Income Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-md bg-warning/20 flex items-center justify-center">
                  <Pickaxe className="w-4 h-4 text-warning" />
                </div>
                <div>
                  <p className="text-xs text-warning">Extractors</p>
                  <p className="text-[10px] text-muted-label">{extractors.length} active • ${extractorRate}/cycle each</p>
                </div>
              </div>
              <span className="text-sm font-mono text-warning">${formatNumber(extractorIncome)}</span>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-md bg-domain/20 flex items-center justify-center">
                  <Factory className="w-4 h-4 text-domain" />
                </div>
                <div>
                  <p className="text-xs text-domain">Factories</p>
                  <p className="text-[10px] text-muted-label">{factories.length} active • ${factoryRate}/cycle each</p>
                </div>
              </div>
              <span className="text-sm font-mono text-domain">${formatNumber(factoryIncome)}</span>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-md bg-warning/20 flex items-center justify-center">
                  <Zap className="w-4 h-4 text-warning" />
                </div>
                <div>
                  <p className="text-xs text-warning">Power Plants</p>
                  <p className="text-[10px] text-muted-label">{powerPlants.length} active • ${powerRate}/cycle each</p>
                </div>
              </div>
              <span className="text-sm font-mono text-warning">${formatNumber(powerIncome)}</span>
            </div>

            <div className="border-t border-brand/20 pt-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-subtle">Raw Income / Cycle</span>
                <span className="text-sm font-mono text-brand">${formatNumber(totalRawIncome)}</span>
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-xs text-subtle">Speed Multiplier</span>
                <span className="text-xs font-mono text-brand">×{effectiveSpeed.toFixed(1)}</span>
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-xs text-subtle">Avg Efficiency</span>
                <span className={`text-xs font-mono ${avgEfficiency >= 0.8 ? 'text-success' : avgEfficiency >= 0.5 ? 'text-warning' : 'text-danger'}`}>
                  {(avgEfficiency * 100).toFixed(1)}%
                </span>
              </div>
              {activeProductionMultipliers.length > 0 && (
                <div className="mt-2 pt-2 border-t border-brand/15">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Sparkles className="w-3 h-3 text-domain" aria-hidden="true" />
                    <span className="text-[10px] text-muted-label uppercase tracking-wider">Active Event Bonuses</span>
                  </div>
                  <div className="space-y-1">
                    {activeProductionMultipliers.map((m) => (
                      <div key={m.id} className="flex items-center justify-between text-[10px]">
                        <span className="text-subtle truncate pr-2">
                          {m.eventName}
                          {m.target ? <span className="text-muted-label"> · {m.target}</span> : null}
                        </span>
                        <span className={`font-mono shrink-0 ${m.value >= 1 ? 'text-success' : 'text-danger'}`}>
                          ×{m.value.toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-2 pt-2 border-t border-brand/15">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <weatherDisplay.Icon className={`w-3 h-3 shrink-0 ${weatherDisplay.tone}`} aria-hidden="true" />
                    <span className="text-[10px] text-muted-label uppercase tracking-wider">Weather</span>
                    <span className={`text-xs ${weatherDisplay.tone}`}>{weatherDisplay.label}</span>
                    {weatherDisplay.intensity > 0 && (
                      <span className="text-[10px] text-muted-label">({weatherDisplay.intensity}% intensity)</span>
                    )}
                  </div>
                  <span className={`text-xs font-mono shrink-0 ${weatherModifier > 1 ? 'text-success' : weatherModifier < 1 ? 'text-danger' : 'text-muted-label'}`}>
                    ×{weatherModifier.toFixed(2)}
                  </span>
                </div>
              </div>

              {purchasedGameSpeedBonuses.length > 0 && (
                <div className="mt-2 pt-2 border-t border-brand/15">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Sparkles className="w-3 h-3 text-domain" aria-hidden="true" />
                    <span className="text-[10px] text-muted-label uppercase tracking-wider">Prestige Bonuses</span>
                  </div>
                  <div className="space-y-1">
                    {purchasedGameSpeedBonuses.map((b) => (
                      <div key={b.id} className="flex items-center justify-between text-[10px]">
                        <span className="text-subtle truncate pr-2">{b.name}</span>
                        <span className="font-mono text-success shrink-0">+{Math.round(b.effect.value * 100)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {loginStreak && loginStreak.currentStreak > 0 && loginStreakMultiplier > 1 && (
                <div className="mt-2 pt-2 border-t border-brand/15">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Flame className="w-3 h-3 text-warning" aria-hidden="true" />
                      <span className="text-[10px] text-muted-label uppercase tracking-wider">Streak Bonus</span>
                      <span className="text-xs text-warning">{loginStreak.currentStreak} day{loginStreak.currentStreak === 1 ? '' : 's'}</span>
                    </div>
                    <span className="text-xs font-mono text-success">×{loginStreakMultiplier.toFixed(3)}</span>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between mt-2 pt-2 border-t border-brand/15">
                <span className="text-xs font-bold text-success">Est. Next Payout</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-base font-mono font-bold text-success cursor-help underline decoration-dotted underline-offset-2">
                      ${formatNumber(estimatedPayout)}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <p className="text-[10px]">
                      Raw income × avg efficiency × event bonus × weather × streak.
                      Server is authoritative — actual payout may differ.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-[10px] text-muted-label">Est. Income / Min</span>
                <span className="text-xs font-mono text-subtle">${formatNumber(incomePerMinute)}/min</span>
              </div>
            </div>
            <div className="mt-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-muted-label">Efficiency Modifier</span>
                <span className="text-[10px] text-subtle">{(avgEfficiency * 100).toFixed(0)}%</span>
              </div>
              <div className="w-full h-1.5 bg-muted-label rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    avgEfficiency >= 0.8 ? 'bg-success' : avgEfficiency >= 0.5 ? 'bg-warning' : 'bg-danger'
                  }`}
                  style={{ width: `${avgEfficiency * 100}%` }}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-3 gap-3">
        <Card className="bg-card border-brand/30">
          <CardContent className="p-3 text-center">
            <p className="text-[10px] text-muted-label uppercase">Total Payouts</p>
            <p className="text-lg font-bold text-brand font-mono">{payoutConfig.totalPayoutsReceived}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-brand/30">
          <CardContent className="p-3 text-center">
            <p className="text-[10px] text-muted-label uppercase">Active Buildings</p>
            <p className="text-lg font-bold text-brand font-mono">{activeBuildings.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-brand/30">
          <CardContent className="p-3 text-center">
            <p className="text-[10px] text-muted-label uppercase">Income/Min</p>
            <p className="text-lg font-bold text-success font-mono">${formatNumber(incomePerMinute)}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card border-brand/30">
        <CardHeader className="pb-2 pt-4 px-4">
          <button
            className="w-full flex items-center justify-between"
            onClick={() => setHistoryExpanded(!historyExpanded)}
            aria-expanded={historyExpanded}
          >
            <CardTitle className="text-xs text-brand flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" /> Payout History
              {payoutHistory.length > 0 && (
                <Badge variant="outline" className="text-[9px] border-muted-label/40 text-muted-label ml-1">
                  {payoutHistory.length}
                </Badge>
              )}
            </CardTitle>
            {historyExpanded ? (
              <ChevronUp className="w-3.5 h-3.5 text-muted-label" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-muted-label" />
            )}
          </button>
        </CardHeader>
        {historyExpanded && payoutHistory.length > 0 && (
          <div className="overflow-hidden">
            <CardContent className="px-4 pb-4">
              <div className="space-y-2 max-h-64 overflow-y-auto game-scrollbar">
                {[...payoutHistory].reverse().map((record) => (
                  <div
                    key={record.tick}
                    className="flex items-center justify-between py-1.5 px-2 rounded-md bg-muted-label/30 border border-muted-label/30"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-label">Tick {record.tick}</span>
                      <Badge variant="outline" className="text-[9px] border-muted-label text-subtle h-4 px-1">
                        {record.buildingCount} buildings
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-label">{(record.efficiency * 100).toFixed(0)}% eff</span>
                      <span className="text-xs font-mono text-success">+${formatNumber(record.amount)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </div>
        )}
        {historyExpanded && payoutHistory.length === 0 && (
          <CardContent className="px-4 pb-4">
            <p className="text-xs text-muted-label text-center py-3">No payouts yet. Build buildings to start earning!</p>
          </CardContent>
        )}
      </Card>
      <Card className="bg-card border-brand/30">
        <CardHeader className="pb-2 pt-4 px-4">
          <button
            className="w-full flex items-center justify-between"
            onClick={() => setTipsExpanded(!tipsExpanded)}
            aria-expanded={tipsExpanded}
          >
            <CardTitle className="text-xs text-brand flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5" /> Income Tips
            </CardTitle>
            {tipsExpanded ? (
              <ChevronUp className="w-3.5 h-3.5 text-muted-label" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-muted-label" />
            )}
          </button>
        </CardHeader>
        {tipsExpanded && (
          <div className="overflow-hidden">
            <CardContent className="px-4 pb-4">
              <div className="space-y-2">
                {tips.map((tip) => (
                  <div key={tip.id} className="text-xs text-subtle py-1 px-2 rounded bg-muted-label/20 border border-muted-label/20">
                    {tip.node}
                  </div>
                ))}
              </div>
            </CardContent>
          </div>
        )}
      </Card>

      <Card className="bg-card border-brand/30">
        <CardContent className="p-4">
          <p className="text-[10px] text-muted-label leading-relaxed">
            <GameIcon icon="game-icons:light-bulb" size={14} className="inline" /> <span className="text-muted-label">How Payouts Work:</span> Every {formatDuration(payoutConfig.basePayoutInterval)},
            your factory generates a payout based on active buildings. Extractors earn ${extractorRate}/cycle,
            Factories earn ${factoryRate}/cycle, and Power Plants earn ${powerRate}/cycle per building (scaled by level and efficiency).
            The total is modified by game speed, average building efficiency, prestige bonuses, active events, weather, and your login streak.
          </p>
          <div className="mt-2 pt-2 border-t border-brand/15 flex items-center gap-2 text-[10px] text-muted-label">
            <span>Weather modifiers:</span>
            <Sun className="w-3 h-3 text-warning" aria-label="sunny" />
            <Wind className="w-3 h-3 text-brand" aria-label="windy" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
