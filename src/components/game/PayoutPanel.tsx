'use client';

import { useGameStore, formatNumber } from '@/lib/game/store';
import { BUILDING_DEFS } from '@/lib/game/data';
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
import { useState } from 'react';

export function PayoutPanel() {
  const store = useGameStore();
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [tipsExpanded, setTipsExpanded] = useState(true);

  const activeBuildings = store.buildings.filter(b => b.active);
  const extractors = activeBuildings.filter(b => BUILDING_DEFS[b.type]?.category === 'extractor');
  const factories = activeBuildings.filter(b => BUILDING_DEFS[b.type]?.category === 'factory');
  const powerPlants = activeBuildings.filter(b => BUILDING_DEFS[b.type]?.category === 'power');

  const extractorRate = 2;
  const factoryRate = 5;
  const powerRate = 1;

  // Calculate income breakdown
  const extractorIncome = extractors.reduce((sum, b) => sum + extractorRate * b.level * b.efficiency, 0);
  const factoryIncome = factories.reduce((sum, b) => sum + factoryRate * b.level * b.efficiency, 0);
  const powerIncome = powerPlants.reduce((sum, b) => sum + powerRate * b.level * b.efficiency, 0);

  const totalRawIncome = extractorIncome + factoryIncome + powerIncome;

  const avgEfficiency = activeBuildings.length > 0
    ? activeBuildings.reduce((sum, b) => sum + b.efficiency, 0) / activeBuildings.length
    : 0;

  // Estimated next payout (without event/weather modifiers, just base calc)
  const estimatedPayout = Math.floor(
    totalRawIncome * store.gameSpeed * avgEfficiency
  );

  // Payout timer
  const ticksSinceLastPayout = store.gameTick - store.payoutConfig.lastPayoutTick;
  const ticksUntilPayout = Math.max(0, store.payoutConfig.basePayoutInterval - ticksSinceLastPayout);
  const payoutProgress = Math.min(100, (ticksSinceLastPayout / store.payoutConfig.basePayoutInterval) * 100);
  const secondsUntilPayout = Math.floor(ticksUntilPayout / store.gameSpeed);

  // Income per minute estimate
  const payoutsPerMinute = 60 / store.payoutConfig.basePayoutInterval * store.gameSpeed;
  const incomePerMinute = estimatedPayout * payoutsPerMinute;

  // Tips
  const tips = (() => {
    const result: string[] = [];
    if (store.buildings.length === 0) {
      result.push('🏗️ Build your first building to start receiving payouts!');
    } else {
      if (factories.length === 0) result.push('🏭 Build factories to increase your payout — they earn $5/tick per building!');
      if (extractors.length === 0) result.push('⛏️ Build extractors to earn $2/tick per building from raw material production!');
      if (avgEfficiency < 0.8) result.push('⚡ Improve power efficiency to boost payouts — build more power plants!');
      if (store.payoutConfig.autoCollect) result.push('🔄 Auto-collect is ON — payouts go directly to your balance.');
      else result.push('👆 Click "Collect" to claim your pending payout, or enable auto-collect.');
      if (factories.length > extractors.length * 2) result.push('⚖️ Consider building more extractors to supply your factories.');
      if (store.gameSpeed === 1) result.push('⏩ Increase game speed to receive payouts more frequently!');
      if (estimatedPayout < 10) result.push('📈 Build more buildings or upgrade existing ones to increase payout amounts.');
    }
    return result;
  })();

  return (
    <div className="space-y-4">
      {/* Money Balance Header */}
      <Card className="bg-[#111827] border-cyan-900/30 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-green-900/10 via-transparent to-emerald-900/10 pointer-events-none" />
        <CardContent className="p-4 relative">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider">Current Balance</p>
              <p className="text-3xl font-bold text-green-400 font-mono mt-1">
                ${formatNumber(store.money)}
              </p>
              <p className="text-[10px] text-gray-600 mt-1">
                Total earned: ${formatNumber(store.totalMoneyEarned)}
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
        <Card className="bg-[#111827] border-cyan-900/30">
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
                <span>Every {store.payoutConfig.basePayoutInterval} ticks</span>
                <span>{Math.round(payoutProgress)}%</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Pending Payout Card */}
        <Card className="bg-[#111827] border-cyan-900/30">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-xs text-green-400 flex items-center gap-1.5">
              <Coins className="w-3.5 h-3.5" /> Pending Payout
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold text-green-300 font-mono">
                  ${formatNumber(store.pendingPayout)}
                </span>
                {!store.payoutConfig.autoCollect && store.pendingPayout > 0 && (
                  <Button
                    size="sm"
                    className="bg-green-600 hover:bg-green-500 text-white text-xs h-8 animate-pulse"
                    onClick={store.collectPayout}
                  >
                    💰 Collect
                  </Button>
                )}
                {store.payoutConfig.autoCollect && (
                  <Badge variant="outline" className="text-[10px] border-green-500/40 text-green-400 bg-green-900/20">
                    AUTO
                  </Badge>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Auto-collect</span>
                <Switch
                  checked={store.payoutConfig.autoCollect}
                  onCheckedChange={store.toggleAutoCollect}
                  className="data-[state=checked]:bg-green-600"
                />
              </div>
              <p className="text-[10px] text-gray-600">
                {store.payoutConfig.autoCollect
                  ? 'Payouts are automatically added to your balance'
                  : 'Payouts accumulate until you manually collect them'}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Income Breakdown */}
      <Card className="bg-[#111827] border-cyan-900/30">
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
                  <p className="text-[10px] text-gray-500">{extractors.length} active • ${extractorRate}/tick each</p>
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
                  <p className="text-[10px] text-gray-500">{factories.length} active • ${factoryRate}/tick each</p>
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
                  <p className="text-[10px] text-gray-500">{powerPlants.length} active • ${powerRate}/tick each</p>
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
                <span className="text-xs font-mono text-cyan-400">×{store.gameSpeed}</span>
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
        <Card className="bg-[#111827] border-cyan-900/30">
          <CardContent className="p-3 text-center">
            <p className="text-[10px] text-gray-500 uppercase">Total Payouts</p>
            <p className="text-lg font-bold text-cyan-400 font-mono">{store.payoutConfig.totalPayoutsReceived}</p>
          </CardContent>
        </Card>
        <Card className="bg-[#111827] border-cyan-900/30">
          <CardContent className="p-3 text-center">
            <p className="text-[10px] text-gray-500 uppercase">Active Buildings</p>
            <p className="text-lg font-bold text-cyan-400 font-mono">{activeBuildings.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-[#111827] border-cyan-900/30">
          <CardContent className="p-3 text-center">
            <p className="text-[10px] text-gray-500 uppercase">Income/Min</p>
            <p className="text-lg font-bold text-green-400 font-mono">${formatNumber(incomePerMinute)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Payout History */}
      <Card className="bg-[#111827] border-cyan-900/30">
        <CardHeader className="pb-2 pt-4 px-4">
          <button
            className="w-full flex items-center justify-between"
            onClick={() => setHistoryExpanded(!historyExpanded)}
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
        {(historyExpanded || store.payoutHistory.length === 0) && (
          <CardContent className="px-4 pb-4">
            {store.payoutHistory.length === 0 ? (
              <p className="text-xs text-gray-600 text-center py-3">No payouts yet. Build buildings to start earning!</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto game-scrollbar">
                {[...store.payoutHistory].reverse().map((record, idx) => (
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
        )}
      </Card>

      {/* Income Tips */}
      <Card className="bg-[#111827] border-cyan-900/30">
        <CardHeader className="pb-2 pt-4 px-4">
          <button
            className="w-full flex items-center justify-between"
            onClick={() => setTipsExpanded(!tipsExpanded)}
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
          <CardContent className="px-4 pb-4">
            <div className="space-y-2">
              {tips.map((tip, idx) => (
                <div key={idx} className="text-xs text-gray-400 py-1 px-2 rounded bg-gray-900/20 border border-gray-800/20">
                  {tip}
                </div>
              ))}
            </div>
          </CardContent>
        )}
      </Card>

      {/* How Payouts Work */}
      <Card className="bg-[#111827] border-cyan-900/30">
        <CardContent className="p-4">
          <p className="text-[10px] text-gray-600 leading-relaxed">
            💡 <span className="text-gray-500">How Payouts Work:</span> Every {store.payoutConfig.basePayoutInterval} ticks, 
            your factory generates a payout based on active buildings. Extractors earn ${extractorRate}/tick, 
            Factories earn ${factoryRate}/tick, and Power Plants earn ${powerRate}/tick per building (scaled by level and efficiency). 
            The total is modified by game speed, average building efficiency, prestige bonuses, and active events.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default PayoutPanel;
