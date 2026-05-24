'use client';

import { useMemo, useState, useRef, useEffect } from 'react';
import { useGameStore, formatNumber, getBuildingCost, isBuildingUnlocked } from '@/lib/game/store';
import { BUILDING_DEFS, RESOURCE_META, RESEARCH_TREE, PRODUCTION_CHAINS, RANK_THRESHOLDS } from '@/lib/game/data';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Factory, Users, Zap, TrendingUp, AlertTriangle, FlaskConical,
  ChevronRight, Activity, Pickaxe, Cog, Shield, Clock, Bell,
  ArrowUpRight, ArrowDownRight, Minus, Timer, Power, Sparkles,
  Database, Wrench, Globe, ArrowRight, Trophy, Package,
  Hammer, CheckCircle2, XCircle, Flame
} from 'lucide-react';
import { BuildingType, ResourceType } from '@/lib/game/types';
import { motion, AnimatePresence } from 'framer-motion';

export function DashboardPanel() {
  const store = useGameStore();

  // Computed values
  const totalBuildings = store.buildings.length;
  const activeBuildings = store.buildings.filter(b => b.active).length;
  const totalWorkers = store.workers.length;
  const assignedWorkers = store.workers.filter(w => w.assignedTo).length;
  const workerEfficiency = totalWorkers > 0
    ? store.workers.reduce((s, w) => s + w.efficiency, 0) / totalWorkers
    : 0;

  const powerPercent = store.powerGrid.totalConsumption > 0
    ? Math.min(100, (store.powerGrid.totalProduction / store.powerGrid.totalConsumption) * 100)
    : store.powerGrid.totalProduction > 0 ? 100 : 0;

  const powerSurplus = store.powerGrid.totalProduction - store.powerGrid.totalConsumption;

  // Top resources by value
  const topResources = useMemo(() => {
    const rawResources: ResourceType[] = ['iron', 'copper', 'coal', 'oil', 'sand', 'lithium', 'water', 'rareEarth'];
    return rawResources
      .map(r => ({
        resource: r,
        amount: store.resources[r],
        capacity: store.resourceCapacity[r],
        meta: RESOURCE_META[r],
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 6);
  }, [store.resources, store.resourceCapacity]);

  // Production rates - compute per resource
  const productionRates = useMemo(() => {
    const rates: Record<string, number> = {};
    store.buildings.forEach(b => {
      if (!b.active) return;
      const def = BUILDING_DEFS[b.type];
      if (!def || !def.outputs) return;
      def.outputs.forEach(o => {
        rates[o.resource] = (rates[o.resource] || 0) + o.amount * b.level * b.efficiency * store.powerGrid.efficiency;
      });
    });
    return rates;
  }, [store.buildings, store.powerGrid.efficiency]);

  // Production rate summary items
  const topProductionRates = useMemo(() => {
    return (Object.entries(productionRates) as [ResourceType, number][])
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [productionRates]);

  // Category counts
  const extractorCount = store.buildings.filter(b => BUILDING_DEFS[b.type]?.category === 'extractor').length;
  const factoryCount = store.buildings.filter(b => BUILDING_DEFS[b.type]?.category === 'factory').length;
  const powerCount = store.buildings.filter(b => BUILDING_DEFS[b.type]?.category === 'power').length;

  // Active research info
  const activeResearchInfo = useMemo(() => {
    if (!store.activeResearch) return null;
    const node = RESEARCH_TREE.find(r => r.id === store.activeResearch);
    if (!node) return null;
    return {
      name: node.name,
      emoji: node.emoji,
      progress: Math.min(100, (store.researchProgress / node.timeRequired) * 100),
      timeRequired: node.timeRequired,
    };
  }, [store.activeResearch, store.researchProgress]);

  // Recent notifications (last 5)
  const recentNotifications = store.notifications.slice(0, 5);

  // Activity Feed - last 8 game events from notifications
  const activityFeed = useMemo(() => {
    return store.notifications.slice(0, 8).map(n => ({
      ...n,
      icon: n.type === 'success' ? <CheckCircle2 className="w-3 h-3" /> :
            n.type === 'warning' ? <AlertTriangle className="w-3 h-3" /> :
            n.type === 'error' ? <XCircle className="w-3 h-3" /> :
            <Bell className="w-3 h-3" />,
    }));
  }, [store.notifications]);

  // RP accumulation rate
  const rpPerTick = useMemo(() => {
    return 0.1 * (1 + store.buildings.filter(b => b.type === 'aiLab' && b.active).length * 0.5);
  }, [store.buildings]);

  // Quick build options
  const quickBuildTypes: BuildingType[] = ['miningDrill', 'waterExtractor', 'coalGenerator', 'smelter'];

  const handleBuild = (type: BuildingType) => {
    store.buildBuilding(type);
  };

  return (
    <div className="space-y-4">
      {/* RANK BAR */}
      <RankBar store={store} />

      {/* GET STARTED CARD - only show when no buildings */}
      {totalBuildings === 0 && (
        <div className="game-card-empty rounded-xl p-6 text-center">
          <div className="text-5xl mb-3">🏗️</div>
          <h3 className="text-lg font-bold text-cyan-400 neon-glow-cyan mb-2">Build Your First Factory!</h3>
          <p className="text-sm text-gray-400 mb-4 max-w-md mx-auto">
            Start by building a Coal Generator to power your empire, then add Mining Drills to extract resources.
          </p>
          <Button
            className="glow-button-cyan bg-cyan-600 hover:bg-cyan-500 text-white font-semibold px-6 py-2.5"
            onClick={() => store.setActiveTab('resources')}
          >
            <Pickaxe className="w-4 h-4 mr-2" />
            Go to Extraction
          </Button>
        </div>
      )}

      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-cyan-400 neon-glow-cyan tracking-wide">Factory Overview</h2>
          <p className="text-xs text-gray-500 mt-0.5">Command center for your industrial empire</p>
        </div>
        <div className="flex items-center gap-2">
          {store.activeEvents.length > 0 && (
            <Badge variant="outline" className="border-orange-500/50 text-orange-400 bg-orange-900/20 text-xs neon-pulse">
              <AlertTriangle className="w-3 h-3 mr-1" />
              {store.activeEvents.length} Event{store.activeEvents.length > 1 ? 's' : ''}
            </Badge>
          )}
          {store.powerGrid.overload && (
            <Badge variant="outline" className="border-red-500/50 text-red-400 bg-red-900/20 text-xs neon-pulse">
              <Zap className="w-3 h-3 mr-1" />
              POWER OVERLOAD
            </Badge>
          )}
        </div>
      </div>

      {/* TOP STATS ROW - Enhanced with gradients and trend indicators */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard
          icon={<Factory className="w-5 h-5" />}
          label="Buildings"
          value={totalBuildings.toString()}
          subtext={totalBuildings === 0 ? 'None built yet' : `${activeBuildings} active of ${totalBuildings} built`}
          color="cyan"
          gradient="from-cyan-900/25 to-cyan-800/5"
          trend={store.stats.factoriesBuilt > 0 ? 'up' : 'stable'}
          trendValue={`${store.stats.factoriesBuilt} built`}
        />
        <StatCard
          icon={<Users className="w-5 h-5" />}
          label="Workers"
          value={totalWorkers.toString()}
          subtext={totalWorkers === 0 ? 'No workers yet' : `${assignedWorkers} assigned of ${totalWorkers} hired`}
          color="green"
          gradient="from-green-900/25 to-green-800/5"
          trend={workerEfficiency >= 1 ? 'up' : workerEfficiency > 0 ? 'stable' : 'down'}
          trendValue={totalWorkers === 0 ? 'Hire in Workers tab' : `Eff: ${(workerEfficiency * 100).toFixed(0)}%`}
        />
        <StatCard
          icon={<Activity className="w-5 h-5" />}
          label="Efficiency"
          value={store.powerGrid.totalProduction === 0 && store.powerGrid.totalConsumption === 0 ? 'N/A' : `${(store.powerGrid.efficiency * 100).toFixed(0)}%`}
          subtext={store.powerGrid.totalProduction === 0 && store.powerGrid.totalConsumption === 0 ? 'No power grid' : store.powerGrid.overload ? 'Overloaded!' : 'Optimal'}
          color={store.powerGrid.totalProduction === 0 && store.powerGrid.totalConsumption === 0 ? 'orange' : store.powerGrid.efficiency >= 0.8 ? 'green' : store.powerGrid.efficiency >= 0.5 ? 'orange' : 'red'}
          gradient="from-yellow-900/25 to-yellow-800/5"
          trend={store.powerGrid.efficiency >= 0.8 ? 'up' : store.powerGrid.efficiency >= 0.5 ? 'stable' : 'down'}
          trendValue={store.powerGrid.totalProduction === 0 && store.powerGrid.totalConsumption === 0 ? 'Build a generator' : `${powerSurplus >= 0 ? '+' : ''}${formatNumber(powerSurplus)} MW`}
        />
        <StatCard
          icon={<FlaskConical className="w-5 h-5" />}
          label="Research"
          value={store.completedResearch.length.toString()}
          subtext={`${formatNumber(store.researchPoints)} RP`}
          color="purple"
          gradient="from-purple-900/25 to-purple-800/5"
          trend={rpPerTick > 0.1 ? 'up' : 'stable'}
          trendValue={`+${rpPerTick.toFixed(1)} RP/t`}
        />
      </div>

      {/* MAIN GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* LEFT COLUMN */}
        <div className="lg:col-span-2 space-y-4">
          {/* POWER GRID STATUS */}
          <div className="game-card rounded-xl bg-[#111827] p-4 border border-[#1e293b]">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-yellow-400" />
                <h3 className="text-sm font-semibold text-yellow-400">Power Grid</h3>
              </div>
              <Badge
                variant="outline"
                className={`text-[10px] ${
                  store.powerGrid.totalProduction === 0 && store.powerGrid.totalConsumption === 0
                    ? 'border-gray-500/50 text-gray-400 bg-gray-900/20'
                    : powerSurplus >= 0
                      ? 'border-green-500/50 text-green-400 bg-green-900/20'
                      : 'border-red-500/50 text-red-400 bg-red-900/20'
                }`}
              >
                {store.powerGrid.totalProduction === 0 && store.powerGrid.totalConsumption === 0 ? (
                  <>NO GRID</>
                ) : powerSurplus >= 0 ? (
                  <><ArrowUpRight className="w-2.5 h-2.5 mr-0.5" /> SURPLUS</>
                ) : (
                  <><ArrowDownRight className="w-2.5 h-2.5 mr-0.5" /> DEFICIT</>
                )}
              </Badge>
            </div>

            {/* No Power Grid State */}
            {store.powerGrid.totalProduction === 0 && store.powerGrid.totalConsumption === 0 ? (
              <div className="text-center py-4">
                <div className="text-3xl mb-2">⚡</div>
                <p className="text-sm text-gray-400 font-medium mb-1">NO POWER GRID</p>
                <p className="text-xs text-gray-500 mb-3">Build a Coal Generator or Solar Panel to start generating power</p>
                <Button
                  className="glow-button-cyan bg-yellow-600 hover:bg-yellow-500 text-white text-xs font-semibold px-4 py-1.5"
                  onClick={() => store.setActiveTab('power')}
                >
                  <Zap className="w-3 h-3 mr-1" />
                  Go to Power
                </Button>
              </div>
            ) : (
            <>
            {/* Power Gauge */}
            <div className="relative mb-3">
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="text-gray-400">
                  <span className="text-green-400 font-mono font-bold">{formatNumber(store.powerGrid.totalProduction)}</span> MW production
                </span>
                <span className="text-gray-400">
                  <span className="text-orange-400 font-mono font-bold">{formatNumber(store.powerGrid.totalConsumption)}</span> MW demand
                </span>
              </div>
              <div className="h-4 bg-gray-800 rounded-full overflow-hidden relative">
                <div
                  className="absolute inset-y-0 left-0 bg-orange-600/30 rounded-full transition-all duration-700"
                  style={{ width: `${Math.min(100, (store.powerGrid.totalConsumption / Math.max(1, store.powerGrid.totalProduction)) * 100)}%` }}
                />
                <div
                  className={`absolute inset-y-0 left-0 rounded-full transition-all duration-700 ${
                    powerPercent >= 80 ? 'bg-gradient-to-r from-green-600 to-green-400' :
                    powerPercent >= 50 ? 'bg-gradient-to-r from-yellow-600 to-yellow-400' :
                    'bg-gradient-to-r from-red-600 to-red-400'
                  }`}
                  style={{ width: `${Math.min(100, powerPercent)}%` }}
                >
                  <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent" />
                </div>
                <div className="absolute inset-0 overflow-hidden rounded-full">
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-[conveyorFlow_2s_linear_infinite]" />
                </div>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-[10px] text-gray-500">
                  {powerSurplus >= 0 ? `+${formatNumber(powerSurplus)}` : formatNumber(powerSurplus)} MW net
                </span>
                <span className="text-[10px] text-gray-500">
                  {powerCount} power plant{powerCount !== 1 ? 's' : ''}
                </span>
              </div>
            </div>

            {/* Power breakdown mini-stats */}
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-[#0a0e17] rounded-lg p-2 text-center">
                <div className="text-[10px] text-gray-500 mb-0.5">Efficiency</div>
                <div className={`text-sm font-bold font-mono ${
                  store.powerGrid.efficiency >= 0.8 ? 'text-green-400' :
                  store.powerGrid.efficiency >= 0.5 ? 'text-yellow-400' : 'text-red-400'
                }`}>
                  {(store.powerGrid.efficiency * 100).toFixed(1)}%
                </div>
              </div>
              <div className="bg-[#0a0e17] rounded-lg p-2 text-center">
                <div className="text-[10px] text-gray-500 mb-0.5">Peak</div>
                <div className="text-sm font-bold font-mono text-cyan-400">
                  {(store.stats.peakEfficiency * 100).toFixed(1)}%
                </div>
              </div>
              <div className="bg-[#0a0e17] rounded-lg p-2 text-center">
                <div className="text-[10px] text-gray-500 mb-0.5">Load</div>
                <div className={`text-sm font-bold font-mono ${
                  powerPercent >= 80 ? 'text-green-400' :
                  powerPercent >= 50 ? 'text-yellow-400' : 'text-red-400'
                }`}>
                  {powerPercent.toFixed(0)}%
                </div>
              </div>
            </div>
            </>
            )}
          </div>

          {/* TOP RESOURCES */}
          <div className="game-card rounded-xl bg-[#111827] p-4 border border-[#1e293b]">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-cyan-400" />
                <h3 className="text-sm font-semibold text-cyan-400">Resource Storage</h3>
              </div>
              <span className="text-[10px] text-gray-500">{topResources.length} raw materials</span>
            </div>
            <div className="space-y-2">
              {topResources.map(({ resource, amount, capacity, meta }) => {
                const pct = capacity > 0 ? (amount / capacity) * 100 : 0;
                const isLow = pct > 80;
                return (
                  <div key={resource} className="group">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm">{meta.emoji}</span>
                        <span className="text-gray-300 font-medium">{meta.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`font-mono ${isLow ? 'text-orange-400' : 'text-gray-300'}`}>
                          {formatNumber(amount)}
                        </span>
                        <span className="text-gray-600">/</span>
                        <span className="text-gray-500 font-mono text-[10px]">{formatNumber(capacity)}</span>
                        {productionRates[resource] > 0 && (
                          <span className="text-green-400/70 text-[10px]">
                            +{formatNumber(productionRates[resource])}/t
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full resource-bar-premium resource-bar-animated transition-all duration-500 ${
                          pct > 90 ? 'bg-red-500' :
                          pct > 70 ? 'bg-orange-500' :
                          'bg-gradient-to-r from-cyan-600 to-cyan-400'
                        }`}
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* PRODUCTION RATE SUMMARY */}
          <div className="game-card rounded-xl bg-[#111827] p-4 border border-[#1e293b]">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-green-400" />
                <h3 className="text-sm font-semibold text-green-400">Production Rates</h3>
              </div>
              <span className="text-[10px] text-gray-500">per tick</span>
            </div>
            {topProductionRates.length === 0 ? (
              <div className="text-center py-6">
                <Cog className="w-8 h-8 text-gray-700 mx-auto mb-2" />
                <p className="text-xs text-gray-500">No active production</p>
                <p className="text-[10px] text-gray-600 mt-1">Build extractors and factories to start producing</p>
              </div>
            ) : (
              <div className="space-y-2">
                {topProductionRates.map(([resource, rate]) => {
                  const meta = RESOURCE_META[resource];
                  return (
                    <div key={resource} className="flex items-center justify-between bg-[#0a0e17] rounded-lg px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{meta.emoji}</span>
                        <span className="text-xs text-gray-300">{meta.name}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <ArrowUpRight className="w-3 h-3 text-green-400" />
                        <span className="text-xs text-green-400 font-mono font-bold">+{formatNumber(rate)}</span>
                        <span className="text-[10px] text-gray-500">/t</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* PRODUCTION CHAINS VISUALIZATION - with bottleneck indicator */}
          <ProductionChainSection store={store} productionRates={productionRates} />

          {/* ACTIVITY FEED */}
          <div className="game-card rounded-xl bg-[#111827] p-4 border border-[#1e293b]">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-cyan-400" />
                <h3 className="text-sm font-semibold text-cyan-400">Activity Feed</h3>
              </div>
              <span className="text-[10px] text-gray-500">Live events</span>
            </div>
            {activityFeed.length === 0 ? (
              <div className="text-center py-4">
                <Activity className="w-6 h-6 text-gray-700 mx-auto mb-1.5" />
                <p className="text-xs text-gray-500">No recent activity</p>
                <p className="text-[10px] text-gray-600 mt-0.5">Start building to see events here</p>
              </div>
            ) : (
              <div className="space-y-1 max-h-64 overflow-y-auto game-scrollbar">
                <AnimatePresence initial={false}>
                  {activityFeed.map((entry, i) => (
                    <motion.div
                      key={entry.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      transition={{ duration: 0.25, delay: i * 0.03 }}
                      className={`flex items-start gap-2 py-1.5 px-2 rounded text-[11px] ${
                        entry.type === 'success' ? 'text-green-400 bg-green-900/5' :
                        entry.type === 'warning' ? 'text-yellow-400 bg-yellow-900/5' :
                        entry.type === 'error' ? 'text-red-400 bg-red-900/5' :
                        'text-gray-400 bg-gray-900/5'
                      }`}
                    >
                      <div className="flex-shrink-0 mt-0.5">
                        {entry.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="truncate block">{entry.message}</span>
                      </div>
                      <span className="text-[9px] text-gray-600 flex-shrink-0 mt-0.5">
                        t:{entry.gameTick}
                      </span>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div className="space-y-4">
          {/* BUILDING BREAKDOWN */}
          <div className="game-card rounded-xl bg-[#111827] p-4 border border-[#1e293b]">
            <div className="flex items-center gap-2 mb-3">
              <Factory className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-semibold text-cyan-400">Building Breakdown</h3>
            </div>
            <div className="space-y-2">
              <BuildingCategoryRow
                icon={<Pickaxe className="w-3.5 h-3.5" />}
                label="Extractors"
                count={extractorCount}
                total={totalBuildings}
                color="text-amber-400"
                bgColor="bg-amber-500"
              />
              <BuildingCategoryRow
                icon={<Cog className="w-3.5 h-3.5" />}
                label="Factories"
                count={factoryCount}
                total={totalBuildings}
                color="text-orange-400"
                bgColor="bg-orange-500"
              />
              <BuildingCategoryRow
                icon={<Zap className="w-3.5 h-3.5" />}
                label="Power Plants"
                count={powerCount}
                total={totalBuildings}
                color="text-yellow-400"
                bgColor="bg-yellow-500"
              />
            </div>
          </div>

          {/* ACTIVE RESEARCH */}
          <div className="game-card rounded-xl bg-[#111827] p-4 border border-[#1e293b]">
            <div className="flex items-center gap-2 mb-3">
              <FlaskConical className="w-4 h-4 text-purple-400" />
              <h3 className="text-sm font-semibold text-purple-400">Active Research</h3>
            </div>
            {activeResearchInfo ? (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">{activeResearchInfo.emoji}</span>
                  <div>
                    <p className="text-xs text-gray-200 font-medium">{activeResearchInfo.name}</p>
                    <p className="text-[10px] text-gray-500">
                      <Timer className="w-2.5 h-2.5 inline mr-0.5" />
                      {formatNumber(store.researchProgress)} / {formatNumber(activeResearchInfo.timeRequired)} ticks
                    </p>
                  </div>
                </div>
                <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-purple-600 to-purple-400 rounded-full transition-all duration-300"
                    style={{ width: `${activeResearchInfo.progress}%` }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent" />
                  </div>
                </div>
                <div className="text-right mt-1">
                  <span className="text-[10px] text-purple-400 font-mono">{activeResearchInfo.progress.toFixed(1)}%</span>
                </div>
              </div>
            ) : (
              <div className="text-center py-4">
                <FlaskConical className="w-6 h-6 text-gray-700 mx-auto mb-1.5" />
                <p className="text-xs text-gray-500">No active research</p>
                <p className="text-[10px] text-gray-600 mt-0.5">Visit Research tab to start</p>
              </div>
            )}
          </div>

          {/* ACTIVE EVENTS TICKER */}
          <div className="game-card rounded-xl bg-[#111827] p-4 border border-[#1e293b]">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-4 h-4 text-orange-400" />
              <h3 className="text-sm font-semibold text-orange-400">Active Events</h3>
            </div>
            {store.activeEvents.length === 0 ? (
              <div className="text-center py-4">
                <Shield className="w-6 h-6 text-gray-700 mx-auto mb-1.5" />
                <p className="text-xs text-gray-500">No active events</p>
                <p className="text-[10px] text-gray-600 mt-0.5">Events occur periodically</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto game-scrollbar">
                {store.activeEvents.map(event => (
                  <div key={event.id} className="bg-[#0a0e17] rounded-lg p-2.5 border border-orange-900/30">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm">{event.emoji}</span>
                      <span className="text-xs text-orange-300 font-medium">{event.name}</span>
                    </div>
                    <p className="text-[10px] text-gray-400 mb-1.5 line-clamp-2">{event.description}</p>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5 text-gray-500" />
                        <span className="text-[10px] text-gray-500">{event.remaining} ticks left</span>
                      </div>
                      <div className="h-1 w-16 bg-gray-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-orange-500 rounded-full"
                          style={{ width: `${(event.remaining / event.duration) * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* RECENT NOTIFICATIONS */}
          <div className="game-card rounded-xl bg-[#111827] p-4 border border-[#1e293b]">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-gray-400" />
                <h3 className="text-sm font-semibold text-gray-400">Notifications</h3>
              </div>
              {store.notifications.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 text-[10px] text-gray-500 hover:text-gray-300 px-1"
                  onClick={store.clearNotifications}
                >
                  Clear
                </Button>
              )}
            </div>
            {recentNotifications.length === 0 ? (
              <div className="text-center py-3">
                <p className="text-xs text-gray-600">No notifications</p>
              </div>
            ) : (
              <div className="space-y-1 max-h-36 overflow-y-auto game-scrollbar">
                {recentNotifications.map(n => (
                  <div
                    key={n.id}
                    className={`text-[11px] py-1.5 px-2 rounded ${
                      n.type === 'success' ? 'text-green-400 bg-green-900/10' :
                      n.type === 'warning' ? 'text-yellow-400 bg-yellow-900/10' :
                      n.type === 'error' ? 'text-red-400 bg-red-900/10' :
                      'text-gray-400 bg-gray-900/10'
                    }`}
                  >
                    {n.message}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* QUICK ACTIONS */}
          <div className="game-card rounded-xl bg-[#111827] p-4 border border-[#1e293b]">
            <div className="flex items-center gap-2 mb-3">
              <Wrench className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-semibold text-cyan-400">Quick Build</h3>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {quickBuildTypes.map(type => {
                const def = BUILDING_DEFS[type];
                if (!def) return null;
                const count = store.buildings.filter(b => b.type === type).length;
                const cost = getBuildingCost(type, count);
                const canAfford = store.money >= cost;
                const unlocked = isBuildingUnlocked(type, store.completedResearch, store.prestigeState);
                return (
                  <Button
                    key={type}
                    variant="outline"
                    size="sm"
                    className={`h-auto py-2 px-2 flex flex-col items-center gap-1 text-[10px] ${
                      !unlocked
                        ? 'border-gray-800 text-gray-600 opacity-50'
                        : canAfford
                          ? 'border-cyan-800/50 text-cyan-400 hover:bg-cyan-900/20 hover:border-cyan-500/50'
                          : 'border-gray-800 text-gray-500'
                    }`}
                    onClick={() => handleBuild(type)}
                    disabled={!canAfford || !unlocked}
                  >
                    <span className="text-base">{def.emoji}</span>
                    <span className="font-medium">{def.name}</span>
                    <span className="text-[9px] text-gray-500">${formatNumber(cost)}</span>
                  </Button>
                );
              })}
            </div>
          </div>

          {/* PRESTIGE / GLOBAL STATS */}
          <div className="game-card rounded-xl bg-[#111827] p-4 border border-[#1e293b]">
            <div className="flex items-center gap-2 mb-3">
              <Globe className="w-4 h-4 text-fuchsia-400" />
              <h3 className="text-sm font-semibold text-fuchsia-400">Empire Stats</h3>
            </div>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-500">Total Earned</span>
                <span className="text-green-400 font-mono">${formatNumber(store.totalMoneyEarned)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Peak Efficiency</span>
                <span className="text-cyan-400 font-mono">{(store.stats.peakEfficiency * 100).toFixed(1)}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Buildings Built</span>
                <span className="text-gray-300 font-mono">{store.stats.factoriesBuilt}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Research Done</span>
                <span className="text-purple-400 font-mono">{store.stats.researchCompleted}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Contracts Done</span>
                <span className="text-rose-400 font-mono">{store.stats.contractsCompleted}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Play Time</span>
                <span className="text-gray-300 font-mono">{formatNumber(store.stats.playTime)} ticks</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Sub-components ---

function StatCard({
  icon,
  label,
  value,
  subtext,
  color,
  gradient,
  trend,
  trendValue,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtext: string;
  color: 'cyan' | 'green' | 'orange' | 'red' | 'purple';
  gradient?: string;
  trend?: 'up' | 'down' | 'stable';
  trendValue?: string;
}) {
  const colorMap = {
    cyan: { icon: 'text-cyan-400', value: 'text-cyan-400', border: 'border-cyan-900/30', bg: 'bg-cyan-900/10' },
    green: { icon: 'text-green-400', value: 'text-green-400', border: 'border-green-900/30', bg: 'bg-green-900/10' },
    orange: { icon: 'text-orange-400', value: 'text-orange-400', border: 'border-orange-900/30', bg: 'bg-orange-900/10' },
    red: { icon: 'text-red-400', value: 'text-red-400', border: 'border-red-900/30', bg: 'bg-red-900/10' },
    purple: { icon: 'text-purple-400', value: 'text-purple-400', border: 'border-purple-900/30', bg: 'bg-purple-900/10' },
  };
  const c = colorMap[color];

  const trendIcon = trend === 'up' ? (
    <ArrowUpRight className="w-3 h-3 text-green-400" />
  ) : trend === 'down' ? (
    <ArrowDownRight className="w-3 h-3 text-red-400" />
  ) : (
    <Minus className="w-3 h-3 text-gray-500" />
  );

  return (
    <div className={`stat-card-gradient game-card rounded-xl bg-[#111827] p-4 sm:p-5 border ${c.border} relative overflow-hidden group`}> 
      {/* Subtle gradient background */}
      {gradient && (
        <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-60`} />
      )}
      <div className="relative z-10">
        <div className="flex items-center gap-2.5 mb-2">
          <div className={`w-9 h-9 rounded-xl ${c.bg} flex items-center justify-center shadow-lg`} style={{ boxShadow: `0 0 12px ${c.value === 'text-cyan-400' ? 'rgba(0,255,242,0.15)' : c.value === 'text-green-400' ? 'rgba(57,255,20,0.15)' : c.value === 'text-orange-400' ? 'rgba(255,166,0,0.15)' : c.value === 'text-red-400' ? 'rgba(255,0,64,0.15)' : 'rgba(191,0,255,0.15)'}` }}>
            <div className={c.icon}>{icon}</div>
          </div>
          <div className="flex-1">
            <span className="text-[11px] text-gray-500 uppercase tracking-wider block">{label}</span>
            {/* Trend indicator */}
            {trend && (
              <div className="flex items-center gap-0.5 mt-0.5">
                {trendIcon}
                {trendValue && (
                  <span className="text-[9px] text-gray-500 font-mono">{trendValue}</span>
                )}
              </div>
            )}
          </div>
        </div>
        <div className={`text-xl sm:text-2xl font-bold font-mono ${c.value}`}>{value}</div>
        <div className="mt-1">
          <div className="text-[11px] text-gray-400">{subtext}</div>
        </div>
      </div>
      {/* Hover glow border effect */}
      <div className="absolute inset-0 rounded-xl border border-transparent group-hover:border-cyan-500/20 group-hover:shadow-[0_0_15px_rgba(0,255,242,0.08)] transition-all duration-300 pointer-events-none" />
    </div>
  );
}

// --- Production Chain Section ---

function ProductionChainSection({
  store,
  productionRates,
}: {
  store: ReturnType<typeof useGameStore>;
  productionRates: Record<string, number>;
}) {
  const [selectedChain, setSelectedChain] = useState(0);
  const chain = PRODUCTION_CHAINS[selectedChain];

  // Bottleneck detection for this chain
  const chainBottlenecks = useMemo(() => {
    return chain.steps.filter(step => {
      const rate = productionRates[step as ResourceType] ?? 0;
      return rate <= 0;
    });
  }, [chain, productionRates]);

  const hasBottleneck = chainBottlenecks.length > 0;
  const allProducing = chain.steps.every(step => (productionRates[step as ResourceType] ?? 0) > 0);

  return (
    <div
      className="game-card rounded-xl bg-[#111827] p-4 border border-[#1e293b]"
      style={{ borderColor: `${chain.color}33` }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <ArrowRight className="w-4 h-4" style={{ color: chain.color }} />
          <h3 className="text-sm font-semibold" style={{ color: chain.color }}>Production Chains</h3>
        </div>
        <div className="flex items-center gap-2">
          {/* Chain status badge */}
          {allProducing && chain.steps.length > 0 ? (
            <Badge
              variant="outline"
              className="text-[9px] border-green-500/50 text-green-400 bg-green-900/20"
            >
              <CheckCircle2 className="w-2.5 h-2.5 mr-0.5" />
              CHAIN ACTIVE
            </Badge>
          ) : hasBottleneck ? (
            <Badge
              variant="outline"
              className="text-[9px] border-red-500/50 text-red-400 bg-red-900/20"
            >
              <AlertTriangle className="w-2.5 h-2.5 mr-0.5" />
              BOTTLENECK
            </Badge>
          ) : null}
          <Badge
            variant="outline"
            className="text-[10px]"
            style={{ borderColor: `${chain.color}66`, color: chain.color, backgroundColor: `${chain.color}15` }}
          >
            {chain.name}
          </Badge>
        </div>
      </div>

      {/* Chain Selector Pills */}
      <div className="flex gap-1.5 overflow-x-auto pb-2 mb-3 game-scrollbar">
        {PRODUCTION_CHAINS.map((c, i) => {
          const cBottlenecks = c.steps.filter(step => (productionRates[step as ResourceType] ?? 0) <= 0);
          const cAllProducing = c.steps.every(step => (productionRates[step as ResourceType] ?? 0) > 0);
          return (
            <button
              key={c.name}
              onClick={() => setSelectedChain(i)}
              className={`flex-shrink-0 px-2.5 py-1 rounded-full text-[10px] font-medium transition-all duration-200 border relative ${
                i === selectedChain
                  ? 'text-white border-transparent shadow-lg'
                  : 'text-gray-400 border-gray-700/50 bg-gray-800/50 hover:border-gray-600 hover:text-gray-300'
              }`}
              style={i === selectedChain ? {
                backgroundColor: `${c.color}33`,
                borderColor: `${c.color}88`,
                boxShadow: `0 0 12px ${c.color}33`,
              } : undefined}
            >
              {c.name}
              {!cAllProducing && c.steps.length > 0 && i !== selectedChain && (
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full" />
              )}
            </button>
          );
        })}
      </div>

      {/* Chain Steps Flow */}
      <AnimatePresence mode="wait">
        <motion.div
          key={chain.name}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25 }}
          className="flex items-center gap-0 overflow-x-auto pb-2 game-scrollbar"
        >
          {chain.steps.map((step, i) => {
            const meta = RESOURCE_META[step as ResourceType];
            if (!meta) return null;
            const stock = store.resources[step as ResourceType] ?? 0;
            const rate = productionRates[step as ResourceType] ?? 0;
            const capacity = store.resourceCapacity[step as ResourceType] ?? 0;
            const fillPct = capacity > 0 ? Math.min(100, (stock / capacity) * 100) : 0;
            const isBottleneck = rate <= 0;

            return (
              <div key={step} className="flex items-center flex-shrink-0">
                {/* Step Node */}
                <div
                  className={`relative rounded-lg p-2.5 min-w-[90px] border transition-all duration-300 ${
                    isBottleneck ? 'border-red-500/60 bg-red-900/10' : ''
                  }`}
                  style={!isBottleneck ? {
                    borderColor: `${chain.color}44`,
                    backgroundColor: `${chain.color}0a`,
                  } : undefined}
                >
                  {/* Bottleneck badge */}
                  {isBottleneck && (
                    <div className="absolute -top-2 left-1/2 -translate-x-1/2 z-20">
                      <span className="text-[7px] font-bold text-red-400 bg-red-900/80 px-1.5 py-0.5 rounded-full border border-red-500/50 whitespace-nowrap">
                        BOTTLENECK
                      </span>
                    </div>
                  )}

                  {/* Resource emoji + name */}
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-sm">{meta.emoji}</span>
                    <span className="text-[11px] font-medium" style={{ color: isBottleneck ? '#ef4444' : meta.color }}>{meta.name}</span>
                  </div>

                  {/* Stock amount */}
                  <div className="text-xs font-mono text-gray-300 mb-0.5">
                    {formatNumber(stock)}
                    {capacity > 0 && (
                      <span className="text-[9px] text-gray-500">/{formatNumber(capacity)}</span>
                    )}
                  </div>

                  {/* Mini capacity bar */}
                  {capacity > 0 && (
                    <div className="h-1 bg-gray-800 rounded-full overflow-hidden mb-1">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${fillPct}%`,
                          backgroundColor: isBottleneck ? '#ef4444' : fillPct > 80 ? '#ef4444' : fillPct > 50 ? '#f59e0b' : chain.color,
                        }}
                      />
                    </div>
                  )}

                  {/* Net production rate */}
                  <div className="flex items-center gap-0.5">
                    {rate > 0 ? (
                      <>
                        <ArrowUpRight className="w-2.5 h-2.5 text-green-400" />
                        <span className="text-[10px] text-green-400 font-mono font-bold">+{formatNumber(rate)}</span>
                      </>
                    ) : rate < 0 ? (
                      <>
                        <ArrowDownRight className="w-2.5 h-2.5 text-red-400" />
                        <span className="text-[10px] text-red-400 font-mono font-bold">{formatNumber(rate)}</span>
                      </>
                    ) : (
                      <>
                        <Minus className="w-2.5 h-2.5 text-red-400" />
                        <span className="text-[10px] text-red-400 font-mono font-bold">0</span>
                      </>
                    )}
                    <span className="text-[8px] text-gray-600">/t</span>
                  </div>

                  {/* Tier badge */}
                  <div
                    className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white"
                    style={{ backgroundColor: isBottleneck ? '#ef4444' : `${chain.color}99` }}
                  >
                    {meta.tier}
                  </div>
                </div>

                {/* Animated Arrow Connector */}
                {i < chain.steps.length - 1 && (
                  <div className="flex-shrink-0 w-8 flex items-center justify-center relative">
                    <div
                      className="absolute h-[2px] w-full rounded-full"
                      style={{ backgroundColor: isBottleneck ? '#ef444433' : `${chain.color}33` }}
                    />
                    {/* Animated flow particle */}
                    {!isBottleneck && (
                      <motion.div
                        className="absolute h-[2px] w-3 rounded-full"
                        style={{ backgroundColor: chain.color }}
                        animate={{ x: ['-100%', '100%'] }}
                        transition={{
                          duration: 1.2,
                          repeat: Infinity,
                          ease: 'linear',
                          delay: i * 0.2,
                        }}
                      />
                    )}
                    <ChevronRight
                      className="w-3.5 h-3.5 relative z-10"
                      style={{ color: isBottleneck ? '#ef4444' : chain.color }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function BuildingCategoryRow({
  icon,
  label,
  count,
  total,
  color,
  bgColor,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  total: number;
  color: string;
  bgColor: string;
}) {
  const pct = total > 0 ? (count / total) * 100 : 0;

  return (
    <div className="flex items-center gap-3">
      <div className={`${color} w-5 flex-shrink-0`}>{icon}</div>
      <div className="flex-1">
        <div className="flex items-center justify-between mb-0.5">
          <span className="text-xs text-gray-300">{label}</span>
          <span className="text-xs text-gray-400 font-mono">{count}</span>
        </div>
        <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
          <div
            className={`h-full ${bgColor} rounded-full transition-all duration-500`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}

// --- Rank Bar Component ---
function RankBar({ store }: { store: ReturnType<typeof useGameStore> }) {
  const rank = store.getCurrentRank();

  return (
    <div
      className="game-card rounded-xl bg-[#111827] p-4 border border-[#1e293b] relative overflow-hidden"
      style={{ borderColor: `${rank.color}30` }}
    >
      {/* Background glow */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{ background: `radial-gradient(ellipse at 20% 50%, ${rank.color}, transparent 70%)` }}
      />

      <div className="relative z-10 flex items-center gap-4">
        {/* Rank emoji */}
        <div
          className="w-14 h-14 rounded-xl flex items-center justify-center text-2xl border"
          style={{
            borderColor: `${rank.color}44`,
            backgroundColor: `${rank.color}15`,
            boxShadow: `0 0 20px ${rank.color}20`,
          }}
        >
          {rank.emoji}
        </div>

        {/* Rank info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-base font-bold tracking-wide" style={{ color: rank.color }}>
              {rank.name}
            </h3>
            <span className="text-[10px] text-gray-500 font-mono">
              Score: {formatNumber(rank.score)}
            </span>
          </div>

          {/* Progress bar to next rank */}
          {rank.nextRankScore !== null ? (
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-gray-500">
                  Next: {RANK_THRESHOLDS.find(r => r.minScore === rank.nextRankScore)?.emoji} {RANK_THRESHOLDS.find(r => r.minScore === rank.nextRankScore)?.name}
                </span>
                <span className="text-[10px] font-mono" style={{ color: rank.color }}>
                  {formatNumber(rank.nextRankScore - rank.score)} pts to go
                </span>
              </div>
              <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${rank.progress * 100}%`,
                    backgroundColor: rank.color,
                    boxShadow: `0 0 8px ${rank.color}66`,
                  }}
                >
                  <div className="absolute inset-0 bg-gradient-to-b from-white/15 to-transparent" />
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold" style={{ color: rank.color }}>
                MAX RANK ACHIEVED
              </span>
              <Sparkles className="w-3.5 h-3.5" style={{ color: rank.color }} />
            </div>
          )}
        </div>

        {/* Quick storage upgrade button */}
        <div className="hidden sm:flex flex-col items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-[10px] border-fuchsia-800/50 text-fuchsia-400 hover:bg-fuchsia-900/20"
            onClick={() => store.setActiveTab('resources')}
          >
            <Package className="w-3 h-3 mr-1" />
            Upgrade Storage
          </Button>
        </div>
      </div>
    </div>
  );
}
