'use client';

import { useState, useMemo } from 'react';
import { useGameStore, formatNumber } from '@/lib/game/store';
import { RESOURCE_META } from '@/lib/game/data';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  TrendingUp, TrendingDown, Minus, ShoppingCart, DollarSign,
  ArrowUpRight, ArrowDownRight, BarChart3, Wallet, Activity
} from 'lucide-react';
import { ResourceType } from '@/lib/game/types';

export function MarketPanel() {
  const store = useGameStore();
  const [selectedResource, setSelectedResource] = useState<ResourceType | null>(null);
  const [tradeAmount, setTradeAmount] = useState<number>(1);
  const [filter, setFilter] = useState<'all' | 'raw' | 'processed'>('all');

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

  const selected = selectedResource ? store.market.find(m => m.resource === selectedResource) : null;
  const selectedMeta = selectedResource ? RESOURCE_META[selectedResource] : null;

  const priceChange = useMemo(() => {
    if (!selected || selected.priceHistory.length < 2) return 0;
    const prev = selected.priceHistory[selected.priceHistory.length - 1];
    return prev > 0 ? ((selected.currentPrice - prev) / prev) * 100 : 0;
  }, [selected]);

  const handleSell = () => {
    if (!selectedResource) return;
    const amount = Math.min(tradeAmount, store.resources[selectedResource]);
    if (amount > 0) store.sellResource(selectedResource, amount);
  };

  const handleBuy = () => {
    if (!selectedResource) return;
    store.buyResource(selectedResource, tradeAmount);
  };

  const maxSell = selectedResource ? Math.floor(store.resources[selectedResource]) : 0;
  const buyCost = selected ? selected.currentPrice * tradeAmount * 1.1 : 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-green-400 neon-glow-cyan tracking-wide">Global Market</h2>
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

      {/* Market Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="game-card rounded-xl bg-[#111827] p-3 border border-green-900/30">
          <div className="text-[10px] text-gray-500 mb-1">Cash Balance</div>
          <div className="text-lg font-bold font-mono text-green-400">${formatNumber(store.money)}</div>
        </div>
        <div className="game-card rounded-xl bg-[#111827] p-3 border border-cyan-900/30">
          <div className="text-[10px] text-gray-500 mb-1">Portfolio Value</div>
          <div className="text-lg font-bold font-mono text-cyan-400">${formatNumber(portfolioValue)}</div>
        </div>
        <div className="game-card rounded-xl bg-[#111827] p-3 border border-purple-900/30">
          <div className="text-[10px] text-gray-500 mb-1">Total Earned</div>
          <div className="text-lg font-bold font-mono text-purple-400">${formatNumber(store.totalMoneyEarned)}</div>
        </div>
        <div className="game-card rounded-xl bg-[#111827] p-3 border border-orange-900/30">
          <div className="text-[10px] text-gray-500 mb-1">Market Items</div>
          <div className="text-lg font-bold font-mono text-orange-400">{store.market.length}</div>
        </div>
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
                className={`px-3 py-1 rounded-lg text-xs transition-all ${
                  filter === f
                    ? 'bg-green-900/30 text-green-400 border border-green-500/30'
                    : 'bg-[#111827] text-gray-500 border border-gray-800 hover:text-gray-300'
                }`}
              >
                {f === 'all' ? 'All' : f === 'raw' ? 'Raw Materials' : 'Processed'}
              </button>
            ))}
          </div>

          {/* Resource Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[500px] overflow-y-auto game-scrollbar">
            {filteredMarket.map(m => {
              const meta = RESOURCE_META[m.resource];
              const held = store.resources[m.resource];
              const isSelected = selectedResource === m.resource;
              const trendIcon = m.trend === 'up' ? <TrendingUp className="w-3 h-3" /> : m.trend === 'down' ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />;
              const trendColor = m.trend === 'up' ? 'text-green-400' : m.trend === 'down' ? 'text-red-400' : 'text-gray-400';

              return (
                <button
                  key={m.resource}
                  onClick={() => setSelectedResource(m.resource)}
                  className={`game-card rounded-lg p-3 text-left transition-all ${
                    isSelected ? 'border-cyan-500/50 bg-cyan-900/10' : 'bg-[#111827] border-[#1e293b]'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-base">{meta.emoji}</span>
                      <div>
                        <div className="text-xs text-gray-200 font-medium">{meta.name}</div>
                        <div className="text-[9px] text-gray-500">Tier {meta.tier}</div>
                      </div>
                    </div>
                    <div className={trendColor}>{trendIcon}</div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-bold font-mono text-green-400">${m.currentPrice.toFixed(2)}</div>
                    <div className="text-[10px] text-gray-500">Held: {formatNumber(held)}</div>
                  </div>
                  {/* Mini sparkline */}
                  {m.priceHistory.length > 1 && (
                    <div className="mt-1.5 h-6">
                      <svg viewBox="0 0 100 20" className="w-full h-full" preserveAspectRatio="none">
                        <polyline
                          fill="none"
                          stroke={m.trend === 'up' ? '#4ade80' : m.trend === 'down' ? '#f87171' : '#67e8f9'}
                          strokeWidth="1"
                          points={m.priceHistory.slice(-20).map((p, i, arr) => {
                            const min = Math.min(...arr);
                            const max = Math.max(...arr);
                            const range = max - min || 1;
                            const x = (i / (arr.length - 1)) * 100;
                            const y = 20 - ((p - min) / range) * 18;
                            return `${x},${y}`;
                          }).join(' ')}
                        />
                      </svg>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Trade Panel */}
        <div className="space-y-4">
          {selected && selectedMeta ? (
            <>
              {/* Selected Resource Detail */}
              <div className="game-card rounded-xl bg-[#111827] p-4 border border-cyan-900/30">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-12 h-12 rounded-xl bg-[#0a0e17] flex items-center justify-center text-2xl">
                    {selectedMeta.emoji}
                  </div>
                  <div>
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
                </div>

                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className="bg-[#0a0e17] rounded-lg p-2 text-center">
                    <div className="text-[10px] text-gray-500">Base Price</div>
                    <div className="text-xs font-mono text-gray-300">${selected.basePrice.toFixed(2)}</div>
                  </div>
                  <div className="bg-[#0a0e17] rounded-lg p-2 text-center">
                    <div className="text-[10px] text-gray-500">Volatility</div>
                    <div className={`text-xs font-mono ${selected.volatility > 0.2 ? 'text-red-400' : 'text-gray-300'}`}>
                      {(selected.volatility * 100).toFixed(0)}%
                    </div>
                  </div>
                  <div className="bg-[#0a0e17] rounded-lg p-2 text-center">
                    <div className="text-[10px] text-gray-500">Demand</div>
                    <div className="text-xs font-mono text-orange-400">{selected.demand.toFixed(2)}x</div>
                  </div>
                  <div className="bg-[#0a0e17] rounded-lg p-2 text-center">
                    <div className="text-[10px] text-gray-500">Supply</div>
                    <div className="text-xs font-mono text-cyan-400">{selected.supply.toFixed(2)}x</div>
                  </div>
                </div>

                {/* Price History Chart */}
                {selected.priceHistory.length > 1 && (
                  <div className="mb-3">
                    <div className="text-[10px] text-gray-500 mb-1">Price History (last 50)</div>
                    <div className="h-16 bg-[#0a0e17] rounded-lg p-1">
                      <svg viewBox="0 0 100 30" className="w-full h-full" preserveAspectRatio="none">
                        <defs>
                          <linearGradient id={`gradient-${selected.resource}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={selected.trend === 'up' ? '#4ade80' : selected.trend === 'down' ? '#f87171' : '#67e8f9'} stopOpacity="0.3" />
                            <stop offset="100%" stopColor="transparent" stopOpacity="0" />
                          </linearGradient>
                        </defs>
                        <polyline
                          fill={`url(#gradient-${selected.resource})`}
                          stroke="none"
                          points={`0,30 ${selected.priceHistory.slice(-50).map((p, i, arr) => {
                            const min = Math.min(...arr);
                            const max = Math.max(...arr);
                            const range = max - min || 1;
                            const x = (i / (arr.length - 1)) * 100;
                            const y = 28 - ((p - min) / range) * 26;
                            return `${x},${y}`;
                          }).join(' ')} 100,30`}
                        />
                        <polyline
                          fill="none"
                          stroke={selected.trend === 'up' ? '#4ade80' : selected.trend === 'down' ? '#f87171' : '#67e8f9'}
                          strokeWidth="1.5"
                          points={selected.priceHistory.slice(-50).map((p, i, arr) => {
                            const min = Math.min(...arr);
                            const max = Math.max(...arr);
                            const range = max - min || 1;
                            const x = (i / (arr.length - 1)) * 100;
                            const y = 28 - ((p - min) / range) * 26;
                            return `${x},${y}`;
                          }).join(' ')}
                        />
                      </svg>
                    </div>
                  </div>
                )}
              </div>

              {/* Trade Controls */}
              <div className="game-card rounded-xl bg-[#111827] p-4 border border-green-900/30">
                <div className="flex items-center gap-2 mb-3">
                  <DollarSign className="w-4 h-4 text-green-400" />
                  <h3 className="text-sm font-semibold text-green-400">Trade</h3>
                </div>

                <div className="bg-[#0a0e17] rounded-lg p-2 mb-3 text-center">
                  <div className="text-[10px] text-gray-500">You Hold</div>
                  <div className="text-lg font-bold font-mono text-cyan-400">{formatNumber(store.resources[selectedResource!])}</div>
                </div>

                {/* Amount selector */}
                <div className="flex items-center gap-1 mb-3">
                  {[1, 10, 100, 1000].map(amt => (
                    <button
                      key={amt}
                      onClick={() => setTradeAmount(amt)}
                      className={`flex-1 py-1.5 rounded text-[10px] font-mono transition-all ${
                        tradeAmount === amt
                          ? 'bg-cyan-900/30 text-cyan-400 border border-cyan-500/30'
                          : 'bg-[#0a0e17] text-gray-500 border border-gray-800 hover:text-gray-300'
                      }`}
                    >
                      {amt}
                    </button>
                  ))}
                  <button
                    onClick={() => selectedResource && setTradeAmount(Math.floor(store.resources[selectedResource!]))}
                    className="flex-1 py-1.5 rounded text-[10px] font-mono bg-[#0a0e17] text-gray-500 border border-gray-800 hover:text-gray-300"
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
                  <div className="flex justify-between border-t border-gray-800 pt-1">
                    <span className="text-gray-500">Sell {tradeAmount} for</span>
                    <span className="text-green-400 font-mono font-bold">${formatNumber(selected.currentPrice * tradeAmount * 0.9)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Buy {tradeAmount} for</span>
                    <span className="text-orange-400 font-mono font-bold">${formatNumber(buyCost)}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Button
                    onClick={handleSell}
                    disabled={maxSell < tradeAmount}
                    className="bg-green-600 hover:bg-green-500 text-white text-xs"
                    size="sm"
                  >
                    <ArrowUpRight className="w-3 h-3 mr-1" />
                    Sell
                  </Button>
                  <Button
                    onClick={handleBuy}
                    disabled={store.money < buyCost}
                    className="bg-orange-600 hover:bg-orange-500 text-white text-xs"
                    size="sm"
                  >
                    <ArrowDownRight className="w-3 h-3 mr-1" />
                    Buy
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="game-card rounded-xl bg-[#111827] p-6 border border-[#1e293b] text-center">
              <Activity className="w-10 h-10 text-gray-700 mx-auto mb-2" />
              <p className="text-xs text-gray-500">Select a resource to trade</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
