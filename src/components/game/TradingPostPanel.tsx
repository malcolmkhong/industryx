'use client';

import { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore, formatNumber } from '@/lib/game/store';
import { ResourceType } from '@/lib/game/types';
import { INITIAL_MARKET, RESOURCE_META } from '@/lib/game/configCache';
import { GameIcon } from '@/components/game/shared/GameIcon';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ArrowRightLeft, AlertTriangle, History, Zap, Info,
} from 'lucide-react';

// ─── Constants ────────────────────────────────────────────────────────────────
const COMMISSION_RATE = 0.15; // 15% commission

// Tradable resources (raw + some tier 1 for meaningful exchanges)
const TRADABLE_RESOURCES: ResourceType[] = [
  'iron', 'copper', 'coal', 'oil', 'sand', 'lithium', 'water',
  'clay', 'limestone', 'gravel', 'bauxite', 'wolframite', 'rareEarth',
  'silver', 'gold',
  'ironPlate', 'copperWire', 'plastic', 'glass', 'carbon',
  'bricks', 'concrete', 'fertilizer', 'steel', 'fossilFuel',
];

// Quick trade presets
interface QuickTradePreset {
  give: ResourceType;
  giveAmount: number;
  receive: ResourceType;
  label: string;
}

const QUICK_TRADE_PRESETS: QuickTradePreset[] = [
  { give: 'iron', giveAmount: 100, receive: 'copper', label: 'Iron → Copper' },
  { give: 'coal', giveAmount: 50, receive: 'oil', label: 'Coal → Oil' },
  { give: 'sand', giveAmount: 100, receive: 'iron', label: 'Sand → Iron' },
  { give: 'copper', giveAmount: 50, receive: 'iron', label: 'Copper → Iron' },
  { give: 'iron', giveAmount: 50, receive: 'coal', label: 'Iron → Coal' },
  { give: 'oil', giveAmount: 20, receive: 'lithium', label: 'Oil → Lithium' },
];

// Trade history entry (local component state)
interface TradeHistoryEntry {
  id: string;
  giveResource: ResourceType;
  giveAmount: number;
  receiveResource: ResourceType;
  receiveAmount: number;
  tick: number;
}

// ─── Helper: get base price for a resource ────────────────────────────────────
function getBasePrice(resource: ResourceType): number {
  const marketEntry = INITIAL_MARKET.find(m => m.resource === resource);
  return marketEntry?.basePrice ?? 1;
}

// ─── Helper: calculate receive amount ─────────────────────────────────────────
function calculateReceiveAmount(
  giveResource: ResourceType,
  giveAmount: number,
  receiveResource: ResourceType
): number {
  const givePrice = getBasePrice(giveResource);
  const receivePrice = getBasePrice(receiveResource);
  if (receivePrice === 0) return 0;
  return (giveAmount * givePrice * (1 - COMMISSION_RATE)) / receivePrice;
}

// ─── Helper: format exchange rate ─────────────────────────────────────────────
function formatExchangeRate(giveResource: ResourceType, receiveResource: ResourceType): string {
  const givePrice = getBasePrice(giveResource);
  const receivePrice = getBasePrice(receiveResource);
  if (receivePrice === 0 || givePrice === 0) return 'N/A';
  const rate = (givePrice * (1 - COMMISSION_RATE)) / receivePrice;
  if (rate >= 1) return rate.toFixed(2);
  return rate.toFixed(3);
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function TradingPostPanel() {
  // State for the exchange interface
  const [giveResource, setGiveResource] = useState<ResourceType>('iron');
  const [receiveResource, setReceiveResource] = useState<ResourceType>('copper');
  const [giveAmount, setGiveAmount] = useState<number>(100);
  const [tradeHistory, setTradeHistory] = useState<TradeHistoryEntry[]>([]);
  const [lastTradeTick, setLastTradeTick] = useState<number>(0);

  // Game store selectors
  const resources = useGameStore(s => s.resources);
  const resourceCapacity = useGameStore(s => s.resourceCapacity);
  const gameTick = useGameStore(s => s.gameTick);

  // ─── Computed values ────────────────────────────────────────────────────────
  const receiveAmount = useMemo(
    () => calculateReceiveAmount(giveResource, giveAmount, receiveResource),
    [giveResource, giveAmount, receiveResource]
  );

  const giveResourceCurrent = resources[giveResource] ?? 0;
  const receiveResourceCurrent = resources[receiveResource] ?? 0;
  const receiveCapacity = resourceCapacity[receiveResource] ?? Infinity;

  const canTrade = useMemo(() => {
    if (giveAmount <= 0) return false;
    if (giveResourceCurrent < giveAmount) return false;
    if (giveResource === receiveResource) return false;
    if (receiveAmount <= 0) return false;
    if (receiveResourceCurrent + receiveAmount > receiveCapacity) return false;
    return true;
  }, [giveAmount, giveResourceCurrent, giveResource, receiveResource, receiveAmount, receiveResourceCurrent, receiveCapacity]);

  // ─── Storage suggestions ────────────────────────────────────────────────────
  const suggestions = useMemo(() => {
    const result: { resource: ResourceType; percent: number; suggestTradeFor: ResourceType }[] = [];
    for (const res of TRADABLE_RESOURCES) {
      const current = resources[res] ?? 0;
      const capacity = resourceCapacity[res] ?? Infinity;
      if (capacity === Infinity || capacity === 0) continue;
      const percent = current / capacity;
      if (percent > 0.8) {
        // Suggest trading for a resource that's less full
        let bestTarget: ResourceType | null = null;
        let lowestPercent = 1;
        for (const candidate of TRADABLE_RESOURCES) {
          if (candidate === res) continue;
          const cCurrent = resources[candidate] ?? 0;
          const cCapacity = resourceCapacity[candidate] ?? Infinity;
          if (cCapacity === Infinity || cCapacity === 0) continue;
          const cPercent = cCurrent / cCapacity;
          if (cPercent < lowestPercent && cPercent < 0.5) {
            lowestPercent = cPercent;
            bestTarget = candidate;
          }
        }
        if (bestTarget) {
          result.push({ resource: res, percent, suggestTradeFor: bestTarget });
        }
      }
    }
    return result.slice(0, 3); // Show max 3 suggestions
  }, [resources, resourceCapacity]);

  // ─── Execute trade ──────────────────────────────────────────────────────────
  const executeTrade = useCallback((gRes: ResourceType, gAmt: number, rRes: ResourceType) => {
    const rAmt = calculateReceiveAmount(gRes, gAmt, rRes);
    if (rAmt <= 0) return;

    const state = useGameStore.getState();
    const newResources = { ...state.resources };

    if ((newResources[gRes] ?? 0) < gAmt) return;

    newResources[gRes] -= gAmt;
    newResources[rRes] = Math.min(
      (newResources[rRes] ?? 0) + rAmt,
      state.resourceCapacity[rRes] ?? Infinity
    );

    useGameStore.setState({ resources: newResources });
    state.addNotification('success', `Traded ${formatNumber(gAmt)} ${RESOURCE_META[gRes]?.name ?? gRes} for ${rAmt.toFixed(1)} ${RESOURCE_META[rRes]?.name ?? rRes}`);

    // Add to history
    const entry: TradeHistoryEntry = {
      id: Math.random().toString(36).substring(2, 9),
      giveResource: gRes,
      giveAmount: gAmt,
      receiveResource: rRes,
      receiveAmount: rAmt,
      tick: state.gameTick,
    };
    setTradeHistory(prev => [entry, ...prev].slice(0, 5));
    setLastTradeTick(state.gameTick);
  }, []);

  const handleExecuteTrade = useCallback(() => {
    if (!canTrade) return;
    executeTrade(giveResource, giveAmount, receiveResource);
  }, [canTrade, giveResource, giveAmount, receiveResource, executeTrade]);

  const handleQuickTrade = useCallback((preset: QuickTradePreset) => {
    const state = useGameStore.getState();
    if ((state.resources[preset.give] ?? 0) < preset.giveAmount) {
      state.addNotification('warning', `Not enough ${RESOURCE_META[preset.give]?.name ?? preset.give} for this trade`);
      return;
    }
    executeTrade(preset.give, preset.giveAmount, preset.receive);
  }, [executeTrade]);

  // Quick trade: calculate receive amounts
  const quickTradeAmounts = useMemo(() => {
    return QUICK_TRADE_PRESETS.map(p => ({
      ...p,
      receiveAmount: calculateReceiveAmount(p.give, p.giveAmount, p.receive),
    }));
  }, []);

  // ─── Set amount to max available ────────────────────────────────────────────
  const setMaxGive = useCallback(() => {
    setGiveAmount(Math.floor(giveResourceCurrent));
  }, [giveResourceCurrent]);

  // ─── Swap give/receive ─────────────────────────────────────────────────────
  const swapResources = useCallback(() => {
    setGiveResource(receiveResource);
    setReceiveResource(giveResource);
    setGiveAmount(Math.min(giveAmount, Math.floor(resources[receiveResource] ?? 0)));
  }, [giveResource, receiveResource, giveAmount, resources]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <ArrowRightLeft className="w-5 h-5 text-violet-400" />
          <h2 className="text-xl font-bold text-cyan-400 neon-glow-cyan">Trading Post</h2>
          <Badge variant="outline" className="text-[10px] border-violet-500/30 text-violet-400 bg-violet-900/20">
            15% commission
          </Badge>
        </div>
        <div className="text-xs text-gray-500">
          Exchange resources directly — faster than selling &amp; buying
        </div>
      </div>

      {/* ─── Resource Exchange Interface ──────────────────────────────────── */}
      <div className="bg-card border border-cyan-900/20 rounded-xl p-4 sm:p-6">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-4 items-start">
          {/* GIVE side */}
          <div className="space-y-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Give</div>
            <Select
              value={giveResource}
              onValueChange={(val) => {
                setGiveResource(val as ResourceType);
                if (val === receiveResource) {
                  setReceiveResource(giveResource);
                }
              }}
            >
              <SelectTrigger className="w-full bg-[#0a0e17] border-cyan-900/30 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#0d1220] border-cyan-900/30 max-h-60">
                {TRADABLE_RESOURCES.map(res => (
                  <SelectItem key={res} value={res} className="text-sm">
                    <span className="flex items-center gap-2">
                      <GameIcon icon={RESOURCE_META[res]?.icon} size={14} className="inline-flex" />
                      <span>{RESOURCE_META[res]?.name ?? res}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-[10px] text-gray-500">Amount</label>
                <button
                  className="text-[10px] text-violet-400 hover:text-violet-300 transition-colors"
                  onClick={setMaxGive}
                >
                  Max: {formatNumber(giveResourceCurrent)}
                </button>
              </div>
              <input
                type="number"
                min={0}
                max={Math.floor(giveResourceCurrent)}
                value={giveAmount}
                onChange={(e) => setGiveAmount(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-full bg-[#0a0e17] border border-cyan-900/30 rounded-md px-3 py-2 text-sm font-mono text-cyan-400 focus:border-violet-500/50 focus:outline-none focus:ring-1 focus:ring-violet-500/30 transition-colors"
              />
            </div>

            {/* Available indicator */}
            <div className="flex items-center gap-1.5 text-[10px]">
              <GameIcon icon={RESOURCE_META[giveResource]?.icon} size={12} className="inline-flex" />
              <span className="text-gray-500">Available:</span>
              <span className={`font-mono ${giveResourceCurrent >= giveAmount ? 'text-green-400' : 'text-red-400'}`}>
                {formatNumber(giveResourceCurrent)}
              </span>
            </div>
          </div>

          {/* Swap button */}
          <div className="flex items-center justify-center sm:pt-6">
            <motion.button
              whileHover={{ rotate: 180, scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              transition={{ duration: 0.3 }}
              onClick={swapResources}
              className="w-10 h-10 rounded-full border border-violet-500/30 bg-violet-900/20 flex items-center justify-center text-violet-400 hover:bg-violet-900/40 hover:border-violet-500/50 transition-colors"
              aria-label="Swap give and receive resources"
            >
              <ArrowRightLeft className="w-4 h-4" />
            </motion.button>
          </div>

          {/* RECEIVE side */}
          <div className="space-y-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Receive</div>
            <Select
              value={receiveResource}
              onValueChange={(val) => {
                setReceiveResource(val as ResourceType);
                if (val === giveResource) {
                  setGiveResource(receiveResource);
                }
              }}
            >
              <SelectTrigger className="w-full bg-[#0a0e17] border-cyan-900/30 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#0d1220] border-cyan-900/30 max-h-60">
                {TRADABLE_RESOURCES.map(res => (
                  <SelectItem key={res} value={res} className="text-sm">
                    <span className="flex items-center gap-2">
                      <GameIcon icon={RESOURCE_META[res]?.icon} size={14} className="inline-flex" />
                      <span>{RESOURCE_META[res]?.name ?? res}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="space-y-1">
              <div className="text-[10px] text-gray-500">You will receive</div>
              <div className="bg-[#0a0e17] border border-cyan-900/30 rounded-md px-3 py-2 text-sm font-mono text-violet-400">
                {giveResource !== receiveResource
                  ? receiveAmount > 0 ? receiveAmount.toFixed(2) : '0'
                  : '—'}
              </div>
            </div>

            {/* Capacity indicator */}
            <div className="flex items-center gap-1.5 text-[10px]">
              <GameIcon icon={RESOURCE_META[receiveResource]?.icon} size={12} className="inline-flex" />
              <span className="text-gray-500">Storage:</span>
              <span className={`font-mono ${
                receiveCapacity !== Infinity && (receiveResourceCurrent + receiveAmount > receiveCapacity)
                  ? 'text-red-400'
                  : 'text-gray-400'
              }`}>
                {formatNumber(receiveResourceCurrent)} / {receiveCapacity === Infinity ? '∞' : formatNumber(receiveCapacity)}
              </span>
              {receiveCapacity !== Infinity && (
                <div className="w-12 h-1 bg-gray-800 rounded-full overflow-hidden ml-1">
                  <div
                    className={`h-full rounded-full transition-all ${
                      receiveResourceCurrent / receiveCapacity > 0.8
                        ? 'bg-red-400'
                        : receiveResourceCurrent / receiveCapacity > 0.5
                          ? 'bg-yellow-400'
                          : 'bg-green-400'
                    }`}
                    style={{ width: `${Math.min(100, (receiveResourceCurrent / receiveCapacity) * 100)}%` }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Rate info + Execute button */}
        <div className="mt-4 pt-4 border-t border-cyan-900/20 space-y-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-gray-500">
            <span>
              Rate: <span className="text-cyan-400 font-mono">
                1 {RESOURCE_META[giveResource]?.name ?? giveResource} = {formatExchangeRate(giveResource, receiveResource)} {RESOURCE_META[receiveResource]?.name ?? receiveResource}
              </span>
            </span>
            <span>
              Commission: <span className="text-violet-400">{(COMMISSION_RATE * 100).toFixed(0)}%</span>
            </span>
            <span className="flex items-center gap-1">
              <Info className="w-3 h-3" />
              Less efficient than Market, but instant
            </span>
          </div>

          {/* Insufficient resources warning */}
          {giveResourceCurrent < giveAmount && giveAmount > 0 && (
            <div className="flex items-center gap-2 text-[10px] text-red-400 bg-red-900/10 border border-red-500/20 rounded-lg px-3 py-2">
              <AlertTriangle className="w-3 h-3 flex-shrink-0" />
              Not enough {RESOURCE_META[giveResource]?.name ?? giveResource}. You have {formatNumber(giveResourceCurrent)} but need {formatNumber(giveAmount)}.
            </div>
          )}

          {/* Capacity overflow warning */}
          {receiveCapacity !== Infinity && (receiveResourceCurrent + receiveAmount > receiveCapacity) && receiveAmount > 0 && (
            <div className="flex items-center gap-2 text-[10px] text-yellow-400 bg-yellow-900/10 border border-yellow-500/20 rounded-lg px-3 py-2">
              <AlertTriangle className="w-3 h-3 flex-shrink-0" />
              {RESOURCE_META[receiveResource]?.name ?? receiveResource} storage would overflow. Receive amount will be capped.
            </div>
          )}

          <Button
            onClick={handleExecuteTrade}
            disabled={!canTrade}
            className="w-full sm:w-auto bg-violet-600 hover:bg-violet-500 text-white border-0 disabled:opacity-40"
            size="sm"
          >
            <Zap className="w-3.5 h-3.5 mr-1.5" />
            Execute Trade
          </Button>
        </div>
      </div>

      {/* ─── Quick Trade Presets ─────────────────────────────────────────── */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5 text-violet-400" />
          Quick Trades
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {quickTradeAmounts.map((preset, idx) => {
            const hasEnough = (resources[preset.give] ?? 0) >= preset.giveAmount;
            return (
              <motion.button
                key={idx}
                whileHover={{ scale: hasEnough ? 1.03 : 1 }}
                whileTap={{ scale: hasEnough ? 0.97 : 1 }}
                onClick={() => handleQuickTrade(preset)}
                disabled={!hasEnough}
                className={`bg-card border rounded-lg p-3 text-center transition-colors ${
                  hasEnough
                    ? 'border-violet-500/20 hover:border-violet-500/40 hover:bg-violet-900/10 cursor-pointer'
                    : 'border-cyan-900/10 opacity-40 cursor-not-allowed'
                }`}
              >
                <div className="flex items-center justify-center gap-1 text-xs">
                  <GameIcon icon={RESOURCE_META[preset.give]?.icon} size={14} className="inline-flex" />
                  <span className="font-mono text-cyan-400">{preset.giveAmount}</span>
                </div>
                <ArrowRightLeft className="w-3 h-3 text-violet-400 mx-auto my-1" />
                <div className="flex items-center justify-center gap-1 text-xs">
                  <GameIcon icon={RESOURCE_META[preset.receive]?.icon} size={14} className="inline-flex" />
                  <span className="font-mono text-violet-400">{preset.receiveAmount.toFixed(1)}</span>
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* ─── Storage Suggestions ──────────────────────────────────────────── */}
      <AnimatePresence>
        {suggestions.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            className="space-y-2"
          >
            <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-yellow-400" />
              Storage Suggestions
            </h3>
            <div className="space-y-1.5">
              {suggestions.map((s, idx) => (
                <motion.div
                  key={s.resource}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  className="flex items-center gap-3 bg-yellow-900/10 border border-yellow-500/20 rounded-lg px-3 py-2"
                >
                  <AlertTriangle className="w-3 h-3 text-yellow-400 flex-shrink-0" />
                  <div className="flex-1 text-xs">
                    <span className="text-yellow-300">
                      {RESOURCE_META[s.resource]?.name ?? s.resource}
                    </span>
                    <span className="text-gray-400"> storage is </span>
                    <span className="text-yellow-400 font-mono">{(s.percent * 100).toFixed(0)}%</span>
                    <span className="text-gray-400"> full — consider trading for </span>
                    <span className="text-violet-300">
                      {RESOURCE_META[s.suggestTradeFor]?.name ?? s.suggestTradeFor}
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-[10px] px-2 border-violet-500/30 text-violet-400 hover:bg-violet-900/20 flex-shrink-0"
                    onClick={() => {
                      setGiveResource(s.resource);
                      setReceiveResource(s.suggestTradeFor);
                      setGiveAmount(Math.floor(resources[s.resource] * 0.2));
                    }}
                  >
                    Set Trade
                  </Button>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Recent Trades ────────────────────────────────────────────────── */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-1.5">
          <History className="w-3.5 h-3.5 text-gray-400" />
          Recent Trades
          {tradeHistory.length > 0 && (
            <Badge variant="outline" className="text-[10px] border-cyan-500/30 text-cyan-400 bg-cyan-900/20 ml-1">
              {tradeHistory.length}
            </Badge>
          )}
        </h3>
        {tradeHistory.length === 0 ? (
          <div className="bg-card border border-cyan-900/20 rounded-lg p-4 text-center text-gray-500 text-xs">
            No trades yet. Exchange resources to get started!
          </div>
        ) : (
          <div className="space-y-1 max-h-48 overflow-y-auto game-scrollbar">
            {tradeHistory.map((entry) => {
              const ticksAgo = gameTick - entry.tick;
              return (
                <motion.div
                  key={entry.id}
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-card border border-cyan-900/20 rounded-lg px-3 py-2 flex items-center gap-2 text-xs"
                >
                  <GameIcon icon={RESOURCE_META[entry.giveResource]?.icon} size={12} className="inline-flex text-gray-400" />
                  <span className="font-mono text-cyan-400">{formatNumber(entry.giveAmount)}</span>
                  <span className="text-gray-500">{RESOURCE_META[entry.giveResource]?.name ?? entry.giveResource}</span>
                  <ArrowRightLeft className="w-3 h-3 text-violet-400" />
                  <GameIcon icon={RESOURCE_META[entry.receiveResource]?.icon} size={12} className="inline-flex text-gray-400" />
                  <span className="font-mono text-violet-400">{entry.receiveAmount.toFixed(1)}</span>
                  <span className="text-gray-500">{RESOURCE_META[entry.receiveResource]?.name ?? entry.receiveResource}</span>
                  <span className="ml-auto text-[10px] text-gray-600 flex-shrink-0">
                    {ticksAgo === 0 ? 'just now' : `${ticksAgo} ticks ago`}
                  </span>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── Info Card ────────────────────────────────────────────────────── */}
      <div className="bg-card border border-cyan-900/20 rounded-xl p-4">
        <div className="flex items-start gap-2">
          <Info className="w-4 h-4 text-gray-500 mt-0.5 flex-shrink-0" />
          <div className="text-[10px] text-gray-500 space-y-1">
            <p>
              <span className="text-gray-400 font-semibold">How it works:</span> The Trading Post lets you exchange resources directly without using money.
              Exchange rates are based on base market values with a {(COMMISSION_RATE * 100).toFixed(0)}% commission.
            </p>
            <p>
              <span className="text-gray-400 font-semibold">Tip:</span> Selling resources on the Market and buying others is more efficient,
              but the Trading Post is instant and convenient when you need a quick conversion.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default TradingPostPanel;
