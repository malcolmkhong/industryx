'use client';

import { useMemo, useState, useRef, useEffect } from 'react';
import { useGameStore, formatNumber, getBuildingCost, isBuildingUnlocked } from '@/lib/game/store';
import { BUILDING_DEFS, RESOURCE_META, RESEARCH_TREE, RANK_THRESHOLDS, WEATHER_DEFS } from '@/lib/game/configCache';
import { PanelStatCard } from '@/components/game/shared/PanelStatCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Factory, Users, Zap, TrendingUp, AlertTriangle, FlaskConical,
  Activity, Pickaxe, Cog, Shield, Clock, Bell,
  ArrowUpRight, ArrowDownRight, Minus, Timer, Power, Sparkles,
  Database, Wrench, Globe, ArrowRight, Trophy, Package,
  Hammer, CheckCircle2, XCircle, Flame, CloudSun, Pin, X as XIcon,
  Gauge
} from 'lucide-react';
import { BuildingType, ResourceType, WeatherType } from '@/lib/game/types';
import { motion, AnimatePresence } from 'framer-motion';
import { ProductionChainPanel } from '@/components/game/ProductionChainPanel';
import { GameIcon } from '@/components/game/shared/GameIcon';

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

  // Production rates — use store's computed rates which include all bonuses
  // (mega project, prestige, research, worker, event, weather, etc.)
  const productionRates = store.productionSnapshot.production;

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
      icon: node.icon,
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
      icon: n.type === 'success' ? 'lucide:check-circle-2' :
            n.type === 'warning' ? 'lucide:alert-triangle' :
            n.type === 'error' ? 'lucide:x-circle' :
            'lucide:bell',
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

  // Check if there's an unclaimed daily reward
  const hasUnclaimedDailyReward = useMemo(() => {
    const ls = store.loginStreak;
    if (!ls.lastLoginDate) return false;
    const currentDay = ((ls.currentStreak - 1) % 7) + 1;
    return ls.weeklyRewards.some(r => r.day === currentDay && !r.claimed);
  }, [store.loginStreak]);

  return (
    <div className="space-y-4">
      {/* DAILY REWARD AVAILABLE BANNER */}
      {hasUnclaimedDailyReward && (
        <motion.button
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, type: 'spring' }}
          onClick={() => store.setActiveTab('dailyRewards')}
          className="w-full bg-gradient-to-r from-pink-900/25 via-purple-900/20 to-fuchsia-900/25 border border-pink-500/30 rounded-xl p-3 flex items-center justify-between group hover:border-pink-400/50 cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <GameIcon icon="gi:present" size={24} className="animate-bounce" />
            <div className="text-left">
              <p className="text-sm font-bold text-pink-300 group-hover:text-pink-200 transition-colors">Daily Reward Available!</p>
              <p className="text-[10px] text-gray-400">Click to claim your daily login bonus</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-pink-400/70 uppercase tracking-wider font-semibold">Day {((store.loginStreak.currentStreak - 1) % 7) + 1}</span>
            <ArrowRight className="w-4 h-4 text-pink-400/50 group-hover:text-pink-300 group-hover:translate-x-0.5 transition-all" />
          </div>
        </motion.button>
      )}

      {/* RANK BAR */}
      <RankBar store={store} />

      {/* TRACKED QUEST INDICATOR */}
      {store.trackedQuest && (() => {
        const trackedQuestData = store.quests.find(q => q.id === store.trackedQuest);
        if (!trackedQuestData || trackedQuestData.claimed) return null;
        const tProgress = trackedQuestData.steps.length > 0 
          ? trackedQuestData.steps.reduce((sum, s) => sum + Math.min(1, s.current / Math.max(1, s.target)), 0) / trackedQuestData.steps.length 
          : 0;
        const currentStep = trackedQuestData.steps.find(s => !s.completed);
        return (
          <motion.div
            className="bg-gradient-to-r from-cyan-900/15 to-teal-900/10 border border-cyan-500/25 rounded-xl p-3"
          >
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5">
                <Pin className="w-3 h-3 text-cyan-400" />
                <span className="text-[10px] text-cyan-400 uppercase tracking-wider font-semibold">Tracked Quest</span>
              </div>
              <button
                onClick={() => store.setTrackedQuest(null)}
                className="text-gray-500 hover:text-gray-300 p-0.5 rounded hover:bg-gray-800/50 transition-colors"
              >
                <XIcon className="w-3 h-3" />
              </button>
            </div>
            <div className="flex items-center gap-2.5">
              <GameIcon icon={trackedQuestData.icon} size={20} className="inline-flex" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-200 font-medium truncate">{trackedQuestData.name}</p>
                {currentStep && (
                  <p className="text-[10px] text-gray-500 truncate">{currentStep.description}: {Math.min(currentStep.current, currentStep.target)}/{currentStep.target}</p>
                )}
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-[10px] text-cyan-400 font-mono">{Math.round(tProgress * 100)}%</div>
                <div className="w-16 h-1 bg-gray-800 rounded-full overflow-hidden mt-0.5">
                  <div className="h-full bg-cyan-400 rounded-full" style={{ width: `${tProgress * 100}%` }} />
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-1.5 text-[9px]">
              {trackedQuestData.reward.money > 0 && <span className="text-green-400"><GameIcon icon="gi:money-stack" size={14} className="inline" /> ${formatNumber(trackedQuestData.reward.money)}</span>}
              {trackedQuestData.reward.researchPoints && trackedQuestData.reward.researchPoints > 0 && <span className="text-purple-400"><GameIcon icon="gi:magnifying-glass" size={14} className="inline" /> {trackedQuestData.reward.researchPoints}RP</span>}
              {trackedQuestData.reward.corporationPoints && trackedQuestData.reward.corporationPoints > 0 && <span className="text-fuchsia-400"><GameIcon icon="gi:briefcase" size={14} className="inline" /> {trackedQuestData.reward.corporationPoints}CP</span>}
            </div>
          </motion.div>
        );
      })()}

      {/* GET STARTED CARD - only show when no buildings */}
      {totalBuildings === 0 && (
        <div className="relative rounded-xl p-8 text-center border border-cyan-500/20 bg-gradient-to-br from-cyan-900/15 via-[#111827] to-teal-900/10 overflow-hidden">
          {/* Radial gradient overlay for visual depth */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,255,242,0.06)_0%,transparent_70%)]" />
          {/* Decorative background elements */}
          <div className="absolute inset-0 opacity-5">
            <div className="absolute top-4 left-8"><GameIcon icon="gi:mining" size={48} /></div>
            <div className="absolute bottom-4 right-8"><GameIcon icon="gi:factory" size={48} /></div>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"><GameIcon icon="gi:castle" size={64} /></div>
          </div>
          <div className="relative z-10">
            <motion.div
            >
              <div className="mb-4"><GameIcon icon="gi:castle" size={48} /></div>
            </motion.div>
            <h3 className="text-xl font-bold text-cyan-400 neon-glow-cyan mb-2">Build Your First Factory!</h3>
            <p className="text-sm text-gray-400 mb-6 max-w-md mx-auto">
              Start by building a Coal Generator to power your empire, then add Mining Drills to extract resources.
            </p>
            <div className="flex items-center justify-center gap-3 flex-wrap">
              <Button
                className="glow-button-cyan bg-yellow-600 hover:bg-yellow-500 text-white font-semibold px-5 py-2.5 text-xs"
                onClick={() => store.setActiveTab('power')}
              >
                <Zap className="w-4 h-4 mr-1.5" />
                Build Power First
              </Button>
              <Button
                className="glow-button-cyan bg-cyan-600 hover:bg-cyan-500 text-white font-semibold px-5 py-2.5 text-xs"
                onClick={() => store.setActiveTab('resources')}
              >
                <Pickaxe className="w-4 h-4 mr-1.5" />
                Go to Extraction
              </Button>
            </div>
            <div className="mt-6 flex items-center justify-center gap-6 text-[10px] text-gray-500">
              <div className="flex items-center gap-1.5">
                <span className="text-lg font-bold text-amber-400">1</span>
                <span>Build Power</span>
              </div>
              <div className="text-gray-700">→</div>
              <div className="flex items-center gap-1.5">
                <span className="text-lg font-bold text-amber-400">2</span>
                <span>Build Drills</span>
              </div>
              <div className="text-gray-700">→</div>
              <div className="flex items-center gap-1.5">
                <span className="text-lg font-bold text-amber-400">3</span>
                <span>Build Factories</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div>
            <h2 className="text-xl font-bold text-cyan-400 neon-glow-cyan tracking-wide flex items-center gap-2">Factory Overview
              {activeBuildings > 0 && (
                <motion.span
                  className="inline-flex items-center gap-1"
                >
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
                  </span>
                  <span className="text-[9px] text-green-400/70 font-normal tracking-normal">RUNNING</span>
                </motion.span>
              )}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">Command center for your industrial empire</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {store.activeEvents.length > 0 && (
            <Badge variant="outline" className="border-orange-500/50 text-orange-400 bg-orange-900/20 text-xs neon-pulse">
              <AlertTriangle className="w-3 h-3 mr-1" />
              {store.activeEvents.length} Event{store.activeEvents.length > 1 ? 's' : ''}
            </Badge>
          )}
          {store.powerGrid.overload && (
            <Badge variant="outline" className="border-red-500/50 text-red-400 bg-red-900/20 text-xs" style={{ animation: 'breathe-glow 2s ease-in-out infinite' }}>
              <Zap className="w-3 h-3 mr-1" />
              POWER OVERLOAD
            </Badge>
          )}
        </div>
      </div>

      {/* TOP STATS ROW */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map(i => (
          <motion.div
            key={i}
          >
            {i === 0 && <PanelStatCard
              icon={<Factory className="w-4 h-4" />}
              label="Buildings"
              value={totalBuildings.toString()}
              subtext={totalBuildings === 0 ? 'None built yet' : `${activeBuildings} active of ${totalBuildings} built`}
              color="cyan"
              trend={store.stats.factoriesBuilt > 0 ? 'up' : 'neutral'}
            />}
            {i === 1 && <PanelStatCard
              icon={<Users className="w-4 h-4" />}
              label="Workers"
              value={totalWorkers.toString()}
              subtext={totalWorkers === 0 ? 'No workers yet' : `${assignedWorkers} assigned of ${totalWorkers} hired`}
              color="green"
              trend={workerEfficiency >= 1 ? 'up' : workerEfficiency > 0 ? 'neutral' : 'down'}
            />}
            {i === 2 && <PanelStatCard
              icon={<Activity className="w-4 h-4" />}
              label="Efficiency"
              value={store.powerGrid.totalProduction === 0 && store.powerGrid.totalConsumption === 0 ? 'N/A' : `${(store.powerGrid.efficiency * 100).toFixed(0)}%`}
              subtext={store.powerGrid.totalProduction === 0 && store.powerGrid.totalConsumption === 0 ? 'No power grid' : store.powerGrid.overload ? 'Overloaded!' : 'Optimal'}
              color={store.powerGrid.totalProduction === 0 && store.powerGrid.totalConsumption === 0 ? 'orange' : store.powerGrid.efficiency >= 0.8 ? 'green' : store.powerGrid.efficiency >= 0.5 ? 'orange' : 'red'}
              trend={store.powerGrid.efficiency >= 0.8 ? 'up' : store.powerGrid.efficiency >= 0.5 ? 'neutral' : 'down'}
            />}
            {i === 3 && <PanelStatCard
              icon={<FlaskConical className="w-4 h-4" />}
              label="Research"
              value={store.completedResearch.length.toString()}
              subtext={`${formatNumber(store.researchPoints)} RP`}
              color="purple"
              trend={rpPerTick > 0.1 ? 'up' : 'neutral'}
            />}
          </motion.div>
        ))}
      </div>

      {/* MAIN GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* LEFT COLUMN */}
        <div className="lg:col-span-2 space-y-4">
          {/* POWER GRID STATUS */}
          <div className="game-card rounded-xl bg-card p-4 border border-border">
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
                <div className="mb-2"><GameIcon icon="gi:lightning-frequency" size={28} /></div>
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
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <PanelStatCard
                icon={<Gauge className="w-4 h-4" />}
                label="Efficiency"
                value={`${(store.powerGrid.efficiency * 100).toFixed(1)}%`}
                subtext="Current"
                color={store.powerGrid.efficiency >= 0.8 ? 'green' : store.powerGrid.efficiency >= 0.5 ? 'yellow' : 'red'}
                trend={store.powerGrid.efficiency >= 0.8 ? 'up' : store.powerGrid.efficiency >= 0.5 ? 'neutral' : 'down'}
              />
              <PanelStatCard
                icon={<TrendingUp className="w-4 h-4" />}
                label="Peak"
                value={`${(store.stats.peakEfficiency * 100).toFixed(1)}%`}
                subtext="All-time best"
                color="cyan"
              />
              <PanelStatCard
                icon={<Zap className="w-4 h-4" />}
                label="Load"
                value={`${powerPercent.toFixed(0)}%`}
                subtext="Utilization"
                color={powerPercent >= 80 ? 'green' : powerPercent >= 50 ? 'yellow' : 'red'}
              />
            </div>
            </>
            )}
          </div>

          {/* TOP RESOURCES */}
          <div className="game-card rounded-xl bg-card p-4 border border-border">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-cyan-400" />
                <h3 className="text-sm font-semibold text-cyan-400">Resource Storage</h3>
              </div>
              <span className="text-[10px] text-gray-500">{topResources.length} raw materials</span>
            </div>
            {/* Resource Overview Summary */}
            {(() => {
              const totalStored = topResources.reduce((sum, r) => sum + r.amount, 0);
              const totalCapacity = topResources.reduce((sum, r) => sum + r.capacity, 0);
              const overallPct = totalCapacity > 0 ? (totalStored / totalCapacity) * 100 : 0;
              return (
                <div className="mb-3 bg-[#0a0e17] rounded-lg p-3">
                  <div className="flex items-center justify-between text-[10px] mb-1.5">
                    <div className="flex items-center gap-3">
                      <span className="text-gray-400">Total Stored: <span className="text-cyan-300 font-mono font-bold">{formatNumber(totalStored)}</span></span>
                      <span className="text-gray-600">|</span>
                      <span className="text-gray-400">Capacity: <span className={`font-mono font-bold ${overallPct > 80 ? 'text-orange-400' : overallPct > 50 ? 'text-yellow-400' : 'text-green-400'}`}>{overallPct.toFixed(1)}%</span></span>
                    </div>
                    <span className="text-gray-500 font-mono">{formatNumber(totalStored)}/{formatNumber(totalCapacity)}</span>
                  </div>
                  <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        overallPct > 90 ? 'bg-red-500' :
                        overallPct > 70 ? 'bg-orange-500' :
                        overallPct > 50 ? 'bg-yellow-500' :
                        'bg-gradient-to-r from-cyan-600 to-cyan-400'
                      }`}
                      style={{ width: `${Math.min(100, overallPct)}%` }}
                    />
                  </div>
                </div>
              );
            })()}
            <div className="space-y-2">
              {topResources.map(({ resource, amount, capacity, meta }) => {
                const pct = capacity > 0 ? (amount / capacity) * 100 : 0;
                const isLow = pct > 80;
                return (
                  <div key={resource} className="group">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <div className="flex items-center gap-1.5">
                        <GameIcon icon={meta.icon} size={14} className="inline-flex" />
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
                            +{formatNumber(productionRates[resource])}/s
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
          <div className="game-card rounded-xl bg-card p-4 border border-border">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-green-400" />
                <h3 className="text-sm font-semibold text-green-400">Production Rates</h3>
              </div>
              <span className="text-[10px] text-gray-500">per second</span>
            </div>
            {topProductionRates.length === 0 ? (
              <div className="text-center py-6">
                <Cog className="w-8 h-8 text-gray-700 mx-auto mb-2" />
                <p className="text-xs text-gray-500">No active production</p>
                <p className="text-[10px] text-gray-600 mt-1">Build extractors and factories to start producing</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {topProductionRates.map(([resource, rate]) => {
                  const meta = RESOURCE_META[resource];
                  return (
                    <PanelStatCard
                      key={resource}
                      icon={<GameIcon icon={meta.icon} size={14} />}
                      label={meta.name}
                      value={`+${formatNumber(rate)}`}
                      subtext="per second"
                      color="green"
                      trend="up"
                    />
                  );
                })}
              </div>
            )}
          </div>

          {/* PRODUCTION CHAINS VISUALIZATION - SVG flow diagram with building details */}
          <ProductionChainPanel productionRates={productionRates} />

          {/* ACTIVITY FEED */}
          <div className="game-card rounded-xl bg-card p-4 border border-border">
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
                      className={`flex items-start gap-2 py-1.5 px-2 rounded text-[11px] border-l-2 ${
                        entry.type === 'success' ? 'text-green-400 bg-green-900/5 border-l-green-500' :
                        entry.type === 'warning' ? 'text-yellow-400 bg-yellow-900/5 border-l-yellow-500' :
                        entry.type === 'error' ? 'text-red-400 bg-red-900/5 border-l-red-500' :
                        'text-gray-400 bg-gray-900/5 border-l-gray-600'
                      }`}
                    >
                      <div className="flex-shrink-0 mt-0.5 text-current">
                        {entry.type === 'success' && <CheckCircle2 className="w-3.5 h-3.5" />}
                        {entry.type === 'warning' && <AlertTriangle className="w-3.5 h-3.5" />}
                        {entry.type === 'error' && <XCircle className="w-3.5 h-3.5" />}
                        {entry.type === 'info' && <Bell className="w-3.5 h-3.5" />}
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
          <div className="game-card rounded-xl bg-card p-4 border border-border">
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

          {/* WEATHER INFO CARD */}
          <WeatherInfoCard store={store} />

          {/* ACTIVE RESEARCH */}
          <div className="game-card rounded-xl bg-card p-4 border border-border">
            <div className="flex items-center gap-2 mb-3">
              <FlaskConical className="w-4 h-4 text-purple-400" />
              <h3 className="text-sm font-semibold text-purple-400">Active Research</h3>
            </div>
            {activeResearchInfo ? (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <GameIcon icon={activeResearchInfo.icon} size={20} className="inline-flex" />
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
          <div className="game-card rounded-xl bg-card p-4 border border-border">
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
                  <div key={event.id} className="bg-[#0a0e17] rounded-lg p-3 border border-orange-900/30">
                    <div className="flex items-center gap-2 mb-1">
                      <GameIcon icon={event.icon} size={14} className="inline-flex" />
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
          <div className="game-card rounded-xl bg-card p-4 border border-border">
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
          <div className="game-card rounded-xl bg-card p-4 border border-border">
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
                    <GameIcon icon={def.icon} size={16} />
                    <span className="font-medium">{def.name}</span>
                    <span className="text-[9px] text-gray-500">${formatNumber(cost)}</span>
                  </Button>
                );
              })}
            </div>
          </div>

          {/* PRESTIGE / GLOBAL STATS */}
          <div className="game-card rounded-xl bg-card p-4 border border-border">
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
      className="game-card rounded-xl bg-card p-4 border border-border relative overflow-hidden"
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
          <GameIcon icon={rank.icon} size={24} />
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
                  Next: <GameIcon icon={RANK_THRESHOLDS.find(r => r.minScore === rank.nextRankScore)?.icon} size={14} className="inline-flex" /> {RANK_THRESHOLDS.find(r => r.minScore === rank.nextRankScore)?.name}
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

// --- Weather Info Card Component ---
function WeatherInfoCard({ store }: { store: ReturnType<typeof useGameStore> }) {
  const currentWeather = store.weather.current as WeatherType;
  const weatherDef = WEATHER_DEFS[currentWeather];
  if (!weatherDef) return null;

  const ticksUntilChange = Math.max(0, store.weather.nextChange - store.gameTick);
  const isEffectActive = currentWeather !== 'clear' && store.weather.remaining > 0;

  // Gradient backgrounds based on weather type
  const weatherGradients: Record<string, string> = {
    clear: 'from-slate-800/30 to-slate-900/20',
    sunny: 'from-yellow-900/25 to-orange-900/15',
    rainy: 'from-blue-900/25 to-slate-900/20',
    stormy: 'from-purple-900/30 to-slate-900/25',
    foggy: 'from-gray-700/25 to-gray-900/20',
    snowy: 'from-blue-200/10 to-indigo-900/15',
  };

  // Border colors based on weather
  const weatherBorders: Record<string, string> = {
    clear: 'border-slate-700/40',
    sunny: 'border-yellow-600/40',
    rainy: 'border-blue-600/40',
    stormy: 'border-purple-600/40',
    foggy: 'border-gray-500/40',
    snowy: 'border-blue-300/30',
  };

  const prodEffect = weatherDef.productionMultiplier - 1;
  const solarEffect = weatherDef.solarMultiplier - 1;
  const windEffect = weatherDef.windMultiplier - 1;

  // Animated weather particles
  const renderWeatherParticles = () => {
    if (currentWeather === 'clear') return null;
    
    const particles = [];
    const count = currentWeather === 'stormy' ? 12 : currentWeather === 'rainy' ? 8 : 6;
    
    for (let i = 0; i < count; i++) {
      const left = `${(i / count) * 100}%`;
      const delay = `${i * 0.15}s`;
      const duration = currentWeather === 'stormy' ? '0.6s' : currentWeather === 'rainy' ? '0.8s' : '1.5s';
      
      let particleClass = '';
      if (currentWeather === 'rainy' || currentWeather === 'stormy') {
        particleClass = 'weather-rain-drop';
      } else if (currentWeather === 'snowy') {
        particleClass = 'weather-snow-flake';
      } else if (currentWeather === 'sunny') {
        particleClass = 'weather-sun-ray';
      } else if (currentWeather === 'foggy') {
        particleClass = 'weather-fog-wisp';
      }
      
      particles.push(
        <div
          key={i}
          className={`absolute ${particleClass}`}
          style={{ 
            left, 
            animationDelay: delay, 
            animationDuration: duration,
            top: currentWeather === 'sunny' ? '0' : '0',
          }}
        />
      );
    }
    return particles;
  };

  return (
    <div className={`weather-card-${currentWeather} game-card rounded-xl bg-gradient-to-br ${weatherGradients[currentWeather] || ''} p-4 border ${weatherBorders[currentWeather] || 'border-border'} relative overflow-hidden`}>
      {/* Animated weather particles */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {renderWeatherParticles()}
      </div>

      <div className="relative z-10">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <CloudSun className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-semibold text-cyan-400">Weather</h3>
          </div>
          {isEffectActive && (
            <Badge variant="outline" className="text-[9px] border-orange-500/40 text-orange-400 bg-orange-900/20">
              ACTIVE
            </Badge>
          )}
        </div>

        {/* Current weather display */}
        <div className="flex items-center gap-3 mb-3">
          <div className="text-3xl"><GameIcon icon={weatherDef.icon} size={32} /></div>
          <div>
            <p className="text-sm font-bold text-gray-200">{weatherDef.name}</p>
            <p className="text-[10px] text-gray-400 line-clamp-2">{weatherDef.description}</p>
          </div>
        </div>

        {/* Multiplier effects */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="bg-[#0a0e17]/60 rounded-lg p-3 text-center">
            <div className="text-[9px] text-gray-500 mb-0.5">Production</div>
            <div className={`text-xs font-bold font-mono flex items-center justify-center gap-0.5 ${
              prodEffect > 0 ? 'text-green-400' : prodEffect < 0 ? 'text-red-400' : 'text-gray-400'
            }`}>
              {prodEffect > 0 ? <ArrowUpRight className="w-2.5 h-2.5" /> : prodEffect < 0 ? <ArrowDownRight className="w-2.5 h-2.5" /> : <Minus className="w-2.5 h-2.5" />}
              {prodEffect >= 0 ? '+' : ''}{(prodEffect * 100).toFixed(0)}%
            </div>
          </div>
          <div className="bg-[#0a0e17]/60 rounded-lg p-3 text-center">
            <div className="text-[9px] text-gray-500 mb-0.5">Solar</div>
            <div className={`text-xs font-bold font-mono flex items-center justify-center gap-0.5 ${
              solarEffect > 0 ? 'text-green-400' : solarEffect < 0 ? 'text-red-400' : 'text-gray-400'
            }`}>
              {solarEffect > 0 ? <ArrowUpRight className="w-2.5 h-2.5" /> : solarEffect < 0 ? <ArrowDownRight className="w-2.5 h-2.5" /> : <Minus className="w-2.5 h-2.5" />}
              {solarEffect >= 0 ? '+' : ''}{(solarEffect * 100).toFixed(0)}%
            </div>
          </div>
          <div className="bg-[#0a0e17]/60 rounded-lg p-3 text-center">
            <div className="text-[9px] text-gray-500 mb-0.5">Wind</div>
            <div className={`text-xs font-bold font-mono flex items-center justify-center gap-0.5 ${
              windEffect > 0 ? 'text-green-400' : windEffect < 0 ? 'text-red-400' : 'text-gray-400'
            }`}>
              {windEffect > 0 ? <ArrowUpRight className="w-2.5 h-2.5" /> : windEffect < 0 ? <ArrowDownRight className="w-2.5 h-2.5" /> : <Minus className="w-2.5 h-2.5" />}
              {windEffect >= 0 ? '+' : ''}{(windEffect * 100).toFixed(0)}%
            </div>
          </div>
        </div>

        {/* Time until next change */}
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-gray-500 flex items-center gap-1">
            <Clock className="w-2.5 h-2.5" />
            {isEffectActive ? 'Weather ends in' : 'Next change in'}
          </span>
          <span className="text-cyan-400 font-mono">
            {isEffectActive ? formatTicksToTime(store.weather.remaining) : formatTicksToTime(ticksUntilChange)}
          </span>
        </div>
      </div>
    </div>
  );
}

// Helper to format ticks to a readable time string
function formatTicksToTime(ticks: number): string {
  if (ticks <= 0) return 'Now';
  if (ticks < 60) return `${ticks} ticks`;
  const minutes = Math.floor(ticks / 60);
  const seconds = ticks % 60;
  if (minutes < 60) return `~${minutes}m ${seconds > 0 ? `${seconds}s` : ''}`;
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  return `~${hours}h ${remMinutes > 0 ? `${remMinutes}m` : ''}`;
}
