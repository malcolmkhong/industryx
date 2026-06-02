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
  Zap, Flame, Package, RefreshCw, Link2, Layers, Newspaper, AlertTriangle
} from 'lucide-react';
import { ResourceType } from '@/lib/game/types';
import { GameItemTooltip } from '@/components/game/GameItemTooltip';
import { PanelStatCard } from '@/components/game/shared/PanelStatCard';
import { GameIcon } from '@/components/game/shared/GameIcon';
import {
  RESOURCE_SECTOR, RESOURCE_ELASTICITY, PRICE_CORRELATIONS,
  getSectorInfo, getSeverityStyle, getCategoryIcon, MarketSector,
  MarketNews, MarketNarrative, VolatilityInjection,
} from '@/lib/game/marketSimulator';

// --- Bezier Sparkline Component ---
function BezierSparkline({
  data,
  width = 120,
  height = 32,
  color,
  showGradient = false,
  id,
  showBaseLine,
  baseValue,
}: {
  data: number[];
  width?: number;
  height?: number;
  color: string;
  showGradient?: boolean;
  id: string;
  showBaseLine?: boolean;
  baseValue?: number;
}) {
  if (data.length < 2) return null;

  const min = Math.min(...data, baseValue ?? Infinity);
  const max = Math.max(...data, baseValue ?? -Infinity);
  const range = max - min || 1;
  const padding = 2;
  const chartW = width - padding * 2;
  const chartH = height - padding * 2;

  const points = data.map((v, i) => ({
    x: padding + (i / (data.length - 1)) * chartW,
    y: padding + chartH - ((v - min) / range) * chartH,
  }));

  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const cpx = (prev.x + curr.x) / 2;
    path += ` C ${cpx} ${prev.y}, ${cpx} ${curr.y}, ${curr.x} ${curr.y}`;
  }

  const fillPath = `${path} L ${points[points.length - 1].x} ${height} L ${points[0].x} ${height} Z`;

  // Base line Y position
  const baseLineY = baseValue != null ? padding + chartH - ((baseValue - min) / range) * chartH : 0;

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
      {showBaseLine && baseValue != null && (
        <line x1={padding} y1={baseLineY} x2={width - padding} y2={baseLineY} stroke="#475569" strokeWidth="0.5" strokeDasharray="3 3" />
      )}
      <path d={path} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

// --- Supply/Demand Bar ---
function SupplyDemandBar({ demand, supply }: { demand: number; supply: number }) {
  // 0-2 scale, 1 = balanced
  const demandPct = Math.min(100, (demand / 2) * 100);
  const supplyPct = Math.min(100, (supply / 2) * 100);
  const net = demand - supply; // positive = demand > supply (price up), negative = oversupplied (price down)

  return (
    <div className="flex items-center gap-1">
      <div className="flex-1 flex items-center gap-0.5">
        <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden flex">
          <div className="h-full bg-orange-500/60 rounded-l-full" style={{ width: `${demandPct}%` }} />
        </div>
        <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden flex">
          <div className="h-full bg-cyan-500/60 rounded-l-full" style={{ width: `${supplyPct}%` }} />
        </div>
      </div>
      <span className={`text-[8px] font-mono font-bold ${net > 0.1 ? 'text-orange-400' : net < -0.1 ? 'text-cyan-400' : 'text-gray-500'}`}>
        {net > 0.1 ? '▲' : net < -0.1 ? '▼' : '─'}
      </span>
    </div>
  );
}

// --- Market Cycle Indicator ---
function MarketCycleIndicator({ phase, progress, multiplier }: { phase: string; progress: number; multiplier: number }) {
  const phaseConfig: Record<string, { color: string; label: string; icon: string }> = {
    expansion: { color: 'text-green-400', label: 'Expansion', icon: '📈' },
    peak: { color: 'text-yellow-400', label: 'Peak', icon: '⚡' },
    recession: { color: 'text-red-400', label: 'Recession', icon: '📉' },
    recovery: { color: 'text-cyan-400', label: 'Recovery', icon: '🔄' },
  };
  const config = phaseConfig[phase] ?? phaseConfig.expansion;

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs">{config.icon}</span>
      <div className="flex-1">
        <div className="flex items-center justify-between">
          <span className={`text-[10px] font-bold ${config.color}`}>{config.label}</span>
          <span className="text-[9px] text-gray-500 font-mono">{(multiplier * 100).toFixed(0)}%</span>
        </div>
        <div className="h-1 bg-gray-800 rounded-full mt-0.5">
          <div className={`h-full rounded-full transition-all duration-500 ${
            phase === 'expansion' ? 'bg-green-500' : phase === 'peak' ? 'bg-yellow-500' : phase === 'recession' ? 'bg-red-500' : 'bg-cyan-500'
          }`} style={{ width: `${Math.min(100, progress * 100)}%` }} />
        </div>
      </div>
    </div>
  );
}

// --- Sector Overview ---
function SectorOverview({ sectorTrends, market }: { sectorTrends: Partial<Record<MarketSector, 'up' | 'down' | 'stable'>>; market: Array<{ resource: ResourceType; currentPrice: number; basePrice: number }> }) {
  const sectors: MarketSector[] = ['raw_minerals', 'raw_organic', 'basic_materials', 'components', 'advanced', 'high_tech', 'endgame', 'agriculture'];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
      {sectors.map(sector => {
        const info = getSectorInfo(sector);
        const trend = sectorTrends[sector] ?? 'stable';
        const sectorRes = market.filter(m => RESOURCE_SECTOR[m.resource] === sector);
        const avgRatio = sectorRes.length > 0
          ? sectorRes.reduce((s, m) => s + m.currentPrice / m.basePrice, 0) / sectorRes.length
          : 1;

        return (
          <div key={sector} className={`rounded-lg p-2 border ${
            trend === 'up' ? 'border-green-500/20 bg-green-900/5' :
            trend === 'down' ? 'border-red-500/20 bg-red-900/5' :
            'border-gray-800 bg-card'
          }`}>
            <div className="flex items-center justify-between mb-0.5">
              <GameIcon icon={info.icon as `gi:${string}` | `lucide:${string}`} size={12} className={info.color} />
              {trend === 'up' && <span className="text-[8px] text-green-400">▲</span>}
              {trend === 'down' && <span className="text-[8px] text-red-400">▼</span>}
              {trend === 'stable' && <span className="text-[8px] text-gray-500">─</span>}
            </div>
            <div className={`text-[9px] font-medium ${info.color}`}>{info.name}</div>
            <div className="text-[9px] text-gray-500 font-mono">{(avgRatio * 100).toFixed(0)}%</div>
          </div>
        );
      })}
    </div>
  );
}

export function MarketPanel() {
  const store = useGameStore();
  const [selectedResource, setSelectedResource] = useState<ResourceType | null>(null);
  const [tradeAmount, setTradeAmount] = useState<number>(1);
  const [filter, setFilter] = useState<'all' | MarketSector>('all');
  const [tradeMode, setTradeMode] = useState<'sell' | 'buy'>('sell');
  const [viewMode, setViewMode] = useState<'market' | 'sectors' | 'chains' | 'news'>('market');

  const filteredMarket = useMemo(() => {
    return store.market.filter(m => {
      if (filter === 'all') return true;
      return RESOURCE_SECTOR[m.resource] === filter;
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

  // Get correlation chain for selected resource
  const correlationChain = useMemo(() => {
    if (!selectedResource) return { upstream: [], downstream: [] };
    const upstream = PRICE_CORRELATIONS
      .filter(c => c.to === selectedResource)
      .map(c => ({ resource: c.from, strength: c.strength, direction: 'upstream' as const }));
    const downstream = PRICE_CORRELATIONS
      .filter(c => c.from === selectedResource)
      .map(c => ({ resource: c.to, strength: c.strength, direction: 'downstream' as const }));
    return { upstream, downstream };
  }, [selectedResource]);

  // Player impact on selected resource
  const playerImpact = useMemo(() => {
    if (!selectedResource) return { production: 0, consumption: 0, netPressure: 0 };
    const prod = store.productionSnapshot?.production[selectedResource] ?? 0;
    const cons = store.productionSnapshot?.actualConsumption[selectedResource] ?? 0;
    const elasticity = RESOURCE_ELASTICITY[selectedResource];
    const netPressure = (prod - cons) * elasticity * 0.01;
    return { production: prod, consumption: cons, netPressure };
  }, [selectedResource, store.productionSnapshot]);

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

  const cycle = store.marketSimState?.cycle;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="bg-gradient-to-r from-green-900/10 to-transparent -m-0 p-0 rounded-xl">
          <h2 className="text-xl font-bold text-green-400 tracking-wide neon-glow-green">
            Global Market
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">Supply & demand driven economy — your production shapes prices</p>
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

      {/* Market Summary Bar — now with cycle info */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
        {/* Market Cycle Card */}
        <div className="game-card rounded-lg p-3 border border-border">
          <div className="text-[10px] text-gray-500 mb-1.5 flex items-center gap-1">
            <RefreshCw className="w-3 h-3" /> Market Cycle
          </div>
          {cycle ? (
            <MarketCycleIndicator
              phase={cycle.phase}
              progress={cycle.phaseProgress}
              multiplier={cycle.globalMultiplier}
            />
          ) : (
            <div className="text-[10px] text-gray-600">Initializing...</div>
          )}
        </div>
      </div>

      {/* View Mode Tabs */}
      <div className="flex items-center gap-2">
        {([
          { key: 'market', label: 'Market', icon: <BarChart3 className="w-3 h-3" /> },
          { key: 'sectors', label: 'Sectors', icon: <Layers className="w-3 h-3" /> },
          { key: 'chains', label: 'Chains', icon: <Link2 className="w-3 h-3" /> },
          { key: 'news', label: 'News', icon: <Newspaper className="w-3 h-3" /> },
        ] as const).map(v => (
          <button
            key={v.key}
            onClick={() => setViewMode(v.key)}
            className={`px-3 py-1.5 rounded-lg text-xs flex items-center gap-1 ${
              viewMode === v.key
                ? 'bg-green-900/30 text-green-400 border border-green-500/30'
                : 'bg-card text-gray-500 border border-gray-800 hover:text-gray-300'
            }`}
          >
            {v.icon} {v.label}
            {v.key === 'news' && (store.marketNews?.length ?? 0) > 0 && (
              <span className="w-2 h-2 rounded-full bg-amber-400 inline-block animate-pulse" />
            )}
          </button>
        ))}
      </div>

      {/* Sector Overview View */}
      {viewMode === 'sectors' && (
        <SectorOverview sectorTrends={store.sectorTrends ?? {}} market={store.market} />
      )}

      {/* Correlation Chains View */}
      {viewMode === 'chains' && (
        <div className="game-card rounded-xl bg-card p-4 border border-border">
          <div className="text-xs text-gray-400 mb-3 flex items-center gap-1.5">
            <Link2 className="w-3.5 h-3.5" /> Price Correlation Network
          </div>
          <div className="text-[10px] text-gray-500 mb-3">
            When an upstream resource price changes, it ripples through to downstream resources.
            Select a resource to see its chain.
          </div>
          {selectedResource ? (
            <div className="space-y-3">
              {/* Upstream */}
              {correlationChain.upstream.length > 0 && (
                <div>
                  <div className="text-[10px] text-orange-400 font-semibold mb-1.5">↑ Upstream (affects this price)</div>
                  <div className="space-y-1">
                    {correlationChain.upstream.map(c => {
                      const meta = RESOURCE_META[c.resource];
                      const m = store.market.find(x => x.resource === c.resource);
                      return (
                        <button
                          key={c.resource}
                          onClick={() => setSelectedResource(c.resource)}
                          className="w-full flex items-center justify-between p-2 rounded-lg bg-orange-900/5 border border-orange-500/10 hover:border-orange-500/30"
                        >
                          <div className="flex items-center gap-2">
                            <GameIcon icon={meta.icon} size={14} />
                            <span className="text-xs text-gray-200">{meta.name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-12 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                              <div className="h-full bg-orange-500 rounded-full" style={{ width: `${c.strength * 100}%` }} />
                            </div>
                            <span className="text-[9px] text-orange-400 font-mono">{(c.strength * 100).toFixed(0)}%</span>
                            {m && <span className="text-[9px] text-gray-500 font-mono">${m.currentPrice.toFixed(2)}</span>}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Current resource */}
              <div className="flex items-center justify-center gap-2 py-2">
                <div className="h-px bg-gray-700 flex-1" />
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-cyan-500/30 bg-cyan-900/10">
                  <GameIcon icon={selectedMeta?.icon} size={16} />
                  <span className="text-xs text-cyan-400 font-bold">{selectedMeta?.name}</span>
                </div>
                <div className="h-px bg-gray-700 flex-1" />
              </div>

              {/* Downstream */}
              {correlationChain.downstream.length > 0 && (
                <div>
                  <div className="text-[10px] text-green-400 font-semibold mb-1.5">↓ Downstream (this price affects)</div>
                  <div className="space-y-1">
                    {correlationChain.downstream.map(c => {
                      const meta = RESOURCE_META[c.resource];
                      const m = store.market.find(x => x.resource === c.resource);
                      return (
                        <button
                          key={c.resource}
                          onClick={() => setSelectedResource(c.resource)}
                          className="w-full flex items-center justify-between p-2 rounded-lg bg-green-900/5 border border-green-500/10 hover:border-green-500/30"
                        >
                          <div className="flex items-center gap-2">
                            <GameIcon icon={meta.icon} size={14} />
                            <span className="text-xs text-gray-200">{meta.name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-12 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                              <div className="h-full bg-green-500 rounded-full" style={{ width: `${c.strength * 100}%` }} />
                            </div>
                            <span className="text-[9px] text-green-400 font-mono">{(c.strength * 100).toFixed(0)}%</span>
                            {m && <span className="text-[9px] text-gray-500 font-mono">${m.currentPrice.toFixed(2)}</span>}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {correlationChain.upstream.length === 0 && correlationChain.downstream.length === 0 && (
                <div className="text-center py-4 text-[10px] text-gray-500">No correlations defined for this resource</div>
              )}
            </div>
          ) : (
            <div className="text-center py-6 text-[10px] text-gray-500">
              Select a resource from the market list to see its price correlation chain
            </div>
          )}
        </div>
      )}

      {/* Market View */}
      {viewMode === 'market' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Market Table */}
          <div className="lg:col-span-2 space-y-4">
            {/* Filters — now includes sectors */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                onClick={() => setFilter('all')}
                className={`px-2.5 py-1 rounded-lg text-[10px] ${
                  filter === 'all'
                    ? 'bg-green-900/30 text-green-400 border border-green-500/30'
                    : 'bg-card text-gray-500 border border-gray-800 hover:text-gray-300'
                }`}
              >
                All
              </button>
              {(['raw_minerals', 'raw_organic', 'basic_materials', 'components', 'advanced', 'high_tech', 'endgame', 'agriculture'] as MarketSector[]).map(s => {
                const info = getSectorInfo(s);
                const trend = store.sectorTrends?.[s];
                return (
                  <button
                    key={s}
                    onClick={() => setFilter(s)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] flex items-center gap-1 ${
                      filter === s
                        ? 'bg-green-900/30 text-green-400 border border-green-500/30'
                        : 'bg-card text-gray-500 border border-gray-800 hover:text-gray-300'
                    }`}
                  >
                    <GameIcon icon={info.icon as `gi:${string}` | `lucide:${string}`} size={10} />
                    {info.name.split(' ')[0]}
                    {trend === 'up' && <span className="text-green-400">▲</span>}
                    {trend === 'down' && <span className="text-red-400">▼</span>}
                  </button>
                );
              })}
            </div>

            {/* Resource Cards with Sparklines */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[500px] overflow-y-auto game-scrollbar scroll-fade">
              {filteredMarket.length === 0 && (
                <div className="col-span-full flex flex-col items-center justify-center py-8 text-gray-500">
                  <Package className="w-8 h-8 mb-2 opacity-50" />
                  <p className="text-sm">No resources in this category.</p>
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
                const sector = RESOURCE_SECTOR[m.resource];
                const sectorInfo = getSectorInfo(sector);
                const elasticity = RESOURCE_ELASTICITY[m.resource];
                const prod = store.productionSnapshot?.production[m.resource] ?? 0;
                const cons = store.productionSnapshot?.actualConsumption[m.resource] ?? 0;
                const activeInjection = store.marketSimState?.volatilityInjections?.[m.resource];

                return (
                  <GameItemTooltip
                    key={m.resource}
                    name={meta.name}
                    icon={meta.icon}
                    category={sectorInfo.name}
                    tier={meta.tier}
                    details={[
                      { label: 'Current Price', value: `$${m.currentPrice.toFixed(2)}`, color: m.trend === 'up' ? 'text-green-400' : m.trend === 'down' ? 'text-red-400' : 'text-cyan-400' },
                      { label: 'Base Price', value: `$${m.basePrice.toFixed(2)}` },
                      { label: 'Trend', value: m.trend === 'up' ? '↑ Rising' : m.trend === 'down' ? '↓ Falling' : '→ Stable', color: m.trend === 'up' ? 'text-green-400' : m.trend === 'down' ? 'text-red-400' : 'text-gray-300' },
                      { label: 'Demand', value: `${m.demand.toFixed(2)}x`, color: 'text-orange-400' },
                      { label: 'Supply', value: `${m.supply.toFixed(2)}x`, color: 'text-cyan-400' },
                      { label: 'Elasticity', value: `${(elasticity * 100).toFixed(0)}%`, color: elasticity > 0.5 ? 'text-red-400' : 'text-gray-300' },
                      { label: 'Volatility', value: activeInjection ? `⚡ ${activeInjection.source} (${activeInjection.intensity.toFixed(2)})` : 'None', color: activeInjection ? 'text-amber-400' : 'text-gray-500' },
                      { label: 'Your Production', value: prod > 0 ? `${prod.toFixed(1)}/s` : '—', color: prod > 0 ? 'text-green-400' : 'text-gray-500' },
                      { label: 'Your Consumption', value: cons > 0 ? `${cons.toFixed(1)}/s` : '—', color: cons > 0 ? 'text-orange-400' : 'text-gray-500' },
                      { label: 'Auto-Sell', value: isAutoSell ? 'Enabled' : 'Disabled', color: isAutoSell ? 'text-green-400' : 'text-gray-500' },
                    ]}
                    side="right"
                  >
                  <button
                    onClick={() => { setSelectedResource(m.resource); setViewMode('market'); }}
                    className={`game-card rounded-lg p-3 text-left w-full transition-colors ${
                      isSelected ? 'border-cyan-500/50 bg-cyan-900/10' : 'bg-card border-border hover:border-gray-600'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <GameIcon icon={meta.icon} size={16} />
                        <div>
                          <div className="text-xs text-gray-200 font-medium">{meta.name}</div>
                          <div className="text-[9px] text-gray-500 flex items-center gap-1">
                            <span className={sectorInfo.color}>{sectorInfo.name.split(' ')[0]}</span>
                            <span>·</span>
                            <span>E:{(elasticity * 100).toFixed(0)}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {activeInjection && (
                          <span className={`text-[8px] px-1.5 py-0.5 rounded-full border font-bold inline-flex items-center gap-0.5 ${
                            activeInjection.source === 'macro'
                              ? 'bg-red-900/30 text-red-400 border-red-500/30'
                              : activeInjection.source === 'chain'
                                ? 'bg-purple-900/30 text-purple-400 border-purple-500/30'
                                : 'bg-amber-900/30 text-amber-400 border-amber-500/30'
                          }`}>
                            <AlertTriangle className="w-2.5 h-2.5" />
                            {activeInjection.source === 'macro' ? 'MACRO' : activeInjection.source === 'chain' ? 'CHAIN' : '⚡'}
                          </span>
                        )}
                        {priceRatio > 1.5 && (
                          <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-orange-900/30 text-orange-400 border border-orange-500/30 font-bold inline-flex items-center gap-0.5"><GameIcon icon="gi:flame" size={10} /> HOT</span>
                        )}
                        {priceRatio < 0.5 && (
                          <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-blue-900/30 text-blue-400 border border-blue-500/30 font-bold inline-flex items-center gap-0.5"><GameIcon icon="gi:falling" size={10} /> LOW</span>
                        )}
                        {m.trend === 'up' && <span className="text-xs trend-arrow-bounce inline-flex items-center" style={{ filter: 'drop-shadow(0 0 3px rgba(74,222,128,0.5))' }}><GameIcon icon="gi:fast-arrow" size={12} className="text-green-400 rotate-[-90deg]" /></span>}
                        {m.trend === 'down' && <span className="text-xs trend-arrow-bounce inline-flex items-center" style={{ filter: 'drop-shadow(0 0 3px rgba(248,113,113,0.5))' }}><GameIcon icon="gi:fast-arrow" size={12} className="text-red-400 rotate-90" /></span>}
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
                        {m.trend === 'up' && <span className="text-[9px] text-green-400/70 font-mono">▲</span>}
                        {m.trend === 'down' && <span className="text-[9px] text-red-400/70 font-mono">▼</span>}
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
                    {/* Supply/Demand Mini Bar */}
                    <SupplyDemandBar demand={m.demand} supply={m.supply} />
                    {/* Player impact indicator */}
                    {(prod > 0 || cons > 0) && (
                      <div className="flex items-center gap-1 mt-1">
                        {prod > 0 && <span className="text-[8px] text-green-500 font-mono">+{prod.toFixed(1)}/s</span>}
                        {cons > 0 && <span className="text-[8px] text-orange-500 font-mono">-{cons.toFixed(1)}/s</span>}
                      </div>
                    )}
                    {/* Bezier Sparkline with base price line */}
                    <div className="h-8 mt-1">
                      <BezierSparkline
                        data={m.priceHistory.slice(-50)}
                        color={sparkColor}
                        width={200}
                        height={32}
                        showGradient
                        id={m.resource}
                        showBaseLine
                        baseValue={m.basePrice}
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
                      label="Elasticity"
                      value={`${(RESOURCE_ELASTICITY[selected.resource] * 100).toFixed(0)}%`}
                      subtext={RESOURCE_ELASTICITY[selected.resource] > 0.5 ? 'Volatile' : 'Stable'}
                      color={RESOURCE_ELASTICITY[selected.resource] > 0.5 ? 'red' : 'sky'}
                      trend={RESOURCE_ELASTICITY[selected.resource] > 0.5 ? 'down' : 'neutral'}
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

                  {/* Player Impact Section */}
                  {(playerImpact.production > 0 || playerImpact.consumption > 0) && (
                    <div className="mb-3 p-2 rounded-lg border border-gray-800 bg-[#0a0e17]">
                      <div className="text-[10px] text-gray-400 font-semibold mb-1.5 flex items-center gap-1">
                        <Zap className="w-3 h-3" /> Your Market Impact
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div>
                          <div className="text-[10px] text-gray-500">Production</div>
                          <div className="text-xs text-green-400 font-mono font-bold">+{playerImpact.production.toFixed(1)}/s</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-gray-500">Consumption</div>
                          <div className="text-xs text-orange-400 font-mono font-bold">-{playerImpact.consumption.toFixed(1)}/s</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-gray-500">Price Effect</div>
                          <div className={`text-xs font-mono font-bold ${playerImpact.netPressure > 0 ? 'text-red-400' : playerImpact.netPressure < 0 ? 'text-green-400' : 'text-gray-400'}`}>
                            {playerImpact.netPressure > 0 ? '↓ Pushes down' : playerImpact.netPressure < 0 ? '↑ Pushes up' : '─ Neutral'}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Correlation Links Quick View */}
                  {(correlationChain.upstream.length > 0 || correlationChain.downstream.length > 0) && (
                    <div className="mb-3 p-2 rounded-lg border border-gray-800 bg-[#0a0e17]">
                      <div className="text-[10px] text-gray-400 font-semibold mb-1.5 flex items-center gap-1">
                        <Link2 className="w-3 h-3" /> Price Links
                      </div>
                      <div className="space-y-1">
                        {correlationChain.upstream.slice(0, 3).map(c => (
                          <div key={`up-${c.resource}`} className="flex items-center justify-between text-[9px]">
                            <span className="text-orange-400">↑ {RESOURCE_META[c.resource].name}</span>
                            <span className="text-gray-500 font-mono">{(c.strength * 100).toFixed(0)}%</span>
                          </div>
                        ))}
                        {correlationChain.downstream.slice(0, 3).map(c => (
                          <div key={`down-${c.resource}`} className="flex items-center justify-between text-[9px]">
                            <span className="text-green-400">↓ {RESOURCE_META[c.resource].name}</span>
                            <span className="text-gray-500 font-mono">{(c.strength * 100).toFixed(0)}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Price History Chart - Large with Bezier + base line */}
                  {selected.priceHistory.length > 1 && (
                    <div className="mb-3">
                      <div className="text-[10px] text-gray-500 mb-1 flex items-center justify-between">
                        <span>Price History (last 50)</span>
                        <span className="text-gray-600">--- base price</span>
                      </div>
                      <div className="h-20 bg-[#0a0e17] rounded-lg p-1">
                        <BezierSparkline
                          data={selected.priceHistory.slice(-50)}
                          color={selected.trend === 'up' ? '#4ade80' : selected.trend === 'down' ? '#f87171' : '#67e8f9'}
                          width={400}
                          height={76}
                          showGradient
                          id={`detail-${selected.resource}`}
                          showBaseLine
                          baseValue={selected.basePrice}
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
                    {/* Price impact warning */}
                    {tradeMode === 'sell' && tradeAmount > 100 && (
                      <div className="text-[9px] text-amber-400 flex items-center gap-1">
                        <Flame className="w-3 h-3" /> Large sell may depress market price
                      </div>
                    )}
                    {tradeMode === 'buy' && tradeAmount > 100 && (
                      <div className="text-[9px] text-amber-400 flex items-center gap-1">
                        <Flame className="w-3 h-3" /> Large buy may inflate market price
                      </div>
                    )}
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
      )}

      {/* News & Narrative View */}
      {viewMode === 'news' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* News Feed */}
          <div className="lg:col-span-2 space-y-3">
            <div className="game-card rounded-xl bg-card p-4 border border-amber-900/20">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Newspaper className="w-4 h-4 text-amber-400" />
                  <h3 className="text-sm font-semibold text-amber-400">Market News</h3>
                </div>
                <Badge variant="outline" className="border-amber-500/30 text-amber-400 bg-amber-900/10 text-[9px]">
                  {(store.marketNews?.length ?? 0)} stories
                </Badge>
              </div>

              {(store.marketNews?.length ?? 0) === 0 ? (
                <div className="text-center py-8">
                  <Newspaper className="w-10 h-10 text-gray-700 mx-auto mb-2" />
                  <p className="text-xs text-gray-500">No market news yet. News will appear as prices move and events occur.</p>
                  <p className="text-[10px] text-gray-600 mt-1">Start producing and trading to generate market activity.</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[500px] overflow-y-auto game-scrollbar scroll-fade">
                  {(store.marketNews ?? []).map(news => {
                    const style = getSeverityStyle(news.severity);
                    return (
                      <div key={news.id} className={`rounded-lg p-3 border ${style.border} ${style.bg}`}>
                        <div className="flex items-start gap-2">
                          <span className="text-sm mt-0.5">{getCategoryIcon(news.category)}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`text-xs font-bold ${style.color}`}>{news.title}</span>
                              <span className={`inline-block w-1.5 h-1.5 rounded-full ${style.dot} flex-shrink-0`} />
                            </div>
                            <p className="text-[10px] text-gray-400 leading-relaxed">{news.description}</p>
                            <div className="flex items-center gap-2 mt-1.5">
                              <span className="text-[9px] text-gray-600 font-mono">Impact: {news.impactSummary}</span>
                              <span className="text-[9px] text-gray-600">·</span>
                              <span className="text-[9px] text-gray-600">Tick {news.gameTick}</span>
                            </div>
                            {news.affectedResources.length > 0 && (
                              <div className="flex items-center gap-1 mt-1 flex-wrap">
                                {news.affectedResources.slice(0, 5).map(r => (
                                  <span key={r} className="text-[8px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 border border-gray-700">
                                    {RESOURCE_META[r]?.name ?? r}
                                  </span>
                                ))}
                                {news.affectedResources.length > 5 && (
                                  <span className="text-[8px] text-gray-500">+{news.affectedResources.length - 5} more</span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Narrative + Active Volatility Panel */}
          <div className="space-y-3">
            {/* Active Volatility Injections */}
            <div className="game-card rounded-xl bg-card p-4 border border-amber-900/20">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-semibold text-amber-400">Active Volatility</h3>
              </div>
              {(() => {
                const injections = store.marketSimState?.volatilityInjections ?? {};
                const activeList = Object.entries(injections).filter(([, v]) => v) as [string, VolatilityInjection][];
                if (activeList.length === 0) {
                  return <div className="text-[10px] text-gray-500 text-center py-3">No active volatility injections</div>;
                }
                return (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto game-scrollbar">
                    {activeList.map(([resource, inj]) => {
                      const meta = RESOURCE_META[resource as ResourceType];
                      const style = inj.source === 'macro' ? 'border-red-500/20 bg-red-900/5' : inj.source === 'chain' ? 'border-purple-500/20 bg-purple-900/5' : 'border-amber-500/20 bg-amber-900/5';
                      return (
                        <div key={resource} className={`rounded-lg p-2 border ${style}`}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <GameIcon icon={meta?.icon} size={12} />
                              <span className="text-[10px] text-gray-300">{meta?.name ?? resource}</span>
                            </div>
                            <span className={`text-[8px] px-1.5 py-0.5 rounded-full border font-bold ${
                              inj.source === 'macro' ? 'border-red-500/30 text-red-400' : inj.source === 'chain' ? 'border-purple-500/30 text-purple-400' : 'border-amber-500/30 text-amber-400'
                            }`}>{inj.source.toUpperCase()}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-[9px] text-gray-500">
                            <span>{inj.direction > 0 ? '▲' : '▼'} {(inj.intensity * 100).toFixed(0)}%</span>
                            <span>·</span>
                            <span>{inj.duration} steps left</span>
                            {inj.label && <><span>·</span><span className="text-gray-400">{inj.label}</span></>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            {/* Player Narratives */}
            <div className="game-card rounded-xl bg-card p-4 border border-cyan-900/20">
              <div className="flex items-center gap-2 mb-3">
                <Zap className="w-4 h-4 text-cyan-400" />
                <h3 className="text-sm font-semibold text-cyan-400">Your Market Influence</h3>
              </div>
              {(store.marketNarratives?.length ?? 0) === 0 ? (
                <div className="text-[10px] text-gray-500 text-center py-3">
                  Your actions will shape market narratives as you grow your industrial empire.
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto game-scrollbar">
                  {(store.marketNarratives ?? []).map(narrative => {
                    const style = getSeverityStyle(narrative.severity);
                    return (
                      <div key={narrative.id} className={`rounded-lg p-2.5 border ${style.border} ${style.bg}`}>
                        <div className={`text-[10px] font-bold ${style.color} mb-0.5`}>{narrative.title}</div>
                        <p className="text-[9px] text-gray-400 leading-relaxed">{narrative.description}</p>
                        <div className="flex items-center gap-1 mt-1 flex-wrap">
                          <span className="text-[8px] text-cyan-500">🏭 {narrative.playerAction}</span>
                          <span className="text-[8px] text-gray-600">→</span>
                          <span className="text-[8px] text-amber-400">{narrative.marketEffect}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
