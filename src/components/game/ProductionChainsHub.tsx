'use client';

import { useState, useMemo, useCallback } from 'react';
import { useGameStore, formatNumber } from '@/lib/game/store';
import { PRODUCTION_CHAINS, RESOURCE_META, BUILDING_DEFS } from '@/lib/game/data';
import { ResourceType, ProductionChainCategory, CHAIN_CATEGORY_META } from '@/lib/game/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Search, ChevronRight, ChevronDown, AlertTriangle, Check,
  ArrowRight, X, Package, Zap, Pause, Factory,
  TrendingUp, BarChart3, Layers, GitBranch, CircleDot,
  ArrowUpDown, Filter, Star, Lock, Unlock,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

type ChainStatus = 'locked' | 'notStarted' | 'partial' | 'producing';

interface ChainWithStatus {
  chain: typeof PRODUCTION_CHAINS[number];
  status: ChainStatus;
  stepStatuses: { step: string; hasProduction: boolean; hasStock: boolean }[];
  producingCount: number;
  totalSteps: number;
  completionPct: number;
}

type SortKey = 'name' | 'status' | 'completion' | 'category';
type ViewMode = 'grid' | 'list' | 'flow';

export function ProductionChainsHub() {
  const store = useGameStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<ProductionChainCategory | 'all'>('all');
  const [expandedChain, setExpandedChain] = useState<string | null>(null);
  const [selectedChain, setSelectedChain] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('category');
  const [sortAsc, setSortAsc] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [statusFilter, setStatusFilter] = useState<ChainStatus | 'all'>('all');

  // Compute chain statuses
  const chainsWithStatus: ChainWithStatus[] = useMemo(() => {
    return PRODUCTION_CHAINS.map(chain => {
      const stepStatuses = chain.steps.map(step => {
        const prodRate = store.computedProductionRates[step] ?? 0;
        const stock = store.resources[step as ResourceType] ?? 0;
        return { step, hasProduction: prodRate > 0, hasStock: stock > 0 };
      });

      const producingCount = stepStatuses.filter(s => s.hasProduction).length;
      const anyStock = stepStatuses.some(s => s.hasStock);
      const anyProduction = stepStatuses.some(s => s.hasProduction);
      const completionPct = chain.steps.length > 0 ? (producingCount / chain.steps.length) * 100 : 0;

      let status: ChainStatus;
      if (!anyProduction && !anyStock) {
        status = 'notStarted';
      } else if (producingCount === chain.steps.length) {
        status = 'producing';
      } else {
        status = 'partial';
      }

      return { chain, status, stepStatuses, producingCount, totalSteps: chain.steps.length, completionPct };
    });
  }, [store.computedProductionRates, store.resources]);

  // Filter chains
  const filteredChains = useMemo(() => {
    let filtered = chainsWithStatus;
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(c => c.chain.category === selectedCategory);
    }
    if (statusFilter !== 'all') {
      filtered = filtered.filter(c => c.status === statusFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(c =>
        c.chain.name.toLowerCase().includes(q) ||
        c.chain.steps.some(s => {
          const meta = RESOURCE_META[s as ResourceType];
          return meta?.name?.toLowerCase().includes(q) ?? s.toLowerCase().includes(q);
        })
      );
    }
    return filtered;
  }, [chainsWithStatus, selectedCategory, searchQuery, statusFilter]);

  // Sort chains
  const sortedChains = useMemo(() => {
    const sorted = [...filteredChains];
    const statusOrder: Record<ChainStatus, number> = { producing: 0, partial: 1, notStarted: 2, locked: 3 };
    sorted.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'name': cmp = a.chain.name.localeCompare(b.chain.name); break;
        case 'status': cmp = statusOrder[a.status] - statusOrder[b.status]; break;
        case 'completion': cmp = a.completionPct - b.completionPct; break;
        case 'category': cmp = (CHAIN_CATEGORY_META[a.chain.category as ProductionChainCategory]?.order ?? 0) - (CHAIN_CATEGORY_META[b.chain.category as ProductionChainCategory]?.order ?? 0); break;
      }
      return sortAsc ? cmp : -cmp;
    });
    return sorted;
  }, [filteredChains, sortKey, sortAsc]);

  // Category stats
  const categoryStats = useMemo(() => {
    const stats: Record<string, { total: number; producing: number; partial: number; notStarted: number }> = {};
    for (const cat of Object.keys(CHAIN_CATEGORY_META) as ProductionChainCategory[]) {
      const catChains = chainsWithStatus.filter(c => c.chain.category === cat);
      stats[cat] = {
        total: catChains.length,
        producing: catChains.filter(c => c.status === 'producing').length,
        partial: catChains.filter(c => c.status === 'partial').length,
        notStarted: catChains.filter(c => c.status === 'notStarted').length,
      };
    }
    return stats;
  }, [chainsWithStatus]);

  // Global stats
  const globalStats = useMemo(() => ({
    total: chainsWithStatus.length,
    producing: chainsWithStatus.filter(c => c.status === 'producing').length,
    partial: chainsWithStatus.filter(c => c.status === 'partial').length,
    notStarted: chainsWithStatus.filter(c => c.status === 'notStarted').length,
  }), [chainsWithStatus]);

  // Find buildings for a step
  const getStepBuildings = useCallback((resourceKey: string) => {
    return Object.values(BUILDING_DEFS).filter(def =>
      def.outputs?.some(o => o.resource === resourceKey) ||
      def.category === 'extractor' && def.resource === resourceKey
    );
  }, []);

  // Get active building count for a resource
  const getActiveBuildingCount = useCallback((resourceKey: string) => {
    const buildings = getStepBuildings(resourceKey);
    return buildings.reduce((sum, def) => {
      return sum + store.buildings.filter(b => b.type === def.type && b.active).length;
    }, 0);
  }, [getStepBuildings, store.buildings]);

  // Get total building count for a resource
  const getTotalBuildingCount = useCallback((resourceKey: string) => {
    const buildings = getStepBuildings(resourceKey);
    return buildings.reduce((sum, def) => {
      return sum + store.buildings.filter(b => b.type === def.type).length;
    }, 0);
  }, [getStepBuildings, store.buildings]);

  const getStatusColor = (status: ChainStatus) => {
    switch (status) {
      case 'producing': return 'text-green-400';
      case 'partial': return 'text-amber-400';
      case 'notStarted': return 'text-gray-500';
      case 'locked': return 'text-red-400';
    }
  };

  const getStatusBg = (status: ChainStatus) => {
    switch (status) {
      case 'producing': return 'bg-green-500/10 border-green-500/20';
      case 'partial': return 'bg-amber-500/10 border-amber-500/20';
      case 'notStarted': return 'bg-gray-800/50 border-gray-700/30';
      case 'locked': return 'bg-red-500/10 border-red-500/20';
    }
  };

  const getStatusBadge = (status: ChainStatus) => {
    switch (status) {
      case 'producing': return <Badge className="bg-green-600/20 text-green-400 border-green-500/30 text-[9px] px-1.5"><Check className="w-2.5 h-2.5 mr-0.5" />ACTIVE</Badge>;
      case 'partial': return <Badge className="bg-amber-600/20 text-amber-400 border-amber-500/30 text-[9px] px-1.5"><Zap className="w-2.5 h-2.5 mr-0.5" />PARTIAL</Badge>;
      case 'notStarted': return <Badge className="bg-gray-800/50 text-gray-400 border-gray-600/30 text-[9px] px-1.5"><Pause className="w-2.5 h-2.5 mr-0.5" />IDLE</Badge>;
      case 'locked': return <Badge className="bg-red-600/20 text-red-400 border-red-500/30 text-[9px] px-1.5"><AlertTriangle className="w-2.5 h-2.5 mr-0.5" />LOCKED</Badge>;
    }
  };

  // Group sorted chains by category
  const groupedChains = useMemo(() => {
    const groups: Record<ProductionChainCategory, ChainWithStatus[]> = {
      basic: [], industrial: [], advanced: [], hightech: [], cosmic: [],
    };
    sortedChains.forEach(c => {
      groups[c.chain.category as ProductionChainCategory].push(c);
    });
    return groups;
  }, [sortedChains]);

  const selectedChainData = selectedChain ? chainsWithStatus.find(c => c.chain.name === selectedChain) : null;

  // Toggle sort
  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-bold text-violet-400 tracking-wide flex items-center gap-2" style={{ textShadow: '0 0 10px rgba(139,92,246,0.5), 0 0 20px rgba(139,92,246,0.3)' }}>
            <Package className="w-5 h-5" />
            PRODUCTION CHAINS
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">Complete production chain hub — {PRODUCTION_CHAINS.length} chains from raw resources to endgame</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="border-green-500/50 text-green-400 bg-green-900/20 text-xs">
            <Check className="w-3 h-3 mr-1" />{globalStats.producing} Active
          </Badge>
          <Badge variant="outline" className="border-amber-500/50 text-amber-400 bg-amber-900/20 text-xs">
            <Zap className="w-3 h-3 mr-1" />{globalStats.partial} Partial
          </Badge>
          <Badge variant="outline" className="border-gray-500/50 text-gray-400 bg-gray-900/20 text-xs">
            {globalStats.total} Total
          </Badge>
        </div>
      </div>

      {/* Global Progress Bar */}
      <div className="game-card rounded-xl bg-[#111827] p-3 border border-[#1e293b]">
        <div className="flex items-center justify-between text-[11px] mb-1.5">
          <span className="text-gray-400">Empire Production Progress</span>
          <span className="text-gray-300 font-mono">{globalStats.producing}/{globalStats.total} chains fully active ({((globalStats.producing / globalStats.total) * 100).toFixed(0)}%)</span>
        </div>
        <div className="flex h-3 rounded-full overflow-hidden bg-gray-800">
          {globalStats.producing > 0 && <div className="bg-green-500 transition-all duration-500" style={{ width: `${(globalStats.producing / globalStats.total) * 100}%` }} title={`${globalStats.producing} active`} />}
          {globalStats.partial > 0 && <div className="bg-amber-500 transition-all duration-500" style={{ width: `${(globalStats.partial / globalStats.total) * 100}%` }} title={`${globalStats.partial} partial`} />}
        </div>
        {/* Category mini progress bars */}
        <div className="grid grid-cols-5 gap-2 mt-2">
          {(Object.keys(CHAIN_CATEGORY_META) as ProductionChainCategory[]).map(cat => {
            const meta = CHAIN_CATEGORY_META[cat];
            const stats = categoryStats[cat];
            const pct = stats.total > 0 ? (stats.producing / stats.total) * 100 : 0;
            return (
              <div key={cat} className="text-center">
                <div className="text-[9px] text-gray-500 mb-0.5">{meta.icon} {meta.label.split(' ')[0]}</div>
                <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: meta.color }} />
                </div>
                <div className="text-[8px] text-gray-600 font-mono mt-0.5">{stats.producing}/{stats.total}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Search + Filters */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-col sm:flex-row gap-2">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search chains or materials..."
              className="w-full pl-9 pr-8 py-2 text-xs bg-[#111827] border border-[#1e293b] rounded-lg text-gray-300 placeholder-gray-600 focus:outline-none focus:border-violet-500/50"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Sort Controls */}
          <div className="flex items-center gap-1">
            <Button
              onClick={() => handleSort('category')}
              size="sm"
              variant={sortKey === 'category' ? 'default' : 'outline'}
              className={`text-[9px] h-7 px-2 ${sortKey === 'category' ? 'bg-violet-600/30 text-violet-300 border-violet-500/50' : 'bg-[#111827] text-gray-400 border-gray-700/30'}`}
            >
              <Layers className="w-3 h-3 mr-1" />Category
              {sortKey === 'category' && <span className="ml-0.5">{sortAsc ? '↑' : '↓'}</span>}
            </Button>
            <Button
              onClick={() => handleSort('completion')}
              size="sm"
              variant={sortKey === 'completion' ? 'default' : 'outline'}
              className={`text-[9px] h-7 px-2 ${sortKey === 'completion' ? 'bg-violet-600/30 text-violet-300 border-violet-500/50' : 'bg-[#111827] text-gray-400 border-gray-700/30'}`}
            >
              <BarChart3 className="w-3 h-3 mr-1" />Progress
              {sortKey === 'completion' && <span className="ml-0.5">{sortAsc ? '↑' : '↓'}</span>}
            </Button>
            <Button
              onClick={() => handleSort('name')}
              size="sm"
              variant={sortKey === 'name' ? 'default' : 'outline'}
              className={`text-[9px] h-7 px-2 ${sortKey === 'name' ? 'bg-violet-600/30 text-violet-300 border-violet-500/50' : 'bg-[#111827] text-gray-400 border-gray-700/30'}`}
            >
              A-Z
              {sortKey === 'name' && <span className="ml-0.5">{sortAsc ? '↑' : '↓'}</span>}
            </Button>
          </div>
        </div>

        {/* Category + Status Filter Pills */}
        <div className="flex gap-1 flex-wrap">
          {/* Category pills */}
          <Button
            onClick={() => setSelectedCategory('all')}
            size="sm"
            variant={selectedCategory === 'all' ? 'default' : 'outline'}
            className={`text-[10px] h-7 px-2.5 ${selectedCategory === 'all' ? 'bg-violet-600/30 text-violet-300 border-violet-500/50' : 'bg-[#111827] text-gray-400 border-gray-700/30'}`}
          >
            All ({globalStats.total})
          </Button>
          {(Object.keys(CHAIN_CATEGORY_META) as ProductionChainCategory[]).map(cat => {
            const meta = CHAIN_CATEGORY_META[cat];
            const stats = categoryStats[cat];
            return (
              <Button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                size="sm"
                variant={selectedCategory === cat ? 'default' : 'outline'}
                className={`text-[10px] h-7 px-2.5 ${selectedCategory === cat ? 'border-violet-500/50' : 'bg-[#111827] text-gray-400 border-gray-700/30'}`}
                style={selectedCategory === cat ? { background: `${meta.color}22`, color: meta.color, borderColor: `${meta.color}55` } : undefined}
              >
                {meta.icon} {meta.label.split(' ')[0]} ({stats.total})
              </Button>
            );
          })}

          {/* Separator */}
          <div className="w-px bg-gray-700/50 mx-1 self-stretch" />

          {/* Status filter pills */}
          <Button
            onClick={() => setStatusFilter('all')}
            size="sm"
            variant={statusFilter === 'all' ? 'default' : 'outline'}
            className={`text-[10px] h-7 px-2 ${statusFilter === 'all' ? 'bg-violet-600/30 text-violet-300 border-violet-500/50' : 'bg-[#111827] text-gray-400 border-gray-700/30'}`}
          >
            <Filter className="w-3 h-3 mr-1" />All
          </Button>
          <Button
            onClick={() => setStatusFilter('producing')}
            size="sm"
            variant={statusFilter === 'producing' ? 'default' : 'outline'}
            className={`text-[10px] h-7 px-2 ${statusFilter === 'producing' ? 'bg-green-600/20 text-green-400 border-green-500/40' : 'bg-[#111827] text-gray-400 border-gray-700/30'}`}
          >
            <Check className="w-3 h-3 mr-1" />Active
          </Button>
          <Button
            onClick={() => setStatusFilter('partial')}
            size="sm"
            variant={statusFilter === 'partial' ? 'default' : 'outline'}
            className={`text-[10px] h-7 px-2 ${statusFilter === 'partial' ? 'bg-amber-600/20 text-amber-400 border-amber-500/40' : 'bg-[#111827] text-gray-400 border-gray-700/30'}`}
          >
            <Zap className="w-3 h-3 mr-1" />Partial
          </Button>
          <Button
            onClick={() => setStatusFilter('notStarted')}
            size="sm"
            variant={statusFilter === 'notStarted' ? 'default' : 'outline'}
            className={`text-[10px] h-7 px-2 ${statusFilter === 'notStarted' ? 'bg-gray-600/20 text-gray-400 border-gray-500/40' : 'bg-[#111827] text-gray-400 border-gray-700/30'}`}
          >
            <Pause className="w-3 h-3 mr-1" />Idle
          </Button>
        </div>
      </div>

      {/* Main Content: Chain List + Detail Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: Chain List (2/3 on desktop) */}
        <div className="lg:col-span-2 space-y-4">
          {(Object.keys(CHAIN_CATEGORY_META) as ProductionChainCategory[]).map(cat => {
            const catChains = groupedChains[cat];
            if (catChains.length === 0) return null;
            const meta = CHAIN_CATEGORY_META[cat];

            return (
              <div key={cat} className="space-y-2">
                {/* Category Header */}
                <div className="flex items-center gap-2 px-1">
                  <span className="text-sm">{meta.icon}</span>
                  <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: meta.color }}>
                    {meta.label}
                  </h3>
                  <div className="flex-1 h-px" style={{ background: `${meta.color}33` }} />
                  <span className="text-[10px] text-gray-600">{catChains.filter(c => c.status === 'producing').length}/{catChains.length} active</span>
                </div>

                {/* Chain Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {catChains.map(({ chain, status, stepStatuses, producingCount, totalSteps, completionPct }) => {
                    const isExpanded = expandedChain === chain.name;
                    const isSelected = selectedChain === chain.name;

                    // Calculate bottleneck info
                    const bottleneckSteps = stepStatuses
                      .map((s, i) => ({ ...s, index: i }))
                      .filter(s => !s.hasProduction);
                    const firstBottleneck = bottleneckSteps[0];

                    return (
                      <motion.div
                        key={chain.name}
                        layout
                        className={`rounded-xl border transition-all duration-200 cursor-pointer ${getStatusBg(status)} ${isSelected ? 'ring-1 ring-violet-500/40' : 'hover:border-gray-600/50'}`}
                        style={{ borderLeftWidth: '3px', borderLeftColor: chain.color }}
                        onClick={() => {
                          setSelectedChain(isSelected ? null : chain.name);
                          setExpandedChain(isExpanded ? null : chain.name);
                        }}
                      >
                        <div className="p-3">
                          {/* Chain Header */}
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-sm font-semibold text-gray-200 truncate">{chain.name}</span>
                              {getStatusBadge(status)}
                            </div>
                            <span className="text-[10px] text-gray-500 font-mono flex-shrink-0">{producingCount}/{totalSteps}</span>
                          </div>

                          {/* Progress Bar */}
                          <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden mb-2">
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{
                                width: `${completionPct}%`,
                                background: status === 'producing'
                                  ? `linear-gradient(90deg, ${chain.color}, #22c55e)`
                                  : chain.color,
                                opacity: status === 'producing' ? 1 : 0.6,
                              }}
                            />
                          </div>

                          {/* Step Pills with production indicators */}
                          <div className="flex items-center gap-1 flex-wrap">
                            {chain.steps.map((step, i) => {
                              const stepSt = stepStatuses[i];
                              const rMeta = RESOURCE_META[step as ResourceType];
                              const activeBuildings = getActiveBuildingCount(step);
                              const totalBuildings = getTotalBuildingCount(step);
                              const prodRate = store.computedProductionRates[step] ?? 0;

                              return (
                                <div key={step} className="flex items-center gap-0.5">
                                  <span
                                    className={`inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full transition-all duration-200 ${
                                      stepSt.hasProduction
                                        ? 'bg-green-500/10 text-green-400 ring-1 ring-green-500/20'
                                        : stepSt.hasStock
                                          ? 'bg-amber-500/10 text-amber-400'
                                          : 'bg-gray-800 text-gray-500'
                                    }`}
                                    title={`${rMeta?.name ?? step}: ${prodRate > 0 ? `+${prodRate.toFixed(1)}/t` : 'no production'} | Buildings: ${activeBuildings}/${totalBuildings}`}
                                  >
                                    {rMeta?.emoji && <span className="text-[8px]">{rMeta.emoji}</span>}
                                    {rMeta?.name ?? step}
                                    {activeBuildings > 0 && (
                                      <span className="text-[7px] opacity-70">({activeBuildings})</span>
                                    )}
                                  </span>
                                  {i < chain.steps.length - 1 && (
                                    <ChevronRight className="w-2.5 h-2.5 text-gray-700 flex-shrink-0" />
                                  )}
                                </div>
                              );
                            })}
                          </div>

                          {/* Bottleneck indicator */}
                          {firstBottleneck && status === 'partial' && (
                            <div className="mt-2 flex items-center gap-1.5 text-[9px] text-amber-400/80">
                              <AlertTriangle className="w-3 h-3" />
                              <span>Bottleneck: <strong>{RESOURCE_META[chain.steps[firstBottleneck.index] as ResourceType]?.name ?? chain.steps[firstBottleneck.index]}</strong> not producing</span>
                              {getTotalBuildingCount(chain.steps[firstBottleneck.index]) === 0 && (
                                <span className="text-red-400/70">(no buildings)</span>
                              )}
                            </div>
                          )}

                          {/* Expanded Detail */}
                          <AnimatePresence>
                            {isExpanded && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="overflow-hidden"
                              >
                                <div className="mt-3 pt-3 border-t border-gray-700/30 space-y-2">
                                  {/* Flow Diagram */}
                                  <div className="flex items-center gap-1 flex-wrap">
                                    {chain.steps.map((step, i) => {
                                      const stepSt = stepStatuses[i];
                                      const rMeta = RESOURCE_META[step as ResourceType];
                                      const stock = store.resources[step as ResourceType] ?? 0;
                                      const capacity = store.resourceCapacity[step as ResourceType] ?? 100;
                                      const prodRate = store.computedProductionRates[step] ?? 0;
                                      const consRate = store.computedConsumptionRates[step] ?? 0;
                                      const activeB = getActiveBuildingCount(step);
                                      const totalB = getTotalBuildingCount(step);

                                      return (
                                        <div key={step} className="flex items-center gap-1">
                                          <div className={`flex flex-col items-center p-2.5 rounded-lg min-w-[80px] transition-all duration-200 ${
                                            stepSt.hasProduction ? 'bg-green-500/5 border border-green-500/20' :
                                            stepSt.hasStock ? 'bg-amber-500/5 border border-amber-500/20' :
                                            'bg-gray-800/50 border border-gray-700/30'
                                          }`}>
                                            <span className="text-base">{rMeta?.emoji ?? '📦'}</span>
                                            <span className="text-[9px] font-medium text-gray-300 mt-0.5">{rMeta?.name ?? step}</span>
                                            <span className="text-[8px] text-gray-500 font-mono">{formatNumber(stock)}</span>
                                            {prodRate > 0 && <span className="text-[8px] text-green-400 font-mono">+{formatNumber(prodRate)}/t</span>}
                                            {consRate > 0 && <span className="text-[8px] text-red-400 font-mono">-{formatNumber(consRate)}/t</span>}
                                            {/* Building indicator */}
                                            <div className="flex items-center gap-0.5 mt-0.5">
                                              <Factory className="w-2.5 h-2.5 text-gray-600" />
                                              <span className={`text-[7px] font-mono ${activeB > 0 ? 'text-green-500' : totalB > 0 ? 'text-amber-500' : 'text-gray-600'}`}>
                                                {activeB}/{totalB}
                                              </span>
                                            </div>
                                          </div>
                                          {i < chain.steps.length - 1 && (
                                            <ArrowRight className="w-3 h-3 text-gray-600 flex-shrink-0" />
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>

                                  {/* Producing Buildings */}
                                  <div className="text-[10px] text-gray-500 mt-2">
                                    <span className="font-medium text-gray-400">Producing Buildings:</span>
                                    <div className="mt-1 space-y-0.5">
                                      {chain.steps.map(step => {
                                        const buildings = getStepBuildings(step);
                                        if (buildings.length === 0) return null;
                                        const rMeta = RESOURCE_META[step as ResourceType];
                                        return (
                                          <div key={step} className="flex items-center gap-2">
                                            <span className="text-gray-400">{rMeta?.emoji} {rMeta?.name ?? step}:</span>
                                            <span className="text-gray-500">{buildings.map(b => b.name).join(', ')}</span>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {filteredChains.length === 0 && (
            <div className="text-center py-12 text-gray-600">
              <Search className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No chains match your search</p>
              <p className="text-[10px] mt-1">Try adjusting filters or search terms</p>
            </div>
          )}
        </div>

        {/* Right: Detail Panel (1/3 on desktop) */}
        <div className="space-y-3">
          {selectedChainData ? (
            <>
              {/* Selected Chain Detail */}
              <div className="game-card rounded-xl bg-[#111827] p-4 border border-violet-900/30" style={{ borderLeftWidth: '3px', borderLeftColor: selectedChainData.chain.color }}>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-bold text-gray-200">{selectedChainData.chain.name}</h3>
                    <span className="text-[9px] text-gray-500">
                      {CHAIN_CATEGORY_META[selectedChainData.chain.category as ProductionChainCategory]?.icon}{' '}
                      {CHAIN_CATEGORY_META[selectedChainData.chain.category as ProductionChainCategory]?.label}
                    </span>
                  </div>
                  {getStatusBadge(selectedChainData.status)}
                </div>

                {/* Completion indicator */}
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${selectedChainData.completionPct}%`,
                        background: selectedChainData.chain.color,
                      }}
                    />
                  </div>
                  <span className="text-[10px] text-gray-400 font-mono">{selectedChainData.completionPct.toFixed(0)}%</span>
                </div>

                {/* Full Flow */}
                <div className="space-y-2 mb-4">
                  {selectedChainData.chain.steps.map((step, i) => {
                    const stepSt = selectedChainData.stepStatuses[i];
                    const rMeta = RESOURCE_META[step as ResourceType];
                    const stock = store.resources[step as ResourceType] ?? 0;
                    const capacity = store.resourceCapacity[step as ResourceType] ?? 100;
                    const prodRate = store.computedProductionRates[step] ?? 0;
                    const consRate = store.computedConsumptionRates[step] ?? 0;
                    const netRate = prodRate - consRate;
                    const fillPct = Math.min(100, (stock / capacity) * 100);
                    const activeB = getActiveBuildingCount(step);
                    const totalB = getTotalBuildingCount(step);
                    const buildings = getStepBuildings(step);

                    return (
                      <div key={step}>
                        <div className={`flex items-start gap-3 p-2.5 rounded-lg transition-all duration-200 ${
                          stepSt.hasProduction ? 'bg-green-500/5 border border-green-500/15' :
                          stepSt.hasStock ? 'bg-amber-500/5 border border-amber-500/15' :
                          'bg-gray-800/30 border border-gray-700/20'
                        }`}>
                          <span className="text-lg mt-0.5">{rMeta?.emoji ?? '📦'}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-medium text-gray-300">{rMeta?.name ?? step}</span>
                              <span className={`text-[10px] font-mono ${
                                netRate > 0 ? 'text-green-400' : netRate < 0 ? 'text-red-400' : 'text-gray-500'
                              }`}>
                                {netRate > 0 ? '+' : ''}{netRate !== 0 ? `${formatNumber(netRate)}/t` : '—'}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                                <div className="h-full rounded-full transition-all" style={{
                                  width: `${fillPct}%`,
                                  background: fillPct >= 95 ? '#ef4444' : fillPct >= 80 ? '#f59e0b' : '#22c55e',
                                }} />
                              </div>
                              <span className="text-[9px] text-gray-500 font-mono">{formatNumber(stock)}/{formatNumber(capacity)}</span>
                            </div>
                            <div className="flex gap-3 mt-0.5">
                              {prodRate > 0 && <span className="text-[9px] text-green-400">+{formatNumber(prodRate)}/t</span>}
                              {consRate > 0 && <span className="text-[9px] text-red-400">-{formatNumber(consRate)}/t</span>}
                            </div>
                            {/* Building info */}
                            <div className="flex items-center gap-1 mt-1">
                              <Factory className="w-3 h-3 text-gray-600" />
                              {buildings.length > 0 ? (
                                <span className={`text-[9px] font-mono ${activeB > 0 ? 'text-green-500' : totalB > 0 ? 'text-amber-500' : 'text-gray-600'}`}>
                                  {activeB}/{totalB} active
                                </span>
                              ) : (
                                <span className="text-[9px] text-gray-600 font-mono">no producer buildings</span>
                              )}
                              {buildings.length > 0 && (
                                <span className="text-[8px] text-gray-600 ml-1">
                                  ({buildings.map(b => `${b.emoji}${b.name}`).join(', ')})
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        {i < selectedChainData.chain.steps.length - 1 && (
                          <div className="flex justify-center py-0.5">
                            <ArrowRight className="w-3 h-3 rotate-90 text-gray-600" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Buildings Summary */}
                <div className="border-t border-gray-700/30 pt-3">
                  <div className="text-[10px] text-gray-500 font-medium mb-2">Required Buildings</div>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto game-scrollbar">
                    {selectedChainData.chain.steps.map(step => {
                      const buildings = getStepBuildings(step);
                      if (buildings.length === 0) return null;
                      const rMeta = RESOURCE_META[step as ResourceType];
                      return (
                        <div key={step}>
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="text-gray-400">{rMeta?.emoji} {rMeta?.name ?? step}</span>
                          </div>
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {buildings.map(def => {
                              const total = store.buildings.filter(b => b.type === def.type).length;
                              const active = store.buildings.filter(b => b.type === def.type && b.active).length;
                              return (
                                <span key={def.type} className={`inline-flex items-center gap-0.5 text-[8px] px-1.5 py-0.5 rounded-full border ${
                                  active > 0
                                    ? 'bg-green-900/20 text-green-400 border-green-800/30'
                                    : total > 0
                                      ? 'bg-amber-900/20 text-amber-400 border-amber-800/30'
                                      : 'bg-gray-800/50 text-gray-500 border-gray-700/30'
                                }`}>
                                  {def.emoji} {def.name} <span className="font-mono">{active}/{total}</span>
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Dependency Map */}
              <div className="game-card rounded-xl bg-[#111827] p-4 border border-[#1e293b]">
                <div className="text-[10px] text-gray-500 font-medium mb-2">
                  <GitBranch className="w-3 h-3 inline mr-1" />
                  Dependency Map
                </div>
                <div className="space-y-1">
                  {selectedChainData.chain.steps.map((step) => {
                    const rMeta = RESOURCE_META[step as ResourceType];
                    // Find other chains that also produce/consume this resource
                    const relatedChains = PRODUCTION_CHAINS.filter(c =>
                      c.name !== selectedChainData.chain.name && c.steps.includes(step)
                    );
                    if (relatedChains.length === 0) return null;
                    return (
                      <div key={step} className="text-[10px]">
                        <span className="text-gray-400">{rMeta?.emoji} {rMeta?.name ?? step}</span>
                        <span className="text-gray-600"> → </span>
                        {relatedChains.map((rc, j) => (
                          <span key={rc.name}>
                            <span className="text-violet-400 cursor-pointer hover:underline" onClick={() => setSelectedChain(rc.name)}>{rc.name}</span>
                            {j < relatedChains.length - 1 && <span className="text-gray-600">, </span>}
                          </span>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Quick Build Suggestions */}
              <div className="game-card rounded-xl bg-[#111827] p-4 border border-[#1e293b]">
                <div className="text-[10px] text-gray-500 font-medium mb-2">
                  <TrendingUp className="w-3 h-3 inline mr-1" />
                  Quick Actions
                </div>
                {(() => {
                  // Find bottleneck steps with no buildings
                  const missingBuildings = selectedChainData.chain.steps.filter(step => {
                    const stepSt = selectedChainData.stepStatuses.find((s, i) => selectedChainData.chain.steps[i] === step);
                    return stepSt && !stepSt.hasProduction && getTotalBuildingCount(step) === 0;
                  });

                  if (missingBuildings.length === 0 && selectedChainData.status === 'producing') {
                    return (
                      <div className="flex items-center gap-2 text-[10px] text-green-400">
                        <Check className="w-3 h-3" />
                        All steps producing! Chain is fully active.
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-1.5">
                      {missingBuildings.map(step => {
                        const buildings = getStepBuildings(step);
                        const rMeta = RESOURCE_META[step as ResourceType];
                        return (
                          <div key={step} className="text-[9px]">
                            <span className="text-red-400">⚠</span>{' '}
                            <span className="text-gray-300">{rMeta?.name ?? step}</span>
                            <span className="text-gray-600"> needs: </span>
                            {buildings.length > 0 ? (
                              buildings.map(b => (
                                <span key={b.type} className="text-amber-400">{b.emoji}{b.name}</span>
                              ))
                            ) : (
                              <span className="text-gray-500 italic">no building available</span>
                            )}
                          </div>
                        );
                      })}
                      {selectedChainData.stepStatuses.some((s, i) => {
                        const step = selectedChainData.chain.steps[i];
                        return !s.hasProduction && getTotalBuildingCount(step) > 0;
                      }) && (
                        <div className="text-[9px] text-amber-400 mt-1">
                          💡 Some steps have buildings but aren&apos;t producing — check if buildings are enabled and have required inputs
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </>
          ) : (
            /* Empty state */
            <div className="game-card rounded-xl bg-[#111827] p-6 border border-[#1e293b] text-center">
              <Package className="w-8 h-8 mx-auto text-gray-700 mb-2" />
              <p className="text-xs text-gray-500">Select a chain to view details</p>
              <p className="text-[10px] text-gray-600 mt-1">Click any chain card to see the full production flow, building requirements, and dependency map</p>
            </div>
          )}

          {/* Quick Stats - Always visible */}
          <div className="game-card rounded-xl bg-[#111827] p-4 border border-[#1e293b]">
            <div className="text-[10px] text-gray-500 font-medium mb-2">
              <BarChart3 className="w-3 h-3 inline mr-1" />
              Category Overview
            </div>
            <div className="space-y-2.5">
              {(Object.keys(CHAIN_CATEGORY_META) as ProductionChainCategory[]).map(cat => {
                const meta = CHAIN_CATEGORY_META[cat];
                const stats = categoryStats[cat];
                const pct = stats.total > 0 ? (stats.producing / stats.total) * 100 : 0;

                return (
                  <div key={cat}>
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-gray-400">{meta.icon} {meta.label}</span>
                      <span className="text-gray-500 font-mono">{stats.producing}/{stats.total} ({pct.toFixed(0)}%)</span>
                    </div>
                    <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden mt-0.5">
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: meta.color }} />
                    </div>
                    {/* Mini breakdown */}
                    <div className="flex gap-2 mt-0.5 text-[8px]">
                      {stats.producing > 0 && <span className="text-green-500">{stats.producing} active</span>}
                      {stats.partial > 0 && <span className="text-amber-500">{stats.partial} partial</span>}
                      {stats.notStarted > 0 && <span className="text-gray-600">{stats.notStarted} idle</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Resource Coverage Stats */}
          <div className="game-card rounded-xl bg-[#111827] p-4 border border-[#1e293b]">
            <div className="text-[10px] text-gray-500 font-medium mb-2">
              <Layers className="w-3 h-3 inline mr-1" />
              Chain Coverage
            </div>
            <div className="grid grid-cols-2 gap-2 text-[9px]">
              <div className="bg-gray-800/50 rounded-lg p-2">
                <div className="text-gray-400">Total Chains</div>
                <div className="text-lg font-bold text-gray-200 font-mono">{PRODUCTION_CHAINS.length}</div>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-2">
                <div className="text-gray-400">Active</div>
                <div className="text-lg font-bold text-green-400 font-mono">{globalStats.producing}</div>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-2">
                <div className="text-gray-400">Partial</div>
                <div className="text-lg font-bold text-amber-400 font-mono">{globalStats.partial}</div>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-2">
                <div className="text-gray-400">Idle</div>
                <div className="text-lg font-bold text-gray-500 font-mono">{globalStats.notStarted}</div>
              </div>
            </div>
            <div className="mt-2 text-[8px] text-gray-600">
              {PRODUCTION_CHAINS.reduce((sum, c) => sum + c.steps.length, 0)} total resource steps across all chains
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
