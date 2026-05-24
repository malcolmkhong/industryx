'use client';

import { useMemo, useState, useCallback, useEffect } from 'react';
import { useGameStore, formatNumber, getBuildingCost, isBuildingUnlocked } from '@/lib/game/store';
import { BUILDING_DEFS, RESOURCE_META } from '@/lib/game/data';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Pickaxe, ChevronUp, Power, PowerOff, Hammer, ArrowRight,
  Package, TrendingUp, Zap, Clock, Lock, Layers, Droplets,
  Mountain, Drill, Container, Warehouse, ArrowDownToLine,
  ArrowUpFromLine, RotateCcw
} from 'lucide-react';
import { BuildingType, ResourceType, ExtractorType } from '@/lib/game/types';

const EXTRACTOR_TYPES: ExtractorType[] = ['miningDrill', 'oilPump', 'waterExtractor', 'quarry'];

const RAW_RESOURCES: ResourceType[] = ['iron', 'copper', 'coal', 'oil', 'sand', 'lithium', 'water', 'rareEarth'];

export function ResourcePanel() {
  const store = useGameStore();

  // Track recently built/upgraded buildings for CSS animation classes
  const [recentlyBuilt, setRecentlyBuilt] = useState<Set<string>>(new Set());
  const [recentlyUpgraded, setRecentlyUpgraded] = useState<Set<string>>(new Set());

  // Production rates per resource
  const productionRates = useMemo(() => {
    const rates: Record<string, number> = {};
    store.buildings.forEach(b => {
      if (!b.active) return;
      const def = BUILDING_DEFS[b.type];
      if (!def || def.category !== 'extractor' || !def.outputs) return;
      def.outputs.forEach(o => {
        rates[o.resource] = (rates[o.resource] || 0) + o.amount * b.level * b.efficiency * store.powerGrid.efficiency;
      });
    });
    return rates;
  }, [store.buildings, store.powerGrid.efficiency]);

  // Extractor instances grouped by type
  const extractorsByType = useMemo(() => {
    const grouped: Record<string, typeof store.buildings> = {};
    EXTRACTOR_TYPES.forEach(type => {
      grouped[type] = store.buildings.filter(b => b.type === type);
    });
    return grouped;
  }, [store.buildings]);

  // Resource flow data
  const resourceFlow = useMemo(() => {
    return RAW_RESOURCES.map(r => {
      const rate = productionRates[r] || 0;
      const amount = store.resources[r];
      const capacity = store.resourceCapacity[r];
      const meta = RESOURCE_META[r];
      return { resource: r, rate, amount, capacity, meta };
    }).filter(r => r.rate > 0 || r.amount > 0);
  }, [productionRates, store.resources, store.resourceCapacity]);

  // Consumption rates (from factories)
  const consumptionRates = useMemo(() => {
    const rates: Record<string, number> = {};
    store.buildings.forEach(b => {
      if (!b.active) return;
      const def = BUILDING_DEFS[b.type];
      if (!def || !def.inputs) return;
      def.inputs.forEach(input => {
        rates[input.resource] = (rates[input.resource] || 0) + input.amount * b.level * b.efficiency * store.powerGrid.efficiency;
      });
    });
    return rates;
  }, [store.buildings, store.powerGrid.efficiency]);

  const handleBuild = useCallback((type: ExtractorType) => {
    const prevCount = store.buildings.filter(b => b.type === type).length;
    store.buildBuilding(type);
    // After building, find the newly added building and mark it for animation
    setTimeout(() => {
      const newBuildings = store.buildings.filter(b => b.type === type);
      if (newBuildings.length > prevCount) {
        const newBuilding = newBuildings[newBuildings.length - 1];
        if (newBuilding) {
          setRecentlyBuilt(prev => {
            const next = new Set(prev);
            next.add(newBuilding.id);
            return next;
          });
          setTimeout(() => {
            setRecentlyBuilt(prev => {
              const next = new Set(prev);
              next.delete(newBuilding.id);
              return next;
            });
          }, 1000);
        }
      }
    }, 50);
  }, [store]);

  const handleUpgrade = useCallback((id: string) => {
    store.upgradeBuilding(id);
    setRecentlyUpgraded(prev => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    setTimeout(() => {
      setRecentlyUpgraded(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 1000);
  }, [store]);

  const handleToggle = (id: string) => {
    store.toggleBuilding(id);
  };

  return (
    <div className="space-y-4">
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-amber-400 tracking-wide flex items-center gap-2">
            <Pickaxe className="w-5 h-5" />
            Resource Extraction
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">Mine, pump, and extract raw materials from the earth</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-amber-500/50 text-amber-400 bg-amber-900/20 text-xs">
            <Pickaxe className="w-3 h-3 mr-1" />
            {store.buildings.filter(b => BUILDING_DEFS[b.type]?.category === 'extractor').length} Extractors
          </Badge>
          <Badge variant="outline" className="border-cyan-500/50 text-cyan-400 bg-cyan-900/20 text-xs">
            <Zap className="w-3 h-3 mr-1" />
            {formatNumber(store.buildings.filter(b => BUILDING_DEFS[b.type]?.category === 'extractor' && b.active).reduce((sum, b) => sum + BUILDING_DEFS[b.type].basePowerConsumption * b.level, 0))} MW
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* LEFT: Extractor Buildings */}
        <div className="lg:col-span-2 space-y-4">
          {/* BUILD NEW EXTRACTOR */}
          <div className="game-card rounded-xl bg-[#111827] p-4 border border-[#1e293b]">
            <div className="flex items-center gap-2 mb-3">
              <Hammer className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-semibold text-amber-400">Build Extractor</h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {EXTRACTOR_TYPES.map(type => {
                const def = BUILDING_DEFS[type];
                if (!def) return null;
                const existingCount = extractorsByType[type].length;
                const cost = getBuildingCost(type, existingCount);
                const canAfford = store.money >= cost;
                const unlocked = isBuildingUnlocked(type, store.completedResearch, store.prestigeState);
                const activeCount = extractorsByType[type].filter(b => b.active).length;

                return (
                  <div
                    key={type}
                    className={`relative rounded-lg p-3 border transition-all duration-200 ${
                      !unlocked
                        ? 'bg-[#0a0e17] border-gray-800 opacity-60'
                        : canAfford
                          ? 'bg-[#0a0e17] border-amber-900/30 hover:border-amber-500/50 hover:shadow-[0_0_15px_rgba(255,166,0,0.1)]'
                          : 'bg-[#0a0e17] border-gray-800'
                    }`}
                  >
                    {!unlocked && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-lg z-10">
                        <Lock className="w-5 h-5 text-gray-600" />
                      </div>
                    )}
                    <div className="text-center">
                      <span className="text-2xl block mb-1">{def.emoji}</span>
                      <p className="text-xs text-gray-200 font-medium mb-0.5">{def.name}</p>
                      <p className="text-[9px] text-gray-500 mb-2 line-clamp-2 min-h-[2em]">{def.description}</p>

                      {/* Cost */}
                      <div className="flex items-center justify-center gap-1 mb-2">
                        <span className="text-[10px] text-gray-500">Cost:</span>
                        <span className={`text-xs font-mono font-bold ${canAfford ? 'text-green-400' : 'text-red-400'}`}>
                          ${formatNumber(cost)}
                        </span>
                      </div>

                      {/* Power consumption */}
                      <div className="flex items-center justify-center gap-1 mb-2">
                        <Zap className="w-2.5 h-2.5 text-yellow-500" />
                        <span className="text-[10px] text-gray-500">{def.basePowerConsumption} MW</span>
                      </div>

                      {/* Output preview */}
                      {def.outputs && (
                        <div className="flex flex-wrap items-center justify-center gap-1 mb-3">
                          {def.outputs.map((o, i) => (
                            <span key={i} className="text-[9px] text-gray-400 bg-gray-800 rounded px-1.5 py-0.5">
                              {RESOURCE_META[o.resource].emoji} {o.amount}/t
                            </span>
                          ))}
                        </div>
                      )}

                      <Button
                        variant="outline"
                        size="sm"
                        className={`w-full h-7 text-[10px] ${
                          !unlocked ? 'hidden' :
                          canAfford
                            ? 'border-amber-600/50 text-amber-400 hover:bg-amber-900/30 hover:border-amber-500'
                            : 'border-gray-700 text-gray-500 cursor-not-allowed'
                        }`}
                        onClick={() => handleBuild(type)}
                        disabled={!canAfford || !unlocked}
                      >
                        <Hammer className="w-3 h-3 mr-1" />
                        Build
                      </Button>

                      {/* Existing count */}
                      {existingCount > 0 && (
                        <div className="mt-1.5 text-center">
                          <span className="text-[9px] text-gray-500">
                            {activeCount}/{existingCount} active
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* EXISTING EXTRACTORS LIST */}
          <div className="game-card rounded-xl bg-[#111827] p-4 border border-[#1e293b]">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-semibold text-amber-400">Active Extractors</h3>
              </div>
              <span className="text-[10px] text-gray-500">
                {store.buildings.filter(b => BUILDING_DEFS[b.type]?.category === 'extractor').length} total
              </span>
            </div>

            {store.buildings.filter(b => BUILDING_DEFS[b.type]?.category === 'extractor').length === 0 ? (
              <div className="game-card-empty rounded-xl p-6 text-center">
                <div className="text-4xl mb-3">⛏️</div>
                <h3 className="text-base font-bold text-amber-400 mb-2">No Extractors Built</h3>
                <p className="text-sm text-gray-400 mb-1">Build your first Mining Drill to start extracting resources</p>
                <p className="text-xs text-gray-500 mt-2">Extractors gather raw materials like iron, copper, and coal from the earth. Start with a Mining Drill!</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[500px] overflow-y-auto game-scrollbar pr-1">
                {store.buildings
                  .filter(b => BUILDING_DEFS[b.type]?.category === 'extractor')
                  .map(building => {
                    const def = BUILDING_DEFS[building.type];
                    if (!def) return null;
                    const upgradeCost = getBuildingCost(building.type, building.level);
                    const canUpgrade = store.money >= upgradeCost;
                    const effectiveRate = def.outputs
                      ? def.outputs.map(o => ({
                          resource: o.resource,
                          rate: o.amount * building.level * building.efficiency * store.powerGrid.efficiency,
                          meta: RESOURCE_META[o.resource],
                        }))
                      : [];

                    return (
                      <div
                        key={building.id}
                        className={`rounded-lg bg-[#0a0e17] p-3 border transition-all duration-200 ${
                          recentlyBuilt.has(building.id) ? 'build-construct' : ''
                        } ${
                          recentlyUpgraded.has(building.id) ? 'upgrade-flash' : ''
                        } ${
                          building.active
                            ? 'border-amber-900/30'
                            : 'border-gray-800 opacity-60'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          {/* Emoji + toggle */}
                          <div className="flex flex-col items-center gap-1.5">
                            <button
                              onClick={() => handleToggle(building.id)}
                              className={`text-xl transition-transform duration-200 hover:scale-110 ${
                                building.active ? 'opacity-100' : 'grayscale opacity-50'
                              }`}
                              title={building.active ? 'Click to disable' : 'Click to enable'}
                            >
                              {def.emoji}
                            </button>
                            <button
                              onClick={() => handleToggle(building.id)}
                              className={`w-6 h-6 rounded-full flex items-center justify-center border transition-all ${
                                building.active
                                  ? 'border-green-500/50 bg-green-900/20 text-green-400'
                                  : 'border-gray-700 bg-gray-800 text-gray-500'
                              }`}
                            >
                              {building.active ? <Power className="w-3 h-3" /> : <PowerOff className="w-3 h-3" />}
                            </button>
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-200 font-medium">{def.name}</span>
                                <Badge variant="outline" className="text-[9px] border-amber-600/50 text-amber-400 px-1.5 py-0">
                                  Lv.{building.level}
                                </Badge>
                                {!building.active && (
                                  <Badge variant="outline" className="text-[9px] border-gray-600 text-gray-500 px-1.5 py-0">
                                    OFFLINE
                                  </Badge>
                                )}
                              </div>
                              <span className="text-[9px] text-gray-500">
                                ID: {building.id.slice(-4)}
                              </span>
                            </div>

                            {/* Production outputs */}
                            {effectiveRate.length > 0 && (
                              <div className="flex flex-wrap gap-2 mb-2">
                                {effectiveRate.map(({ resource, rate, meta }) => (
                                  <div key={resource} className="flex items-center gap-1 bg-gray-800/50 rounded px-2 py-0.5">
                                    <span className="text-xs">{meta.emoji}</span>
                                    <span className={`text-[10px] font-mono ${building.active ? 'text-green-400' : 'text-gray-500'}`}>
                                      +{formatNumber(rate)}
                                    </span>
                                    <span className="text-[9px] text-gray-500">/t</span>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Efficiency bar */}
                            <div className="flex items-center gap-2">
                              <span className="text-[9px] text-gray-500">Efficiency</span>
                              <div className="flex-1 h-1 bg-gray-800 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all duration-300 ${
                                    building.efficiency * store.powerGrid.efficiency >= 0.8
                                      ? 'bg-green-500'
                                      : building.efficiency * store.powerGrid.efficiency >= 0.5
                                        ? 'bg-yellow-500'
                                        : 'bg-red-500'
                                  }`}
                                  style={{ width: `${(building.efficiency * store.powerGrid.efficiency) * 100}%` }}
                                />
                              </div>
                              <span className="text-[9px] text-gray-400 font-mono">
                                {(building.efficiency * store.powerGrid.efficiency * 100).toFixed(0)}%
                              </span>
                            </div>
                          </div>

                          {/* Upgrade button */}
                          <div className="flex flex-col items-end gap-1.5">
                            <Button
                              variant="outline"
                              size="sm"
                              className={`h-7 text-[10px] ${
                                canUpgrade
                                  ? 'border-cyan-700/50 text-cyan-400 hover:bg-cyan-900/30 hover:border-cyan-500'
                                  : 'border-gray-700 text-gray-500'
                              }`}
                              onClick={() => handleUpgrade(building.id)}
                              disabled={!canUpgrade}
                            >
                              <ChevronUp className="w-3 h-3 mr-0.5" />
                              Upgrade
                            </Button>
                            <span className={`text-[9px] font-mono ${canUpgrade ? 'text-gray-400' : 'text-red-400'}`}>
                              ${formatNumber(upgradeCost)}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Resource Inventory & Flow */}
        <div className="space-y-4">
          {/* RAW RESOURCE INVENTORY */}
          <div className="game-card rounded-xl bg-[#111827] p-4 border border-[#1e293b]">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Warehouse className="w-4 h-4 text-cyan-400" />
                <h3 className="text-sm font-semibold text-cyan-400">Raw Materials</h3>
              </div>
              <span className="text-[10px] text-gray-500">Storage</span>
            </div>
            <div className="space-y-3">
              {RAW_RESOURCES.map(resource => {
                const amount = store.resources[resource];
                const capacity = store.resourceCapacity[resource];
                const meta = RESOURCE_META[resource];
                const pct = capacity > 0 ? (amount / capacity) * 100 : 0;
                const prodRate = productionRates[resource] || 0;
                const consRate = consumptionRates[resource] || 0;
                const netRate = prodRate - consRate;
                const isFull = pct >= 95;
                const isEmpty = amount === 0;

                return (
                  <div key={resource} className={`rounded-lg p-2.5 bg-[#0a0e17] border ${
                    isFull ? 'border-orange-900/40' : 'border-gray-800/50'
                  }`}>
                    {/* Header */}
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm">{meta.emoji}</span>
                        <span className="text-xs text-gray-200 font-medium">{meta.name}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        {netRate > 0 && (
                          <span className="text-[9px] text-green-400 font-mono">+{formatNumber(netRate)}/t</span>
                        )}
                        {netRate < 0 && (
                          <span className="text-[9px] text-red-400 font-mono">{formatNumber(netRate)}/t</span>
                        )}
                        {netRate === 0 && prodRate === 0 && (
                          <span className="text-[9px] text-gray-600 font-mono">0/t</span>
                        )}
                        {netRate === 0 && prodRate > 0 && (
                          <span className="text-[9px] text-yellow-400 font-mono">±0/t</span>
                        )}
                      </div>
                    </div>

                    {/* Amount display */}
                    <div className="flex items-baseline gap-1 mb-1.5">
                      <span className={`text-sm font-bold font-mono ${
                        isFull ? 'text-orange-400' : isEmpty ? 'text-gray-600' : 'text-gray-200'
                      }`}>
                        {formatNumber(amount)}
                      </span>
                      <span className="text-[10px] text-gray-600">/</span>
                      <span className="text-[10px] text-gray-500 font-mono">{formatNumber(capacity)}</span>
                      {isFull && (
                        <span className="text-[9px] text-orange-400 ml-1">FULL</span>
                      )}
                    </div>

                    {/* Capacity bar */}
                    <div className="h-2 bg-gray-800 rounded-full overflow-hidden relative">
                      <div
                        className={`h-full rounded-full resource-bar-animated transition-all duration-500 ${
                          pct > 90 ? 'bg-gradient-to-r from-red-600 to-red-400' :
                          pct > 70 ? 'bg-gradient-to-r from-orange-600 to-orange-400' :
                          pct > 40 ? 'bg-gradient-to-r from-cyan-600 to-cyan-400' :
                          'bg-gradient-to-r from-cyan-700 to-cyan-500'
                        }`}
                        style={{ width: `${Math.min(100, pct)}%` }}
                      >
                        <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent" />
                      </div>
                    </div>

                    {/* Production/Consumption mini breakdown */}
                    {(prodRate > 0 || consRate > 0) && (
                      <div className="flex items-center justify-between mt-1.5">
                        <div className="flex items-center gap-1">
                          <ArrowUpFromLine className="w-2.5 h-2.5 text-green-500" />
                          <span className="text-[9px] text-green-400 font-mono">{formatNumber(prodRate)}</span>
                        </div>
                        {consRate > 0 && (
                          <div className="flex items-center gap-1">
                            <ArrowDownToLine className="w-2.5 h-2.5 text-red-500" />
                            <span className="text-[9px] text-red-400 font-mono">{formatNumber(consRate)}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-1">
                          <Clock className="w-2.5 h-2.5 text-gray-500" />
                          <span className="text-[9px] text-gray-500 font-mono">
                            {netRate > 0 ? `+${formatNumber(capacity - amount)}` : '—'}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Storage upgrade button */}
                    <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-gray-800/50">
                      <div className="flex items-center gap-1">
                        <Package className="w-2.5 h-2.5 text-gray-500" />
                        <span className="text-[9px] text-gray-500">
                          Lv.{store.storageUpgradeLevels[resource] ?? 0}
                        </span>
                      </div>
                      {(() => {
                        const currentLevel = store.storageUpgradeLevels[resource] ?? 0;
                        const upgradeCost = Math.floor(100 * Math.pow(1.5, currentLevel));
                        const canAfford = store.money >= upgradeCost;
                        return (
                          <button
                            onClick={() => store.upgradeStorage(resource, 1)}
                            disabled={!canAfford}
                            className={`text-[9px] px-1.5 py-0.5 rounded transition-colors ${
                              canAfford
                                ? 'text-cyan-400 bg-cyan-900/20 hover:bg-cyan-900/40 border border-cyan-800/40'
                                : 'text-gray-600 bg-gray-800/30 border border-gray-800/30 cursor-not-allowed'
                            }`}
                          >
                            +50% (${formatNumber(upgradeCost)})
                          </button>
                        );
                      })()}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* RESOURCE FLOW VISUALIZATION */}
          <div className="game-card rounded-xl bg-[#111827] p-4 border border-[#1e293b]">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-green-400" />
                <h3 className="text-sm font-semibold text-green-400">Resource Flow</h3>
              </div>
              <span className="text-[10px] text-gray-500">net/t</span>
            </div>
            {resourceFlow.length === 0 ? (
              <div className="game-card-empty rounded-xl p-6 text-center">
                <div className="text-3xl mb-2">📊</div>
                <h3 className="text-sm font-bold text-green-400 mb-1">No Resource Flow Yet</h3>
                <p className="text-xs text-gray-400">Build extractors to generate resources and see the flow visualization</p>
              </div>
            ) : (
              <div className="space-y-2">
                {resourceFlow
                  .sort((a, b) => {
                    const netA = a.rate - (consumptionRates[a.resource] || 0);
                    const netB = b.rate - (consumptionRates[b.resource] || 0);
                    return netB - netA;
                  })
                  .map(({ resource, rate, amount, capacity, meta }) => {
                    const consRate = consumptionRates[resource] || 0;
                    const net = rate - consRate;
                    const maxRate = Math.max(rate, consRate, 0.1);

                    return (
                      <div key={resource} className="bg-[#0a0e17] rounded-lg p-2.5">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-sm">{meta.emoji}</span>
                          <span className="text-xs text-gray-300 flex-1">{meta.name}</span>
                          <span className={`text-[10px] font-mono font-bold ${
                            net > 0 ? 'text-green-400' : net < 0 ? 'text-red-400' : 'text-gray-500'
                          }`}>
                            {net > 0 ? '+' : ''}{formatNumber(net)}/t
                          </span>
                        </div>

                        {/* Flow bar visualization */}
                        <div className="relative h-6 flex items-center">
                          {/* Center line */}
                          <div className="absolute left-1/2 top-0 bottom-0 w-px bg-gray-700" />

                          {/* Production side (left of center) */}
                          <div className="absolute left-1/2 right-1/2 flex justify-end pr-0.5">
                            <div
                              className="h-4 bg-gradient-to-l from-green-600 to-green-800 rounded-l"
                              style={{ width: `${(rate / maxRate) * 48}%`, minWidth: rate > 0 ? '4px' : '0' }}
                            />
                          </div>

                          {/* Consumption side (right of center) */}
                          <div className="absolute left-1/2 right-1/2 flex pl-0.5">
                            <div
                              className="h-4 bg-gradient-to-r from-red-600 to-red-800 rounded-r"
                              style={{ width: `${(consRate / maxRate) * 48}%`, minWidth: consRate > 0 ? '4px' : '0' }}
                            />
                          </div>

                          {/* Labels */}
                          <span className="absolute left-1 text-[8px] text-green-400 font-mono">{formatNumber(rate)}</span>
                          <span className="absolute right-1 text-[8px] text-red-400 font-mono">{formatNumber(consRate)}</span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>

          {/* EXTRACTOR SUMMARY */}
          <div className="game-card rounded-xl bg-[#111827] p-4 border border-[#1e293b]">
            <div className="flex items-center gap-2 mb-3">
              <Container className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-semibold text-amber-400">Extractor Summary</h3>
            </div>
            <div className="space-y-2">
              {EXTRACTOR_TYPES.map(type => {
                const def = BUILDING_DEFS[type];
                if (!def) return null;
                const instances = extractorsByType[type];
                const activeInstances = instances.filter(b => b.active);
                const totalLevel = instances.reduce((s, b) => s + b.level, 0);
                const unlocked = isBuildingUnlocked(type, store.completedResearch, store.prestigeState);

                return (
                  <div key={type} className="flex items-center gap-3 bg-[#0a0e17] rounded-lg p-2.5">
                    <span className="text-lg">{def.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className={`text-xs font-medium ${unlocked ? 'text-gray-200' : 'text-gray-600'}`}>
                          {def.name}
                        </span>
                        <span className="text-[10px] text-gray-500 font-mono">
                          {activeInstances.length}/{instances.length}
                        </span>
                      </div>
                      <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-amber-500 rounded-full transition-all duration-500"
                          style={{ width: instances.length > 0 ? `${(activeInstances.length / instances.length) * 100}%` : '0%' }}
                        />
                      </div>
                      {instances.length > 0 && (
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-[9px] text-gray-500">Total Lv.{totalLevel}</span>
                          <span className="text-[9px] text-gray-500">
                            {formatNumber(instances.reduce((s, b) => s + def.basePowerConsumption * b.level, 0))} MW
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
