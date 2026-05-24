'use client';

import { useMemo } from 'react';
import { useGameStore, formatNumber, getBuildingCost, isBuildingUnlocked } from '@/lib/game/store';
import { BUILDING_DEFS, RESOURCE_META, RESEARCH_TREE } from '@/lib/game/data';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Factory, Users, Zap, TrendingUp, AlertTriangle, FlaskConical,
  ChevronRight, Activity, Pickaxe, Cog, Shield, Clock, Bell,
  ArrowUpRight, ArrowDownRight, Minus, Timer, Power, Sparkles,
  Database, Wrench, Globe
} from 'lucide-react';
import { BuildingType, ResourceType } from '@/lib/game/types';

export function DashboardPanel() {
  const store = useGameStore();

  // Computed values
  const totalBuildings = store.buildings.length;
  const activeBuildings = store.buildings.filter(b => b.active).length;
  const totalWorkers = store.workers.length;
  const assignedWorkers = store.workers.filter(w => w.assignedTo).length;

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

  // Quick build options
  const quickBuildTypes: BuildingType[] = ['miningDrill', 'waterExtractor', 'coalGenerator', 'smelter'];

  const handleBuild = (type: BuildingType) => {
    store.buildBuilding(type);
  };

  return (
    <div className="space-y-4">
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

      {/* TOP STATS ROW */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          icon={<Factory className="w-4 h-4" />}
          label="Buildings"
          value={totalBuildings.toString()}
          subtext={`${activeBuildings} active`}
          color="cyan"
        />
        <StatCard
          icon={<Users className="w-4 h-4" />}
          label="Workers"
          value={totalWorkers.toString()}
          subtext={`${assignedWorkers} assigned`}
          color="green"
        />
        <StatCard
          icon={<Activity className="w-4 h-4" />}
          label="Efficiency"
          value={`${(store.powerGrid.efficiency * 100).toFixed(0)}%`}
          subtext={store.powerGrid.overload ? 'Overloaded!' : 'Optimal'}
          color={store.powerGrid.efficiency >= 0.8 ? 'green' : store.powerGrid.efficiency >= 0.5 ? 'orange' : 'red'}
        />
        <StatCard
          icon={<FlaskConical className="w-4 h-4" />}
          label="Research"
          value={store.completedResearch.length.toString()}
          subtext={`${formatNumber(store.researchPoints)} RP`}
          color="purple"
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
                {/* Demand bar (background) */}
                <div
                  className="absolute inset-y-0 left-0 bg-orange-600/30 rounded-full transition-all duration-700"
                  style={{ width: `${Math.min(100, (store.powerGrid.totalConsumption / Math.max(1, store.powerGrid.totalProduction)) * 100)}%` }}
                />
                {/* Production bar (foreground) */}
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
                {/* Shimmer effect */}
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
                        className={`h-full rounded-full resource-bar-animated transition-all duration-500 ${
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
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtext: string;
  color: 'cyan' | 'green' | 'orange' | 'red' | 'purple';
}) {
  const colorMap = {
    cyan: { icon: 'text-cyan-400', value: 'text-cyan-400', border: 'border-cyan-900/30', bg: 'bg-cyan-900/10' },
    green: { icon: 'text-green-400', value: 'text-green-400', border: 'border-green-900/30', bg: 'bg-green-900/10' },
    orange: { icon: 'text-orange-400', value: 'text-orange-400', border: 'border-orange-900/30', bg: 'bg-orange-900/10' },
    red: { icon: 'text-red-400', value: 'text-red-400', border: 'border-red-900/30', bg: 'bg-red-900/10' },
    purple: { icon: 'text-purple-400', value: 'text-purple-400', border: 'border-purple-900/30', bg: 'bg-purple-900/10' },
  };
  const c = colorMap[color];

  return (
    <div className={`game-card rounded-xl bg-[#111827] p-3 border ${c.border}`}>
      <div className="flex items-center gap-2 mb-1.5">
        <div className={`w-7 h-7 rounded-lg ${c.bg} flex items-center justify-center`}>
          <div className={c.icon}>{icon}</div>
        </div>
        <span className="text-[10px] text-gray-500 uppercase tracking-wider">{label}</span>
      </div>
      <div className={`text-lg font-bold font-mono ${c.value}`}>{value}</div>
      <div className="text-[10px] text-gray-500 mt-0.5">{subtext}</div>
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
