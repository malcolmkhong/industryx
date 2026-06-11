'use client';

import { useGameStore, formatNumber } from '@/lib/game/store';
import { BUILDING_DEFS } from '@/lib/game/configCache';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  DollarSign, Clock, TrendingUp, Zap, Factory, Pickaxe,
  Sun, Wind, Coins, Info, ChevronDown, ChevronUp,
} from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { GameIcon } from '@/components/game/shared/GameIcon';

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
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [tipsExpanded, setTipsExpanded] = useState(true);

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

  // 03.2 FIX: memoize filter+reduce chains so they only re-compute when
  // buildings change, not on every render (which happens on every tick).
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

  // 03.2 FIX: memoize effectiveSpeed (game speed × prestige speed bonus)
  // so it doesn't re-compute on every render.
  const effectiveSpeed = useMemo(
    () => gameSpeed * (1 + prestigeState.bonuses
      .filter(b => b.purchased && b.effect.type === 'gameSpeed')
      .reduce((sum, b) => sum + b.effect.value, 0)),
    [gameSpeed, prestigeState.bonuses],
  );

  const estimatedPayout = useMemo(
    () => Math.floor(incomeBreakdown.totalRawIncome * avgEfficiency),
    [incomeBreakdown.totalRawIncome, avgEfficiency],
  );

  // Payout timer
  const ticksSinceLastPayout = gameTick - payoutConfig.lastPayoutTick;
  const ticksUntilPayout = Math.max(0, payoutConfig.basePayoutInterval - ticksSinceLastPayout);
  const payoutProgress = Math.min(100, (ticksSinceLastPayout / payoutConfig.basePayoutInterval) * 100);
  const secondsUntilPayout = Math.floor(ticksUntilPayout / effectiveSpeed);

  // Income per minute estimate
  // NOTE: Do NOT multiply by gameSpeed — ticks already fire faster
  const payoutsPerMinute = 60 / payoutConfig.basePayoutInterval * effectiveSpeed;
  const incomePerMinute = estimatedPayout * payoutsPerMinute;

  // Tips — 03.2 FIX: memoize so this list only recomputes when underlying
  // buildings/payout config change, not on every tick.
  const tips = useMemo<ReactNode[]>(() => {
    const result: ReactNode[] = [];
    if (buildings.length === 0) {
      result.push(<><GameIcon icon="gi:castle" size={14} className="inline" /> Build your first building to start receiving payouts!</>);
    } else {
      if (factories.length === 0) result.push(<><GameIcon icon="gi:factory" size={14} className="inline" /> Build factories to increase your payout — they earn $50/cycle per building!</>);
      if (extractors.length === 0) result.push(<><GameIcon icon="gi:mining" size={14} className="inline" /> Build extractors to earn $20/cycle per building from raw material production!</>);
      if (avgEfficiency < 0.8) result.push(<><GameIcon icon="gi:lightning-frequency" size={14} className="inline" /> Improve power efficiency to boost payouts — build more power plants!</>);
      if (payoutConfig.autoCollect) result.push(<><GameIcon icon="gi:spinning-wheel" size={14} className="inline" /> Auto-collect is ON — payouts go directly to your balance.</>);
      else result.push(<>👆 Click "Collect" to claim your pending payout, or enable auto-collect.</>);
      if (factories.length > extractors.length * 2) result.push(<><GameIcon icon="gi:scales" size={14} className="inline" /> Consider building more extractors to supply your factories.</>);
      if (gameSpeed === 1) result.push(<><GameIcon icon="gi:fast-forward-button" size={14} className="inline" /> Increase game speed to receive payouts more frequently!</>);
      if (estimatedPayout < 10) result.push(<><GameIcon icon="gi:profit" size={14} className="inline" /> Build more buildings or upgrade existing ones to increase payout amounts.</>);
    }
    return result;
  }, [buildings.length, factories.length, extractors.length, avgEfficiency, payoutConfig.autoCollect, gameSpeed, estimatedPayout]);

  return (
    <div className="space-y-4">
      {/* Money Balance Header */}
      <Card className="bg-card border-cyan-900/30 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-green-900/10 via-transparent to-emerald-900/10 pointer-events-none" />
        <CardContent className="p-4 relative">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider">Current Balance</p>
              <p className="text-3xl font-bold text-green-400 font-mono mt-1">
                ${formatNumber(money)}
              </p>
              <p className="text-[10px] text-gray-600 mt-1">
                Total earned: ${formatNumber(totalMoneyEarned)}
              </p>
            </div>
            <div className="text-right">
              <div className="w-16 h-16 rounded-full bg-green-900/20 border-2 border-green-500/30 flex items-center justify-center">
                <DollarSign className="w-8 h-8 text-green-400" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Payout Timer + Pending */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Timer Card */}
        <Card className="bg-card border-cyan-900/30">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-xs text-cyan-400 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" /> Next Payout
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold text-cyan-300 font-mono">
                  {ticksUntilPayout}t
                </span>
                <span className="text-xs text-gray-500">
                  ~{secondsUntilPayout}s
                </span>
              </div>
              <Progress value={payoutProgress} className="h-2 bg-gray-800 [&>div]:bg-cyan-500" />
              <div className="flex items-center justify-between text-[10px] text-gray-500">
                <span>Every {payoutConfig.basePayoutInterval} ticks</span>
                <span>{Math.round(payoutProgress)}%</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Pending Payout Card */}
        <Card className="bg-card border-cyan-900/30">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-xs text-green-400 flex items-center gap-1.5">
              <Coins className="w-3.5 h-3.5" /> Pending Payout
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold text-green-300 font-mono">
                  ${formatNumber(pendingPayout)}
                </span>
                {!payoutConfig.autoCollect && pendingPayout > 0 && (
                  <Button
                    size="sm"
                    className="bg-green-600 hover:bg-green-500 text-white text-xs h-8 animate-pulse"
                    onClick={collectPayout}
                  >
                    Collect
                  </Button>
                )}
                {payoutConfig.autoCollect && (
                  <Badge variant="outline" className="text-[10px] border-green-500/40 text-green-400 bg-green-900/20">
                    AUTO
                  </Badge>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Auto-collect</span>
                <Switch
                  checked={payoutConfig.autoCollect}
                  onCheckedChange={toggleAutoCollect}
                  className="data-[state=checked]:bg-green-600"
                />
              </div>
              <p className="text-[10px] text-gray-600">
                {payoutConfig.autoCollect
                  ? 'Payouts are automatically added to your balance'
                  : 'Payouts accumulate until you manually collect them'}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Income Breakdown */}
      <Card className="bg-card border-cyan-900/30">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-xs text-cyan-400 flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5" /> Income Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="space-y-3">
            {/* Extractor Income */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-md bg-amber-900/20 flex items-center justify-center">
                  <Pickaxe className="w-4 h-4 text-amber-400" />
                </div>
                <div>
                  <p className="text-xs text-amber-300">Extractors</p>
                  <p className="text-[10px] text-gray-500">{extractors.length} active • ${extractorRate}/cycle each</p>
                </div>
              </div>
              <span className="text-sm font-mono text-amber-400">${formatNumber(extractorIncome)}</span>
            </div>

            {/* Factory Income */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-md bg-orange-900/20 flex items-center justify-center">
                  <Factory className="w-4 h-4 text-orange-400" />
                </div>
                <div>
                  <p className="text-xs text-orange-300">Factories</p>
                  <p className="text-[10px] text-gray-500">{factories.length} active • ${factoryRate}/cycle each</p>
                </div>
              </div>
              <span className="text-sm font-mono text-orange-400">${formatNumber(factoryIncome)}</span>
            </div>

            {/* Power Income */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-md bg-yellow-900/20 flex items-center justify-center">
                  <Zap className="w-4 h-4 text-yellow-400" />
                </div>
                <div>
                  <p className="text-xs text-yellow-300">Power Plants</p>
                  <p className="text-[10px] text-gray-500">{powerPlants.length} active • ${powerRate}/cycle each</p>
                </div>
              </div>
              <span className="text-sm font-mono text-yellow-400">${formatNumber(powerIncome)}</span>
            </div>

            {/* Separator */}
            <div className="border-t border-cyan-900/20 pt-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">Raw Income / Cycle</span>
                <span className="text-sm font-mono text-cyan-300">${formatNumber(totalRawIncome)}</span>
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-xs text-gray-400">Speed Multiplier</span>
                <span className="text-xs font-mono text-cyan-400">×{effectiveSpeed.toFixed(1)}</span>
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-xs text-gray-400">Avg Efficiency</span>
                <span className={`text-xs font-mono ${avgEfficiency >= 0.8 ? 'text-green-400' : avgEfficiency >= 0.5 ? 'text-yellow-400' : 'text-red-400'}`}>
                  {(avgEfficiency * 100).toFixed(1)}%
                </span>
              </div>
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-cyan-900/15">
                <span className="text-xs font-bold text-green-400">Est. Next Payout</span>
                <span className="text-base font-mono font-bold text-green-400">${formatNumber(estimatedPayout)}</span>
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-[10px] text-gray-500">Est. Income / Min</span>
                <span className="text-xs font-mono text-gray-400">${formatNumber(incomePerMinute)}/min</span>
              </div>
            </div>

            {/* Efficiency bar */}
            <div className="mt-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-gray-500">Efficiency Modifier</span>
                <span className="text-[10px] text-gray-400">{(avgEfficiency * 100).toFixed(0)}%</span>
              </div>
              <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    avgEfficiency >= 0.8 ? 'bg-green-500' : avgEfficiency >= 0.5 ? 'bg-yellow-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${avgEfficiency * 100}%` }}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Payout Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="bg-card border-cyan-900/30">
          <CardContent className="p-3 text-center">
            <p className="text-[10px] text-gray-500 uppercase">Total Payouts</p>
            <p className="text-lg font-bold text-cyan-400 font-mono">{payoutConfig.totalPayoutsReceived}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-cyan-900/30">
          <CardContent className="p-3 text-center">
            <p className="text-[10px] text-gray-500 uppercase">Active Buildings</p>
            <p className="text-lg font-bold text-cyan-400 font-mono">{activeBuildings.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-cyan-900/30">
          <CardContent className="p-3 text-center">
            <p className="text-[10px] text-gray-500 uppercase">Income/Min</p>
            <p className="text-lg font-bold text-green-400 font-mono">${formatNumber(incomePerMinute)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Payout History */}
      <Card className="bg-card border-cyan-900/30">
        <CardHeader className="pb-2 pt-4 px-4">
          <button
            className="w-full flex items-center justify-between"
            onClick={() => setHistoryExpanded(!historyExpanded)}
            aria-expanded={historyExpanded}
          >
            <CardTitle className="text-xs text-cyan-400 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" /> Payout History
            </CardTitle>
            {historyExpanded ? (
              <ChevronUp className="w-3.5 h-3.5 text-gray-500" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
            )}
          </button>
        </CardHeader>
        {(historyExpanded || payoutHistory.length === 0) && (
          <div className="overflow-hidden">
          <CardContent className="px-4 pb-4">
            {payoutHistory.length === 0 ? (
              <p className="text-xs text-gray-600 text-center py-3">No payouts yet. Build buildings to start earning!</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto game-scrollbar">
                {[...payoutHistory].reverse().map((record, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between py-1.5 px-2 rounded-md bg-gray-900/30 border border-gray-800/30"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-gray-600">Tick {record.tick}</span>
                      <Badge variant="outline" className="text-[9px] border-gray-700 text-gray-400 h-4 px-1">
                        {record.buildingCount} buildings
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-gray-500">{(record.efficiency * 100).toFixed(0)}% eff</span>
                      <span className="text-xs font-mono text-green-400">+${formatNumber(record.amount)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
          </div>
        )}
      </Card>

      {/* Income Tips */}
      <Card className="bg-card border-cyan-900/30">
        <CardHeader className="pb-2 pt-4 px-4">
          <button
            className="w-full flex items-center justify-between"
            onClick={() => setTipsExpanded(!tipsExpanded)}
            aria-expanded={tipsExpanded}
          >
            <CardTitle className="text-xs text-cyan-400 flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5" /> Income Tips
            </CardTitle>
            {tipsExpanded ? (
              <ChevronUp className="w-3.5 h-3.5 text-gray-500" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
            )}
          </button>
        </CardHeader>
        {tipsExpanded && (
          <div className="overflow-hidden">
          <CardContent className="px-4 pb-4">
            <div className="space-y-2">
              {tips.map((tip, idx) => (
                <div key={idx} className="text-xs text-gray-400 py-1 px-2 rounded bg-gray-900/20 border border-gray-800/20">
                  {tip}
                </div>
              ))}
            </div>
          </CardContent>
          </div>
        )}
      </Card>

      {/* How Payouts Work */}
      <Card className="bg-card border-cyan-900/30">
        <CardContent className="p-4">
          <p className="text-[10px] text-gray-600 leading-relaxed">
            <GameIcon icon="gi:light-bulb" size={14} className="inline" /> <span className="text-gray-500">How Payouts Work:</span> Every {payoutConfig.basePayoutInterval} ticks, 
            your factory generates a payout based on active buildings. Extractors earn ${extractorRate}/cycle, 
            Factories earn ${factoryRate}/cycle, and Power Plants earn ${powerRate}/cycle per building (scaled by level and efficiency). 
            The total is modified by game speed, average building efficiency, prestige bonuses, and active events.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default PayoutPanel;
