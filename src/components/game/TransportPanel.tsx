'use client';

import { useState, useMemo } from 'react';
import { useGameStore, formatNumber } from '@/lib/game/store';
import { TRANSPORT_DEFS, BUILDING_DEFS, RESOURCE_META } from '@/lib/game/data';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Truck, ArrowRight, ChevronUp, Power, AlertTriangle,
  Package, Route, Zap, Gauge, CircleDot
} from 'lucide-react';
import { TransportType, ResourceType, BuildingInstance } from '@/lib/game/types';

export function TransportPanel() {
  const store = useGameStore();
  const [selectedType, setSelectedType] = useState<TransportType>('conveyorBelt');
  const [fromBuilding, setFromBuilding] = useState<string>('');
  const [toBuilding, setToBuilding] = useState<string>('');
  const [carriesResource, setCarriesResource] = useState<ResourceType>('iron');

  const activeLines = store.transportLines.filter(l => l.active);
  const inactiveLines = store.transportLines.filter(l => !l.active);
  const totalThroughput = activeLines.reduce((sum, l) => sum + l.throughput, 0);

  const producingBuildings = store.buildings.filter(b => {
    const def = BUILDING_DEFS[b.type];
    return def?.outputs && def.outputs.length > 0 && b.active;
  });

  const consumingBuildings = store.buildings.filter(b => {
    const def = BUILDING_DEFS[b.type];
    return def?.inputs && def.inputs.length > 0 && b.active;
  });

  const availableResources = useMemo(() => {
    const resources = new Set<ResourceType>();
    producingBuildings.forEach(b => {
      BUILDING_DEFS[b.type]?.outputs?.forEach(o => {
        if (o.resource !== 'money') resources.add(o.resource as ResourceType);
      });
    });
    return Array.from(resources);
  }, [producingBuildings]);

  const transportTypes: TransportType[] = ['conveyorBelt', 'pipe', 'truck', 'cargoTrain', 'drone', 'cargoShip'];

  const handleBuild = () => {
    if (!fromBuilding || !toBuilding) return;
    store.buildTransportLine(selectedType, fromBuilding, toBuilding, carriesResource);
    setFromBuilding('');
    setToBuilding('');
  };

  const transportEfficiency = store.transportLines.length > 0
    ? (activeLines.length / store.transportLines.length) * 100
    : 100;

  // Bottleneck detection
  const bottlenecks = useMemo(() => {
    const issues: { building: BuildingInstance; reason: string }[] = [];
    store.buildings.forEach(b => {
      if (!b.active) return;
      const def = BUILDING_DEFS[b.type];
      if (!def?.outputs) return;
      
      // Check if there are transport lines from this building
      const outLines = store.transportLines.filter(l => l.fromBuilding === b.id && l.active);
      if (outLines.length === 0 && producingBuildings.some(pb => pb.id === b.id)) {
        const totalOutput = def.outputs.reduce((sum, o) => sum + o.amount * b.level, 0);
        if (totalOutput > 0) {
          issues.push({ building: b, reason: 'No outbound transport — production may be wasted' });
        }
      }
    });
    return issues;
  }, [store.buildings, store.transportLines, producingBuildings]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-blue-400 neon-glow-cyan tracking-wide">Transport & Logistics</h2>
          <p className="text-xs text-gray-500 mt-0.5">Manage supply chains and logistics networks</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-blue-500/50 text-blue-400 bg-blue-900/20 text-xs">
            <Route className="w-3 h-3 mr-1" />
            {store.transportLines.length} lines
          </Badge>
          <Badge variant="outline" className="border-cyan-500/50 text-cyan-400 bg-cyan-900/20 text-xs">
            <Gauge className="w-3 h-3 mr-1" />
            {formatNumber(totalThroughput)} u/t
          </Badge>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="game-card rounded-xl bg-[#111827] p-3 border border-blue-900/30">
          <div className="text-[10px] text-gray-500 mb-1">Active Lines</div>
          <div className="text-lg font-bold font-mono text-blue-400">{activeLines.length}</div>
        </div>
        <div className="game-card rounded-xl bg-[#111827] p-3 border border-blue-900/30">
          <div className="text-[10px] text-gray-500 mb-1">Total Throughput</div>
          <div className="text-lg font-bold font-mono text-cyan-400">{formatNumber(totalThroughput)}</div>
        </div>
        <div className="game-card rounded-xl bg-[#111827] p-3 border border-blue-900/30">
          <div className="text-[10px] text-gray-500 mb-1">Efficiency</div>
          <div className={`text-lg font-bold font-mono ${transportEfficiency >= 80 ? 'text-green-400' : transportEfficiency >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
            {transportEfficiency.toFixed(0)}%
          </div>
        </div>
        <div className="game-card rounded-xl bg-[#111827] p-3 border border-blue-900/30">
          <div className="text-[10px] text-gray-500 mb-1">Bottlenecks</div>
          <div className={`text-lg font-bold font-mono ${bottlenecks.length > 0 ? 'text-red-400' : 'text-green-400'}`}>
            {bottlenecks.length}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Build Transport */}
        <div className="lg:col-span-2 space-y-4">
          {/* Transport Type Selection */}
          <div className="game-card rounded-xl bg-[#111827] p-4 border border-[#1e293b]">
            <div className="flex items-center gap-2 mb-3">
              <Truck className="w-4 h-4 text-blue-400" />
              <h3 className="text-sm font-semibold text-blue-400">Build Transport Line</h3>
            </div>

            {/* Type selector */}
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-4">
              {transportTypes.map(type => {
                const def = TRANSPORT_DEFS[type];
                const isSelected = selectedType === type;
                const cost = def.baseCost.reduce((sum, c) => sum + (c.resource === 'money' ? c.amount : 0), 0);
                return (
                  <button
                    key={type}
                    onClick={() => setSelectedType(type)}
                    className={`p-2 rounded-lg border text-center transition-all ${
                      isSelected
                        ? 'border-cyan-500/50 bg-cyan-900/20 text-cyan-400'
                        : 'border-gray-800 bg-[#0a0e17] text-gray-400 hover:border-gray-600'
                    }`}
                  >
                    <div className="text-lg">{def.emoji}</div>
                    <div className="text-[10px] font-medium mt-0.5">{def.name}</div>
                    <div className="text-[9px] text-gray-500">${formatNumber(cost)}</div>
                  </button>
                );
              })}
            </div>

            {/* Selected type info */}
            <div className="bg-[#0a0e17] rounded-lg p-3 mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-300">{TRANSPORT_DEFS[selectedType].description}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-[10px] text-gray-500">Throughput</div>
                  <div className="text-sm font-bold text-cyan-400 font-mono">{TRANSPORT_DEFS[selectedType].baseThroughput} u/t</div>
                </div>
                <div>
                  <div className="text-[10px] text-gray-500">Cost</div>
                  <div className="text-sm font-bold text-green-400 font-mono">${formatNumber(TRANSPORT_DEFS[selectedType].baseCost.reduce((s, c) => s + (c.resource === 'money' ? c.amount : 0), 0))}</div>
                </div>
                <div>
                  <div className="text-[10px] text-gray-500">Upgrade x</div>
                  <div className="text-sm font-bold text-purple-400 font-mono">{TRANSPORT_DEFS[selectedType].upgradeMultiplier}</div>
                </div>
              </div>
            </div>

            {/* Route Configuration */}
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* From building */}
                <div>
                  <label className="text-[10px] text-gray-500 mb-1 block">From (Producer)</label>
                  <select
                    value={fromBuilding}
                    onChange={e => setFromBuilding(e.target.value)}
                    className="w-full bg-[#0a0e17] border border-gray-800 rounded-lg px-2 py-1.5 text-xs text-gray-300 focus:border-cyan-500/50 focus:outline-none"
                  >
                    <option value="">Select source...</option>
                    {producingBuildings.map(b => (
                      <option key={b.id} value={b.id}>
                        {BUILDING_DEFS[b.type]?.emoji} {BUILDING_DEFS[b.type]?.name} Lv.{b.level}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Resource */}
                <div>
                  <label className="text-[10px] text-gray-500 mb-1 block">Carries Resource</label>
                  <select
                    value={carriesResource}
                    onChange={e => setCarriesResource(e.target.value as ResourceType)}
                    className="w-full bg-[#0a0e17] border border-gray-800 rounded-lg px-2 py-1.5 text-xs text-gray-300 focus:border-cyan-500/50 focus:outline-none"
                  >
                    {availableResources.map(r => (
                      <option key={r} value={r}>
                        {RESOURCE_META[r].emoji} {RESOURCE_META[r].name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* To building */}
                <div>
                  <label className="text-[10px] text-gray-500 mb-1 block">To (Consumer)</label>
                  <select
                    value={toBuilding}
                    onChange={e => setToBuilding(e.target.value)}
                    className="w-full bg-[#0a0e17] border border-gray-800 rounded-lg px-2 py-1.5 text-xs text-gray-300 focus:border-cyan-500/50 focus:outline-none"
                  >
                    <option value="">Select destination...</option>
                    {consumingBuildings.map(b => (
                      <option key={b.id} value={b.id}>
                        {BUILDING_DEFS[b.type]?.emoji} {BUILDING_DEFS[b.type]?.name} Lv.{b.level}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <Button
                onClick={handleBuild}
                disabled={!fromBuilding || !toBuilding || fromBuilding === toBuilding}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white"
                size="sm"
              >
                <Truck className="w-3.5 h-3.5 mr-1.5" />
                Build {TRANSPORT_DEFS[selectedType].name}
              </Button>
            </div>
          </div>

          {/* Active Transport Lines */}
          <div className="game-card rounded-xl bg-[#111827] p-4 border border-[#1e293b]">
            <div className="flex items-center gap-2 mb-3">
              <Route className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-semibold text-cyan-400">Active Transport Lines</h3>
            </div>
            {store.transportLines.length === 0 ? (
              <div className="text-center py-8">
                <Truck className="w-10 h-10 text-gray-700 mx-auto mb-2" />
                <p className="text-xs text-gray-500">No transport lines built yet</p>
                <p className="text-[10px] text-gray-600 mt-1">Connect producers to consumers to optimize production</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto game-scrollbar">
                {store.transportLines.map(line => {
                  const def = TRANSPORT_DEFS[line.type];
                  const fromB = store.buildings.find(b => b.id === line.fromBuilding);
                  const toB = store.buildings.find(b => b.id === line.toBuilding);
                  const fromDef = fromB ? BUILDING_DEFS[fromB.type] : null;
                  const toDef = toB ? BUILDING_DEFS[toB.type] : null;
                  const upgradeCost = Math.floor(def.baseCost.reduce((s, c) => s + (c.resource === 'money' ? c.amount : 0), 0) * Math.pow(1.3, line.level));
                  const throughputPct = (line.throughput / line.maxThroughput) * 100;

                  return (
                    <div key={line.id} className={`bg-[#0a0e17] rounded-lg p-3 border ${line.active ? 'border-cyan-900/30' : 'border-gray-800 opacity-60'}`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm">{def.emoji}</span>
                          <Badge variant="outline" className="text-[9px] border-gray-700 text-gray-400 px-1">
                            Lv.{line.level}
                          </Badge>
                          <button
                            onClick={() => store.toggleTransportLine(line.id)}
                            className={`w-5 h-5 rounded-full border text-[10px] flex items-center justify-center ${
                              line.active ? 'border-green-500/50 text-green-400 bg-green-900/20' : 'border-gray-600 text-gray-500'
                            }`}
                          >
                            <Power className="w-3 h-3" />
                          </button>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-[10px] px-2 text-cyan-400 hover:text-cyan-300"
                          onClick={() => store.upgradeTransportLine(line.id)}
                          disabled={store.money < upgradeCost}
                        >
                          <ChevronUp className="w-3 h-3 mr-0.5" />
                          ${formatNumber(upgradeCost)}
                        </Button>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-gray-400 truncate max-w-[80px]">{fromDef?.emoji} {fromDef?.name}</span>
                        <ArrowRight className="w-3 h-3 text-cyan-400 flex-shrink-0" />
                        <span className="text-cyan-400">{RESOURCE_META[line.carriesResource]?.emoji}</span>
                        <ArrowRight className="w-3 h-3 text-cyan-400 flex-shrink-0" />
                        <span className="text-gray-400 truncate max-w-[80px]">{toDef?.emoji} {toDef?.name}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              throughputPct > 80 ? 'bg-red-500' : throughputPct > 50 ? 'bg-yellow-500' : 'bg-cyan-500'
                            }`}
                            style={{ width: `${throughputPct}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-gray-400 font-mono">{formatNumber(line.throughput)}/{formatNumber(line.maxThroughput)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Sidebar */}
        <div className="space-y-4">
          {/* Bottleneck Detection */}
          <div className="game-card rounded-xl bg-[#111827] p-4 border border-[#1e293b]">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-4 h-4 text-orange-400" />
              <h3 className="text-sm font-semibold text-orange-400">Bottleneck Detection</h3>
            </div>
            {bottlenecks.length === 0 ? (
              <div className="text-center py-4">
                <CircleDot className="w-8 h-8 text-green-800 mx-auto mb-1.5" />
                <p className="text-xs text-green-400">No bottlenecks detected</p>
                <p className="text-[10px] text-gray-600 mt-0.5">All buildings properly connected</p>
              </div>
            ) : (
              <div className="space-y-2">
                {bottlenecks.map((bn, i) => (
                  <div key={i} className="bg-red-900/10 border border-red-900/30 rounded-lg p-2.5">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-sm">{BUILDING_DEFS[bn.building.type]?.emoji}</span>
                      <span className="text-xs text-red-400 font-medium">{BUILDING_DEFS[bn.building.type]?.name} Lv.{bn.building.level}</span>
                    </div>
                    <p className="text-[10px] text-gray-400">{bn.reason}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Transport Efficiency */}
          <div className="game-card rounded-xl bg-[#111827] p-4 border border-[#1e293b]">
            <div className="flex items-center gap-2 mb-3">
              <Gauge className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-semibold text-cyan-400">Logistics Network</h3>
            </div>
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-gray-400">Line Utilization</span>
                  <span className="text-cyan-400 font-mono">{transportEfficiency.toFixed(0)}%</span>
                </div>
                <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      transportEfficiency >= 80 ? 'bg-green-500' : transportEfficiency >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${transportEfficiency}%` }}
                  />
                </div>
              </div>
              
              {/* Transport type breakdown */}
              {transportTypes.filter(t => store.transportLines.some(l => l.type === t)).map(type => {
                const lines = store.transportLines.filter(l => l.type === type);
                const def = TRANSPORT_DEFS[type];
                return (
                  <div key={type} className="flex items-center justify-between text-xs bg-[#0a0e17] rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span>{def.emoji}</span>
                      <span className="text-gray-300">{def.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400 font-mono">{lines.length}</span>
                      <span className="text-cyan-400 font-mono">{formatNumber(lines.reduce((s, l) => s + l.throughput, 0))} u/t</span>
                    </div>
                  </div>
                );
              })}

              {store.transportLines.length === 0 && (
                <p className="text-xs text-gray-500 text-center py-2">Build transport lines to see breakdown</p>
              )}
            </div>
          </div>

          {/* Quick Tips */}
          <div className="game-card rounded-xl bg-[#111827] p-4 border border-[#1e293b]">
            <div className="flex items-center gap-2 mb-3">
              <Package className="w-4 h-4 text-gray-400" />
              <h3 className="text-sm font-semibold text-gray-400">Logistics Tips</h3>
            </div>
            <div className="space-y-2 text-[11px] text-gray-500">
              <p>• Connect extractors to factories for smooth production</p>
              <p>• Upgrade lines when throughput is near max capacity</p>
              <p>• Drones are fast but low capacity — great for rare materials</p>
              <p>• Cargo ships are slow but massive — ideal for bulk</p>
              <p>• Research logistics to boost throughput +20-50%</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
