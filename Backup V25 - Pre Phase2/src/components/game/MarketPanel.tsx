'use client';

import { useState, useMemo, useCallback } from 'react';
import { LoadingSpinner } from '@/components/game/shared/LoadingSpinner';
import { useGameStore, formatNumber } from '@/lib/game/store';
import { RESOURCE_META } from '@/lib/game/data';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  TrendingUp, TrendingDown, Minus, ShoppingCart, DollarSign,
  ArrowUpRight, ArrowDownRight, BarChart3, Wallet, Activity,
  Zap, Flame, Package
} from 'lucide-react';
import { ResourceType } from '@/lib/game/types';
import { GameItemTooltip } from '@/components/game/GameItemTooltip';
import { PanelStatCard } from '@/components/game/shared/PanelStatCard';
import { GameIcon } from '@/components/game/shared/GameIcon';

// --- Bezier Sparkline Component ---
function BezierSparkline({
  data,
  width = 120,
  height = 32,
  color,
  showGradient = false,
  id,
}: {
  data: number[];
  width?: number;
  height?: number;
  color: string;
  showGradient?: boolean;
  id: string;
}) {
  if (data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const padding = 2;
  const chartW = width - padding * 2;
  const chartH = height - padding * 2;

  const points = data.map((v, i) => ({
    x: padding + (i / (data.length - 1)) * chartW,
    y: padding + chartH - ((v - min) / range) * chartH,
  }));

  // Build smooth bezier path
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const cpx = (prev.x + curr.x) / 2;
    path += ` C ${cpx} ${prev.y}, ${cpx} ${curr.y}, ${curr.x} ${curr.y}`;
  }

  // Fill area path
  const fillPath = `${path} L ${points[points.length - 1].x} ${height} L ${points[0].x} ${height} Z`;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="w-full h-full">
      {showGradient && (
        <defs>
          <linearGradient id={`spark-grad-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
      )}
      {showGradient && <path d={fillPath} fill={`url(#spark-grad-${id})`} />}
      <path d={path} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function MarketPanel() {
  const store = useGameStore();
  const [selectedResource, setSelectedResource] = useState<ResourceType | null>(null);
  const [tradeAmount, setTradeAmount] = useState<number>(1);
  const [filter, setFilter] = useState<'all' | 'raw' | 'processed'>('all');
  const [tradeMode, setTradeMode] = useState<'sell' | 'buy'>('sell');

  const filteredMarket = useMemo(() => {
    return store.market.filter(m => {
      if (filter === 'raw') return RESOURCE_META[m.resource].tier === 0;
      if (filter === 'processed') return RESOURCE_META[m.resource].tier > 0;
      return true;
    });
  }, [store.market, filter]);

  const portfolioValue = useMemo(() => {
    return (Object.entries(store.resources) as [ResourceType, number][])
      .reduce((sum, [resource, amount]) => {
        const price = store.market.find(m => m.resource === resource)?.currentPrice ?? 0;
        return sum + price * amount;
      }, 0);
  }, [store.resources, store.market]);

  // Market Summary computations
  const marketSummary = useMemo(() => {
    const prices = store.market.map(m => ({ resource: m.resource, ratio: m.currentPrice / m.basePrice, trend: m.trend }));
    const avgRatio = prices.reduce((sum, p) => sum + p.ratio, 0) / prices.length;
    const sentiment = avgRatio > 1.15 ? 'Bullish' : avgRatio < 0.85 ? 'Bearish' : 'Neutral';
    const sentimentDot = avgRatio > 1.15 ? 'bg-green-500' : avgRatio < 0.85 ? 'bg-red-500' : 'bg-yellow-500';
    const bestSell = prices.reduce((best, p) => p.ratio > best.ratio ? p : best, prices[0]);
    const bestSellMeta = RESOURCE_META[bestSell.resource as ResourceType];
    return { avgRatio, sentiment, sentimentDot, bestSell, bestSellMeta };
  }, [store.market]);

  const selected = selectedResource ? store.market.find(m => m.resource === selectedResource) : null;
  const selectedMeta = selectedResource ? RESOURCE_META[selectedResource] : null;

  const priceChange = useMemo(() => {
    if (!selected || selected.priceHistory.length < 2) return 0;
    const prev = selected.priceHistory[selected.priceHistory.length - 1];
    return prev > 0 ? ((selected.currentPrice - prev) / prev) * 100 : 0;
  }, [selected]);

  const [isSelling, setIsSelling] = useState(false);
  const [isBuying, setIsBuying] = useState(false);

  const handleSell = () => {
    if (!selectedResource) return;
    const amount = Math.min(tradeAmount, store.resources[selectedResource]);
    if (amount > 0) {
      setIsSelling(true);
      store.sellResource(selectedResource, amount);
      setTimeout(() => setIsSelling(false), 300);
    }
  };

  const handleBuy = () => {
    if (!selectedResource) return;
    setIsBuying(true);
    store.buyResource(selectedResource, tradeAmount);
    setTimeout(() => setIsBuying(false), 300);
  };

  const maxSell = selectedResource ? Math.floor(store.resources[selectedResource]) : 0;
  const maxBuy = useMemo(() => {
    if (!selected) return 0;
    const pricePerUnit = selected.currentPrice * 1.1;
    if (pricePerUnit <= 0) return 0;
    const byMoney = Math.floor(store.money / pricePerUnit);
    if (!selectedResource) return byMoney;
    const byCapacity = Math.floor(store.resourceCapacity[selectedResource] - store.resources[selectedResource]);
    return Math.max(0, Math.min(byMoney, byCapacity));
  }, [selected, store.money, store.resourceCapacity, store.resources, selectedResource]);

  const buyCost = selected ? selected.currentPrice * tradeAmount * 1.1 : 0;
  const sellRevenue = selected ? selected.currentPrice * tradeAmount * 0.9 : 0;

  const getSparkColor = useCallback((trend: string) => {
    if (trend === 'up') return '#4ade80';
    if (trend === 'down') return '#f87171';
    return '#67e8f9';
  }, []);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="bg-gradient-to-r from-green-900/10 to-transparent -m-0 p-0 rounded-xl">
          <h2 className="text-xl font-bold text-green-400 tracking-wide neon-glow-green">
            Global Market
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">Buy and sell resources on the open market</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-green-500/50 text-green-400 bg-green-900/20 text-xs">
            <Wallet className="w-3 h-3 mr-1" />
            ${formatNumber(store.money)}
          </Badge>
          <Badge variant="outline" className="border-cyan-500/50 text-cyan-400 bg-cyan-900/20 text-xs">
            <BarChart3 className="w-3 h-3 mr-1" />
            Portfolio: ${formatNumber(portfolioValue)}
          </Badge>
        </div>
      </div>

      {/* Market Summary Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <PanelStatCard
          icon={<BarChart3 className="w-4 h-4" />}
          label="Price Index"
          value={`${(marketSummary.avgRatio * 100).toFixed(0)}%`}
          subtext="Avg vs base"
          color="cyan"
          trend={marketSummary.avgRatio > 1 ? 'up' : marketSummary.avgRatio < 1 ? 'down' : 'neutral'}
        />
        <PanelStatCard
          icon={<TrendingUp className="w-4 h-4" />}
          label="Sentiment"
          value={<><span className={`inline-block w-2.5 h-2.5 rounded-full ${marketSummary.sentimentDot}`} /> {marketSummary.sentiment}</>}
          subtext="Market mood"
          color={marketSummary.sentiment === 'Bullish' ? 'green' : marketSummary.sentiment === 'Bearish' ? 'red' : 'yellow'}
          trend={marketSummary.sentiment === 'Bullish' ? 'up' : marketSummary.sentiment === 'Bearish' ? 'down' : 'neutral'}
        />
        <PanelStatCard
          icon={<DollarSign className="w-4 h-4" />}
          label="Best Sell"
          value={<><GameIcon icon={marketSummary.bestSellMeta?.icon} size={14} className="inline-flex" /> {(marketSummary.bestSell?.ratio * 100).toFixed(0)}%</>}
          subtext={marketSummary.bestSellMeta?.name ?? ''}
          color="green"
          trend="up"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Market Table */}
        <div className="lg:col-span-2 space-y-4">
          {/* Filters */}
          <div className="flex items-center gap-2">
            {(['all', 'raw', 'processed'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                aria-pressed={filter === f}
                className={`px-3 py-1 rounded-lg text-xs ${
                  filter === f
                    ? 'bg-green-900/30 text-green-400 border border-green-500/30'
                    : 'bg-card text-gray-500 border border-gray-800 hover:text-gray-300'
                }`}
              >
                {f === 'all' ? 'All' : f === 'raw' ? 'Raw Materials' : 'Processed'}
              </button>
            ))}
          </div>

          {/* Resource Cards with Sparklines */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[500px] overflow-y-auto game-scrollbar scroll-fade">
            {filteredMarket.length === 0 && (
              <div className="col-span-full flex flex-col items-center justify-center py-8 text-gray-500">
                <Package className="w-8 h-8 mb-2 opacity-50" />
                <p className="text-sm">No resources available. Build extractors to start producing!</p>
              </div>
            )}
            {filteredMarket.map(m => {
              const meta = RESOURCE_META[m.resource];
              const held = store.resources[m.resource];
              const capacity = store.resourceCapacity[m.resource];
              const isSelected = selectedResource === m.resource;
              const isAutoSell = store.autoSellResources.includes(m.resource);
              const priceRatio = m.currentPrice / m.basePrice;
              const sparkColor = getSparkColor(m.trend);
              const fillPct = capacity > 0 ? (held / capacity) * 100 : 0;

              return (
                <GameItemTooltip
                  key={m.resource}
                  name={meta.name}
                  icon={meta.icon}
                  category={meta.tier === 0 ? 'Raw Material' : `Tier ${meta.tier}`}
                  tier={meta.tier}
                  details={[
                    { label: 'Current Price', value: `$${m.currentPrice.toFixed(2)}`, color: m.trend === 'up' ? 'text-green-400' : m.trend === 'down' ? 'text-red-400' : 'text-cyan-400' },
                    { label: 'Base Price', value: `$${m.basePrice.toFixed(2)}` },
                    { label: 'Trend', value: m.trend === 'up' ? '↑ Rising' : m.trend === 'down' ? '↓ Falling' : '→ Stable', color: m.trend === 'up' ? 'text-green-400' : m.trend === 'down' ? 'text-red-400' : 'text-gray-300' },
                    { label: 'Demand', value: `${m.demand.toFixed(2)}x`, color: 'text-orange-400' },
                    { label: 'Supply', value: `${m.supply.toFixed(2)}x`, color: 'text-cyan-400' },
                    { label: 'Volatility', value: `${(m.volatility * 100).toFixed(0)}%`, color: m.volatility > 0.2 ? 'text-red-400' : 'text-gray-300' },
                    { label: 'Auto-Sell', value: isAutoSell ? 'Enabled' : 'Disabled', color: isAutoSell ? 'text-green-400' : 'text-gray-500' },
                  ]}
                  side="right"
                >
                <button
                  onClick={() => setSelectedResource(m.resource)}
                  className={`game-card rounded-lg p-3 text-left w-full ${
                    isSelected ? 'border-cyan-500/50 bg-cyan-900/10' : 'bg-card border-border hover:border-gray-600'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <GameIcon icon={meta.icon} size={16} />
                      <div>
                        <div className="text-xs text-gray-200 font-medium">{meta.name}</div>
                        <div className="text-[9px] text-gray-500">Tier {meta.tier}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {/* Price Alert Badges */}
                      {priceRatio > 1.5 && (
                        <span
                          key={`hot-${m.resource}`}
                          className="text-[8px] px-1.5 py-0.5 rounded-full bg-orange-900/30 text-orange-400 border border-orange-500/30 font-bold inline-flex items-center gap-0.5"><GameIcon icon="gi:flame" size={10} /> HOT</span>
                      )}
                      {priceRatio < 0.5 && (
                        <span
                          key={`low-${m.resource}`}
                          className="text-[8px] px-1.5 py-0.5 rounded-full bg-blue-900/30 text-blue-400 border border-blue-500/30 font-bold inline-flex items-center gap-0.5"><GameIcon icon="gi:falling" size={10} /> LOW</span>
                      )}
                      {/* Trend Arrow with animation */}
                      {m.trend === 'up' && <span className="text-xs trend-arrow-bounce inline-flex items-center" style={{ filter: 'drop-shadow(0 0 3px rgba(74,222,128,0.5))' }}><GameIcon icon="gi:fast-arrow" size={12} className="text-green-400 rotate-[-90deg]" /></span>}
                      {m.trend === 'down' && <span className="text-xs trend-arrow-bounce inline-flex items-center" style={{ filter: 'drop-shadow(0 0 3px rgba(248,113,113,0.5))' }}><GameIcon icon="gi:fast-arrow" size={12} className="text-red-400 rotate-90" /></span>}
                      {/* Auto-sell indicator */}
                      {isAutoSell && (
                        <span className="text-[8px] px-1 py-0.5 rounded bg-green-900/30 text-green-400 border border-green-500/30">AUTO</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-sm font-bold font-mono ${m.trend === 'up' ? 'text-green-400' : m.trend === 'down' ? 'text-red-400' : 'text-cyan-400'}`}>
                        ${m.currentPrice.toFixed(2)}
                      </span>
                      {m.trend === 'up' && (
                        <span className="text-[9px] text-green-400/70 font-mono">▲</span>
                      )}
                      {m.trend === 'down' && (
                        <span className="text-[9px] text-red-400/70 font-mono">▼</span>
                      )}
                    </div>
                    <div className="text-[10px] text-gray-500">
                      {formatNumber(held)}/{formatNumber(capacity)}
                      <span className={`ml-1 inline-block w-8 h-1.5 rounded-full bg-gray-800 align-middle overflow-hidden`}>
                        <span
                          className={`h-full rounded-full block ${fillPct > 80 ? 'bg-red-500' : fillPct > 50 ? 'bg-yellow-500' : 'bg-green-500'}`}
                          style={{ width: `${Math.min(100, fillPct)}%` }}
                        />
                      </span>
                    </div>
                  </div>
                  {/* Bezier Sparkline */}
                  <div className="h-8">
                    <BezierSparkline
                      data={m.priceHistory.slice(-50)}
                      color={sparkColor}
                      width={200}
                      height={32}
                      showGradient
                      id={m.resource}
                    />
                  </div>
                </button>
                </GameItemTooltip>
              );
            })}
          </div>
        </div>

        {/* Trade Panel */}
        <div className="space-y-4">
          {selected && selectedMeta ? (
            <>
              {/* Selected Resource Detail */}
              <div className="game-card rounded-xl bg-card p-4 border border-cyan-900/30">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-12 h-12 rounded-xl bg-[#0a0e17] flex items-center justify-center text-2xl">
                    <GameIcon icon={selectedMeta.icon} size={24} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-bold text-gray-200">{selectedMeta.name}</h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-lg font-bold font-mono ${selected.trend === 'up' ? 'text-green-400' : selected.trend === 'down' ? 'text-red-400' : 'text-cyan-400'}`}>
                        ${selected.currentPrice.toFixed(2)}
                      </span>
                      <span className={`text-xs font-mono ${priceChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}%
                      </span>
                    </div>
                  </div>
                  {/* Auto-sell toggle */}
                  <button
                    onClick={(e) => { e.stopPropagation(); store.toggleAutoSell(selected.resource); }}
                    aria-pressed={store.autoSellResources.includes(selected.resource)}
                    className={`px-2 py-1 rounded text-[9px] font-bold border ${
                      store.autoSellResources.includes(selected.resource)
                        ? 'bg-green-900/30 text-green-400 border-green-500/30'
                        : 'bg-gray-900 text-gray-500 border-gray-700 hover:border-gray-500'
                    }`}
                    title="Auto-sell when storage > 80%"
                  >
                    {store.autoSellResources.includes(selected.resource) ? <><GameIcon icon="gi:spinning-wheel" size={14} className="inline" /> AUTO</> : 'AUTO'}
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2 mb-3">
                  <PanelStatCard
                    icon={<DollarSign className="w-4 h-4" />}
                    label="Base Price"
                    value={`$${selected.basePrice.toFixed(2)}`}
                    subtext="Reference price"
                    color="cyan"
                  />
                  <PanelStatCard
                    icon={<Activity className="w-4 h-4" />}
                    label="Volatility"
                    value={`${(selected.volatility * 100).toFixed(0)}%`}
                    subtext="Price swing"
                    color={selected.volatility > 0.2 ? 'red' : 'sky'}
                    trend={selected.volatility > 0.2 ? 'down' : 'neutral'}
                  />
                  <PanelStatCard
                    icon={<TrendingUp className="w-4 h-4" />}
                    label="Demand"
                    value={`${selected.demand.toFixed(2)}x`}
                    subtext="Buy pressure"
                    color="orange"
                    trend={selected.demand > 1 ? 'up' : 'down'}
                  />
                  <PanelStatCard
                    icon={<ShoppingCart className="w-4 h-4" />}
                    label="Supply"
                    value={`${selected.supply.toFixed(2)}x`}
                    subtext="Sell pressure"
                    color="cyan"
                    trend={selected.supply > 1 ? 'down' : 'up'}
                  />
                </div>

                {/* Price History Chart - Large with Bezier */}
                {selected.priceHistory.length > 1 && (
                  <div className="mb-3">
                    <div className="text-[10px] text-gray-500 mb-1">Price History (last 50)</div>
                    <div className="h-20 bg-[#0a0e17] rounded-lg p-1">
                      <BezierSparkline
                        data={selected.priceHistory.slice(-50)}
                        color={selected.trend === 'up' ? '#4ade80' : selected.trend === 'down' ? '#f87171' : '#67e8f9'}
                        width={400}
                        height={76}
                        showGradient
                        id={`detail-${selected.resource}`}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Trade Controls */}
              <div className="game-card rounded-xl bg-card p-4 border border-green-900/30">
                <div className="flex items-center gap-2 mb-3">
                  <DollarSign className="w-4 h-4 text-green-400" />
                  <h3 className="text-sm font-semibold text-green-400">Trade</h3>
                </div>

                <PanelStatCard
                  icon={<Package className="w-4 h-4" />}
                  label="You Hold"
                  value={formatNumber(store.resources[selectedResource!])}
                  subtext="Current inventory"
                  color="cyan"
                />

                {/* Buy/Sell mode tabs */}
                <div className="flex items-center gap-1 mb-3">
                  <button
                    onClick={() => setTradeMode('sell')}
                    aria-pressed={tradeMode === 'sell'}
                    className={`flex-1 py-1.5 rounded text-[10px] font-bold ${
                      tradeMode === 'sell'
                        ? 'bg-green-900/30 text-green-400 border border-green-500/30'
                        : 'bg-[#0a0e17] text-gray-500 border border-gray-800'
                    }`}
                  >
                    <ArrowUpRight className="w-3 h-3 inline mr-1" />SELL
                  </button>
                  <button
                    onClick={() => setTradeMode('buy')}
                    aria-pressed={tradeMode === 'buy'}
                    className={`flex-1 py-1.5 rounded text-[10px] font-bold ${
                      tradeMode === 'buy'
                        ? 'bg-orange-900/30 text-orange-400 border border-orange-500/30'
                        : 'bg-[#0a0e17] text-gray-500 border border-gray-800'
                    }`}
                  >
                    <ArrowDownRight className="w-3 h-3 inline mr-1" />BUY
                  </button>
                </div>

                {/* Quantity selector */}
                <div className="flex items-center gap-1 mb-3">
                  {[1, 10, 100, 1000].map(amt => (
                    <button
                      key={amt}
                      onClick={() => setTradeAmount(amt)}
                      className={`flex-1 py-1.5 rounded text-[10px] font-mono ${
                        tradeAmount === amt
                          ? 'bg-cyan-900/30 text-cyan-400 border border-cyan-500/30'
                          : 'bg-[#0a0e17] text-gray-500 border border-gray-800 hover:text-gray-300'
                      }`}
                    >
                      {amt}x
                    </button>
                  ))}
                  <button
                    onClick={() => setTradeAmount(tradeMode === 'sell' ? maxSell : maxBuy)}
                    className={`flex-1 py-1.5 rounded text-[10px] font-mono ${
                      tradeAmount === (tradeMode === 'sell' ? maxSell : maxBuy)
                        ? 'bg-cyan-900/30 text-cyan-400 border border-cyan-500/30'
                        : 'bg-[#0a0e17] text-gray-500 border border-gray-800 hover:text-gray-300'
                    }`}
                  >
                    MAX
                  </button>
                </div>

                {/* Trade summary */}
                <div className="space-y-1.5 mb-3 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Sell Price</span>
                    <span className="text-green-400 font-mono">${(selected.currentPrice * 0.9).toFixed(2)}/u</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Buy Price</span>
                    <span className="text-orange-400 font-mono">${(selected.currentPrice * 1.1).toFixed(2)}/u</span>
                  </div>
                  <div className="border-t border-gray-800 pt-1">
                    {tradeMode === 'sell' ? (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Sell {tradeAmount} for</span>
                        <span className="text-green-400 font-mono font-bold">${formatNumber(sellRevenue)}</span>
                      </div>
                    ) : (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Buy {tradeAmount} for</span>
                        <span className={`text-orange-400 font-mono font-bold ${store.money < buyCost ? 'text-red-400' : ''}`}>
                          ${formatNumber(buyCost)}
                        </span>
                      </div>
                    )}
                  </div>
                  {tradeMode === 'sell' && tradeAmount > maxSell && (
                    <div className="text-[9px] text-red-400">Only {maxSell} available to sell</div>
                  )}
                  {tradeMode === 'buy' && tradeAmount > maxBuy && (
                    <div className="text-[9px] text-red-400">Can only afford/buy {maxBuy}</div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Button
                    onClick={handleSell}
                    disabled={maxSell < tradeAmount || isSelling}
                    className="bg-green-600 hover:bg-green-500 text-white text-xs"
                    size="sm"
                  >
                    {isSelling ? <LoadingSpinner /> : <ArrowUpRight className="w-3 h-3 mr-1" />}
                    Sell
                  </Button>
                  <Button
                    onClick={handleBuy}
                    disabled={store.money < buyCost || maxBuy < tradeAmount || isBuying}
                    className="bg-orange-600 hover:bg-orange-500 text-white text-xs"
                    size="sm"
                  >
                    {isBuying ? <LoadingSpinner /> : <ArrowDownRight className="w-3 h-3 mr-1" />}
                    Buy
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="game-card rounded-xl bg-card p-6 border border-border text-center">
              <Activity className="w-10 h-10 text-gray-700 mx-auto mb-2" />
              <p className="text-xs text-gray-500">Select a resource to trade</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
