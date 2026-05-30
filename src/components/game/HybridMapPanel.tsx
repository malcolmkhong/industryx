'use client';

import { useState, useRef, useEffect, useCallback, useMemo, memo } from 'react';
import { useGameStore, formatNumber } from '@/lib/game/store';
import { BUILDING_DEFS, RESOURCE_META, INITIAL_REGIONS, BUILDING_FOOTPRINTS, getBuildingFootprint } from '@/lib/game/data';
import { Region, RegionId, GridTile, LogisticsRoute, MapViewLayer, MapViewMode, BuildingType, BuildingInstance, ResourceType } from '@/lib/game/types';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { toast } from '@/hooks/use-toast';
import {
  Map as MapIcon, Grid3X3, Route, Lock, Eye, Hammer,
  Trash2, ArrowLeft, ZoomIn, ZoomOut, ChevronRight, X,
  Power, PowerOff, ChevronUp, Wand2, LayoutGrid, ArrowDown,
  ArrowRight, ArrowUp, Link2, BarChart3, RotateCcw, MapPin,
  Trees, Waves, Mountain, Droplets, Navigation,
} from 'lucide-react';

// =============================================
// Constants
// =============================================
const REGION_ORDER: RegionId[] = ['cosmic', 'quantum', 'highlands', 'industrial', 'grasslands'];

const TERRAIN_BG: Record<GridTile['terrain'], string> = {
  flat: 'bg-gray-800/40',
  rocky: 'bg-amber-900/20',
  water: 'bg-blue-900/30',
  forest: 'bg-green-900/20',
  mountain: 'bg-gray-700/20',
};

const TERRAIN_NAMES: Record<GridTile['terrain'], string> = {
  flat: 'Flat Land',
  rocky: 'Rocky Terrain',
  water: 'Water',
  forest: 'Forest',
  mountain: 'Mountain',
};

const BUILD_CATEGORIES = [
  { label: '⛏️ Extraction', key: 'extractor' as const },
  { label: '🏭 Factory', key: 'factory' as const },
  { label: '⚡ Power', key: 'power' as const },
];

const ROUTE_TYPE_ICON: Record<string, string> = {
  conveyor: '🔄', pipe: '🔌', truck: '🚛', train: '🚂', drone: '🛸',
};

function getTierRowRange(category: string, tier: number): [number, number] {
  if (category === 'extractor') return [0, 3];
  if (category === 'power') return [0, 3];
  if (tier <= 1) return [3, 7];
  if (tier === 2) return [7, 11];
  if (tier === 3) return [11, 15];
  return [15, 999];
}

// Column letter helper (A, B, C, ... Z, AA, AB, ...)
function colLetter(c: number): string {
  let result = '';
  let n = c;
  while (n >= 0) {
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26) - 1;
  }
  return result;
}

// Efficiency color helper
function getEffColor(eff: number): string {
  if (eff >= 0.8) return '#4ade80';
  if (eff >= 0.5) return '#facc15';
  return '#f87171';
}

// =============================================
// Region Overview Map
// =============================================
function RegionOverviewMap() {
  const store = useGameStore();
  const regions = store.mapRegions.length > 0 ? store.mapRegions : INITIAL_REGIONS;

  const getBuildingCount = (regionId: string) =>
    store.buildings.filter(b => b.regionId === regionId).length;

  const handleRegionClick = (region: Region) => {
    if (!region.unlocked) {
      if (store.money >= region.unlockCost) {
        if (confirm(`Unlock ${region.emoji} ${region.name} for $${formatNumber(region.unlockCost)}?`)) {
          store.unlockRegion(region.id);
        }
      } else {
        store.addNotification('warning', `Need $${formatNumber(region.unlockCost)} to unlock ${region.name}`);
      }
      return;
    }
    store.setActiveRegion(region.id);
  };

  const regionCardPositions: Record<RegionId, { cx: number; cy: number }> = {
    cosmic: { cx: 50, cy: 10 },
    quantum: { cx: 25, cy: 35 },
    highlands: { cx: 75, cy: 35 },
    industrial: { cx: 50, cy: 60 },
    grasslands: { cx: 50, cy: 85 },
  };

  const crossRegionRoutes = useMemo(() => {
    return store.logisticsRoutes.filter(r => {
      const from = store.buildings.find(b => b.id === r.fromBuildingId);
      const to = store.buildings.find(b => b.id === r.toBuildingId);
      return from && to && from.regionId !== to.regionId;
    });
  }, [store.logisticsRoutes, store.buildings]);

  const totalBuildings = store.buildings.length;
  const totalRoutes = store.logisticsRoutes.length;

  const gridUtilization = useMemo(() => {
    const result: { regionId: string; regionName: string; occupied: number; total: number; pct: number }[] = [];
    for (const region of regions) {
      if (!region.unlocked) continue;
      const grid = store.mapGrids[region.id] ?? [];
      const total = grid.length || (region.gridRows * region.gridCols);
      const occupied = store.buildings.filter(b => b.regionId === region.id && b.gridRow !== undefined).length;
      result.push({ regionId: region.id, regionName: `${region.emoji} ${region.name}`, occupied, total, pct: total > 0 ? Math.round((occupied / total) * 100) : 0 });
    }
    return result;
  }, [regions, store.mapGrids, store.buildings]);

  const productionCapacity = useMemo(() => {
    const result: { regionId: string; regionName: string; capacity: number }[] = [];
    for (const region of regions) {
      if (!region.unlocked) continue;
      const regionBuildings = store.buildings.filter(b => b.regionId === region.id && b.active);
      const capacity = regionBuildings.reduce((sum, b) => sum + b.efficiency, 0);
      result.push({ regionId: region.id, regionName: `${region.emoji} ${region.name}`, capacity: Math.round(capacity * 100) });
    }
    return result;
  }, [regions, store.buildings]);

  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-[11px]">
        <MapIcon className="w-3.5 h-3.5 text-cyan-400" />
        <span className="text-cyan-400 font-semibold">World Map</span>
      </div>

      <div className="text-center">
        <h2 className="text-lg font-bold text-cyan-400">🗺️ World Map</h2>
        <p className="text-xs text-gray-500">Click a region to enter — unlock new areas to expand your empire</p>
      </div>

      {/* Region cards with cross-region route overlay */}
      <div className="relative max-w-2xl mx-auto">
        {crossRegionRoutes.length > 0 && (
          <svg className="absolute inset-0 pointer-events-none z-10" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
            <defs>
              <filter id="cross-route-glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="1" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>
            {crossRegionRoutes.map(route => {
              const from = store.buildings.find(b => b.id === route.fromBuildingId);
              const to = store.buildings.find(b => b.id === route.toBuildingId);
              if (!from?.regionId || !to?.regionId) return null;
              const fromPos = regionCardPositions[from.regionId as RegionId];
              const toPos = regionCardPositions[to.regionId as RegionId];
              if (!fromPos || !toPos) return null;
              const meta = RESOURCE_META[route.carriesResource];
              const color = meta?.color ?? '#00fff2';
              const mx = (fromPos.cx + toPos.cx) / 2;
              const my = (fromPos.cy + toPos.cy) / 2;
              const dx = toPos.cx - fromPos.cx;
              const dy = toPos.cy - fromPos.cy;
              const cx = mx - dy * 0.3;
              const cy = my + dx * 0.3;
              return (
                <g key={route.id}>
                  <path d={`M${fromPos.cx},${fromPos.cy} Q${cx},${cy} ${toPos.cx},${toPos.cy}`} fill="none" stroke={color} strokeWidth="0.5" opacity="0.6" filter="url(#cross-route-glow)" />
                  <circle r="0.8" fill={color} opacity="0.8">
                    <animateMotion dur={`${2 + (1 - route.efficiency) * 1.5}s`} repeatCount="indefinite" path={`M${fromPos.cx},${fromPos.cy} Q${cx},${cy} ${toPos.cx},${toPos.cy}`} />
                  </circle>
                  <text x={mx} y={my - 1.5} textAnchor="middle" fontSize="2.5" fill={color} opacity="0.9">{meta?.emoji ?? ''} {formatNumber(route.throughput)}/t</text>
                </g>
              );
            })}
          </svg>
        )}

        <div className="grid gap-3 md:grid-cols-2 grid-cols-1">
          {REGION_ORDER.map(id => {
            const region = regions.find(r => r.id === id);
            if (!region) return null;
            const buildingCount = getBuildingCount(region.id);
            return (
              <motion.button
                key={region.id}
                className={`relative rounded-xl border-2 p-4 text-left transition-all duration-200 ${region.unlocked ? 'cursor-pointer hover:scale-[1.02] hover:shadow-lg' : 'cursor-pointer opacity-70 hover:opacity-90'}`}
                style={{
                  borderColor: region.unlocked ? region.color : '#374151',
                  background: region.unlocked ? `linear-gradient(135deg, ${region.color}10, ${region.color}05)` : 'rgba(17,24,39,0.8)',
                }}
                onClick={() => handleRegionClick(region)}
                whileTap={{ scale: 0.97 }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{region.emoji}</span>
                    <div>
                      <div className="text-sm font-bold" style={{ color: region.unlocked ? region.color : '#9ca3af' }}>{region.name}</div>
                      {!region.unlocked && (
                        <div className="flex items-center gap-1 text-xs text-gray-500"><Lock className="w-3 h-3" /><span>${formatNumber(region.unlockCost)}</span></div>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {region.unlocked ? (
                      <Badge variant="outline" className="text-[9px] border-green-500/30 text-green-400 bg-green-900/10">{buildingCount} building{buildingCount !== 1 ? 's' : ''}</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[9px] border-gray-600 text-gray-500 bg-gray-900/20"><Lock className="w-2.5 h-2.5 mr-0.5" /> Locked</Badge>
                    )}
                  </div>
                </div>
                {region.unlocked && <div className="mt-2 text-[10px] text-gray-500 line-clamp-1">{region.description}</div>}
                {region.unlocked && region.bonuses.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {region.bonuses.map((b, i) => <span key={i} className="text-[8px] px-1 py-0.5 rounded bg-gray-800/60 text-gray-400">{b.description}</span>)}
                  </div>
                )}
                {!region.unlocked && store.money >= region.unlockCost && (
                  <div className="mt-2 text-[10px] text-yellow-400 animate-pulse">💰 Can afford! Click to unlock</div>
                )}
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Region Statistics Panel */}
      <div className="bg-gray-900/80 rounded-lg border border-gray-800 p-4 max-w-2xl mx-auto">
        <div className="text-xs font-bold text-cyan-400 flex items-center gap-1.5 mb-3">
          <BarChart3 className="w-3.5 h-3.5" /> Empire Statistics
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-gray-800/50 rounded-md p-2 text-center">
            <div className="text-[8px] text-gray-500 uppercase tracking-wider">Buildings</div>
            <div className="text-base font-bold text-cyan-400 font-mono">{totalBuildings}</div>
          </div>
          <div className="bg-gray-800/50 rounded-md p-2 text-center">
            <div className="text-[8px] text-gray-500 uppercase tracking-wider">Logistics Routes</div>
            <div className="text-base font-bold text-emerald-400 font-mono">{totalRoutes}</div>
          </div>
          <div className="bg-gray-800/50 rounded-md p-2 text-center">
            <div className="text-[8px] text-gray-500 uppercase tracking-wider">Cross-Region</div>
            <div className="text-base font-bold text-orange-400 font-mono">{crossRegionRoutes.length}</div>
          </div>
          <div className="bg-gray-800/50 rounded-md p-2 text-center">
            <div className="text-[8px] text-gray-500 uppercase tracking-wider">Regions Active</div>
            <div className="text-base font-bold text-purple-400 font-mono">{regions.filter(r => r.unlocked).length}/{regions.length}</div>
          </div>
        </div>
        {gridUtilization.length > 0 && (
          <div className="mt-3 space-y-1.5">
            <div className="text-[9px] text-gray-500 font-semibold">Grid Utilization</div>
            {gridUtilization.map(r => (
              <div key={r.regionId} className="flex items-center gap-2 text-[9px]">
                <span className="text-gray-400 w-24 truncate">{r.regionName}</span>
                <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${r.pct}%`, backgroundColor: r.pct < 30 ? '#4ade80' : r.pct < 60 ? '#facc15' : '#f87171' }} />
                </div>
                <span className="text-gray-500 font-mono w-12 text-right">{r.pct}%</span>
                <span className="text-gray-600 font-mono w-16 text-right">({r.occupied}/{r.total})</span>
              </div>
            ))}
          </div>
        )}
        {productionCapacity.length > 0 && (
          <div className="mt-3 space-y-1.5">
            <div className="text-[9px] text-gray-500 font-semibold">Production Capacity (Active Efficiency)</div>
            {productionCapacity.map(r => (
              <div key={r.regionId} className="flex items-center justify-between text-[9px]">
                <span className="text-gray-400">{r.regionName}</span>
                <span className="text-cyan-400 font-mono">{r.capacity}%</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================
// Building Tile (memoized)
// =============================================
const BuildingTile = memo(function BuildingTile({
  building,
  footprint,
  isSelected,
  cellSize,
  mode,
  connectionCount,
  isRouteHighlighted,
}: {
  building: BuildingInstance;
  footprint: { width: number; height: number; cells: number };
  isSelected: boolean;
  cellSize: number;
  mode: MapViewMode;
  connectionCount: number;
  isRouteHighlighted?: boolean;
}) {
  const def = BUILDING_DEFS[building.type];
  if (!def) return null;

  const effColor = getEffColor(building.efficiency);
  const categoryColor =
    def.category === 'extractor' ? '#92400e' :
    def.category === 'power' ? '#713f12' :
    def.tier === 1 ? '#164e63' :
    def.tier === 2 ? '#7c2d12' :
    def.tier === 3 ? '#581c87' : '#064e3b';

  const isMultiCell = footprint.width > 1 || footprint.height > 1;
  const emojiFontSize = isMultiCell ? Math.max(16, cellSize * 0.45) : Math.max(12, cellSize * 0.3);

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <motion.div
            className={`
              absolute inset-0 rounded-md border-2 overflow-hidden flex flex-col items-center justify-center
              ${!building.active ? 'opacity-40 grayscale' : ''}
              ${mode === 'demolish' ? 'hover:border-red-500 hover:bg-red-900/30' : ''}
              ${isRouteHighlighted ? 'ring-2 ring-cyan-400/60' : ''}
            `}
            style={{
              borderColor: isSelected ? '#22d3ee' : categoryColor,
              background: `linear-gradient(135deg, ${categoryColor}90, ${categoryColor}60)`,
              boxShadow: isSelected ? '0 0 12px rgba(34,211,238,0.4)' : building.active ? `0 0 4px ${categoryColor}60` : 'none',
            }}
            initial={false}
            animate={building.active ? { opacity: [1, 0.85, 1] } : {}}
            transition={building.active ? { duration: 2, repeat: Infinity, ease: 'easeInOut' } : {}}
          >
            <span className="leading-none" style={{ fontSize: emojiFontSize }}>{def.emoji}</span>
            <div className="flex items-center gap-0.5 mt-0.5">
              <Badge className="text-[6px] px-0.5 py-0 h-3 min-w-[10px] bg-gray-800/80 text-gray-300 border-gray-600/50">{building.level}</Badge>
              {footprint.width > 1 && <Badge className="text-[5px] px-0.5 py-0 h-3 bg-gray-700/60 text-gray-400 border-gray-600/30">{footprint.width}×{footprint.height}</Badge>}
            </div>
            <div className="w-3/4 h-0.5 bg-gray-800/60 rounded-full mt-0.5 overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${Math.round(building.efficiency * 100)}%`, backgroundColor: effColor }} />
            </div>
            {connectionCount > 0 && (
              <div className="absolute top-0.5 right-0.5 flex items-center gap-0.5">
                <Link2 className="w-2 h-2 text-cyan-400" />
                <span className="text-[6px] text-cyan-300 font-mono">{connectionCount}</span>
              </div>
            )}
            {isSelected && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="flex flex-col items-center gap-0.5">
                  {def.inputs && def.inputs.length > 0 && (<div className="flex items-center gap-0.5"><ArrowDown className="w-2 h-2 text-red-400 animate-bounce" /><span className="text-[5px] text-red-300">IN</span></div>)}
                  {def.outputs && def.outputs.length > 0 && (<div className="flex items-center gap-0.5"><ArrowUp className="w-2 h-2 text-green-400 animate-bounce" /><span className="text-[5px] text-green-300">OUT</span></div>)}
                </div>
              </div>
            )}
          </motion.div>
        </TooltipTrigger>
        <TooltipContent side="top" className="bg-gray-900 border-gray-700 text-xs">
          <div className="font-semibold">{def.emoji} {def.name}</div>
          <div className="text-gray-400">Lv {building.level} • Eff {Math.round(building.efficiency * 100)}%</div>
          {def.inputs && <div className="text-red-400">→ in: {def.inputs.map(i => RESOURCE_META[i.resource as ResourceType]?.name ?? i.resource).join(', ')}</div>}
          {def.outputs && <div className="text-green-400">→ out: {def.outputs.map(o => RESOURCE_META[o.resource as ResourceType]?.name ?? o.resource).join(', ')}</div>}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});

// =============================================
// Build Palette Sidebar
// =============================================
function BuildPalette({
  groups, pendingType, onSelectType, isAffordable, isUnlocked,
}: {
  groups: { label: string; types: BuildingType[] }[];
  pendingType: BuildingType | null;
  onSelectType: (type: BuildingType | null) => void;
  isAffordable: (type: BuildingType) => boolean;
  isUnlocked: (type: BuildingType) => boolean;
}) {
  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="space-y-2">
      <div className="text-xs font-bold text-cyan-400 flex items-center gap-1"><Hammer className="w-3 h-3" /> Build Palette</div>
      {pendingType && (
        <div className="flex items-center gap-1 p-2 rounded-md bg-cyan-900/20 border border-cyan-500/30">
          <span className="text-sm">{BUILDING_DEFS[pendingType]?.emoji}</span>
          <span className="text-[10px] text-cyan-300 flex-1">{BUILDING_DEFS[pendingType]?.name}</span>
          <Button variant="ghost" size="sm" className="h-4 w-4 p-0 text-gray-400" onClick={() => onSelectType(null)}><X className="w-2.5 h-2.5" /></Button>
        </div>
      )}
      {groups.map((group, gi) => (
        <div key={gi}>
          <div className="text-[10px] text-gray-500 font-semibold mb-1">{group.label}</div>
          <div className="space-y-0.5 max-h-48 overflow-y-auto game-scrollbar">
            {group.types.map(type => {
              const def = BUILDING_DEFS[type];
              if (!def) return null;
              const affordable = isAffordable(type);
              const unlocked = isUnlocked(type);
              const fp = getBuildingFootprint(type);
              const isActive = pendingType === type;
              const cost = def.baseCost.find(c => c.resource === 'money')?.amount ?? 0;
              return (
                <button
                  key={type}
                  className={`w-full text-left p-1.5 rounded-md border transition-colors text-[10px] ${isActive ? 'border-cyan-500/50 bg-cyan-900/20' : 'border-gray-800 bg-gray-900/40 hover:bg-gray-800/60'} ${!unlocked ? 'opacity-40' : !affordable ? 'opacity-60' : ''}`}
                  onClick={() => onSelectType(isActive ? null : type)}
                  disabled={!unlocked}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm">{def.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <div className="truncate text-gray-300">{def.name}</div>
                      <div className="flex items-center gap-1 text-gray-500">
                        <span className="text-green-400">${formatNumber(cost)}</span>
                        <Badge className="text-[5px] px-0.5 py-0 h-3 bg-gray-700/60 text-gray-400 border-0">{fp.width}×{fp.height}</Badge>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </motion.div>
  );
}

// =============================================
// Selected Building Detail
// =============================================
function SelectedBuildingDetail({
  building, connectionCount, onClose,
}: {
  building: BuildingInstance;
  connectionCount: number;
  onClose: () => void;
}) {
  const store = useGameStore();
  const def = BUILDING_DEFS[building.type];
  if (!def) return null;

  const upgradeCost = def.baseCost.find(c => c.resource === 'money')
    ? Math.floor((def.baseCost.find(c => c.resource === 'money')?.amount ?? 0) * Math.pow(def.costMultiplier, building.level))
    : 0;
  const canAffordUpgrade = store.money >= upgradeCost;

  const categoryColor =
    def.category === 'extractor' ? 'text-amber-400' :
    def.category === 'power' ? 'text-yellow-400' :
    def.tier <= 1 ? 'text-cyan-400' :
    def.tier === 2 ? 'text-orange-400' :
    def.tier === 3 ? 'text-purple-400' : 'text-emerald-400';

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="space-y-3 bg-gray-900/80 rounded-lg border border-gray-800 p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">{def.emoji}</span>
          <div>
            <h3 className={`text-sm font-semibold ${categoryColor}`}>{def.name}</h3>
            <p className="text-[10px] text-gray-500">Lv {building.level} • {building.active ? '🟢 Active' : '🔴 Off'}</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-gray-500" onClick={onClose}><X className="w-3 h-3" /></Button>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <div className="bg-gray-800/50 rounded p-1.5 text-center">
          <div className="text-[8px] text-gray-500">Efficiency</div>
          <div className="text-sm font-bold font-mono" style={{ color: getEffColor(building.efficiency) }}>{Math.round(building.efficiency * 100)}%</div>
        </div>
        <div className="bg-gray-800/50 rounded p-1.5 text-center">
          <div className="text-[8px] text-gray-500">Power</div>
          <div className="text-sm font-bold font-mono text-yellow-400">{def.basePowerProduction > 0 ? `+${def.basePowerProduction * building.level}MW` : `-${def.basePowerConsumption * building.level}MW`}</div>
        </div>
      </div>
      {connectionCount > 0 && (
        <div className="flex items-center gap-1.5 text-[9px] text-cyan-400 bg-cyan-900/10 rounded px-2 py-1 border border-cyan-900/30">
          <Link2 className="w-3 h-3" /><span>{connectionCount} logistics route{connectionCount !== 1 ? 's' : ''} connected</span>
        </div>
      )}
      <div className="space-y-1">
        {def.inputs && def.inputs.length > 0 && <div className="flex items-center gap-1 text-[8px] text-red-400"><ArrowDown className="w-2.5 h-2.5" /> Input Flow</div>}
        {def.outputs && def.outputs.length > 0 && <div className="flex items-center gap-1 text-[8px] text-green-400"><ArrowUp className="w-2.5 h-2.5" /> Output Flow</div>}
      </div>
      {def.outputs && (
        <div>
          <div className="text-[9px] text-gray-500 mb-1">Produces</div>
          <div className="space-y-0.5">
            {def.outputs.map((output, i) => {
              const meta = RESOURCE_META[output.resource as ResourceType];
              return (
                <div key={i} className="flex items-center justify-between bg-gray-800/40 rounded px-1.5 py-0.5">
                  <div className="flex items-center gap-1"><span className="text-[10px]">{meta?.emoji ?? ''}</span><span className="text-[9px]" style={{ color: meta?.color }}>{meta?.name ?? output.resource}</span></div>
                  <span className="text-[9px] text-green-400 font-mono">+{formatNumber(output.amount * building.level * building.efficiency)}/t</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {def.inputs && (
        <div>
          <div className="text-[9px] text-gray-500 mb-1">Requires</div>
          <div className="space-y-0.5">
            {def.inputs.map((input, i) => {
              const meta = RESOURCE_META[input.resource as ResourceType];
              const have = store.resources[input.resource as ResourceType] ?? 0;
              const needed = input.amount * building.level;
              return (
                <div key={i} className="flex items-center justify-between bg-gray-800/40 rounded px-1.5 py-0.5">
                  <div className="flex items-center gap-1"><span className="text-[10px]">{meta?.emoji ?? ''}</span><span className="text-[9px]" style={{ color: meta?.color }}>{meta?.name ?? input.resource}</span></div>
                  <span className={`text-[9px] font-mono ${have >= needed ? 'text-gray-400' : 'text-red-400'}`}>{formatNumber(have)}/{formatNumber(needed)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <div className="flex gap-1.5">
        <Button variant="outline" size="sm" className={`flex-1 h-7 text-[10px] ${building.active ? 'border-red-800/50 text-red-400 hover:bg-red-900/20' : 'border-green-800/50 text-green-400 hover:bg-green-900/20'}`} onClick={() => store.toggleBuilding(building.id)}>
          {building.active ? <PowerOff className="w-2.5 h-2.5 mr-1" /> : <Power className="w-2.5 h-2.5 mr-1" />}{building.active ? 'Off' : 'On'}
        </Button>
        <Button variant="outline" size="sm" className={`flex-1 h-7 text-[10px] ${canAffordUpgrade ? 'border-cyan-800/50 text-cyan-400 hover:bg-cyan-900/20' : 'border-gray-700 text-gray-500'}`} onClick={() => store.upgradeBuilding(building.id)} disabled={!canAffordUpgrade}>
          <ChevronUp className="w-2.5 h-2.5 mr-1" /> ${formatNumber(upgradeCost)}
        </Button>
      </div>
    </motion.div>
  );
}

// =============================================
// Minimap Component
// =============================================
function Minimap({
  rows, cols, regionBuildings, scrollLeft, scrollTop, clientWidth, clientHeight,
  totalGridWidth, totalGridHeight, onMinimapClick, regionColor,
}: {
  rows: number;
  cols: number;
  regionBuildings: BuildingInstance[];
  scrollLeft: number;
  scrollTop: number;
  clientWidth: number;
  clientHeight: number;
  totalGridWidth: number;
  totalGridHeight: number;
  onMinimapClick: (e: React.MouseEvent<SVGSVGElement>) => void;
  regionColor: string;
}) {
  const minimapW = 160;
  const minimapH = Math.round(minimapW * (rows / cols));
  const cellW = minimapW / cols;
  const cellH = minimapH / rows;

  // Viewport rect
  const vpX = totalGridWidth > 0 ? (scrollLeft / totalGridWidth) * minimapW : 0;
  const vpY = totalGridHeight > 0 ? (scrollTop / totalGridHeight) * minimapH : 0;
  const vpW = totalGridWidth > 0 ? (clientWidth / totalGridWidth) * minimapW : minimapW;
  const vpH = totalGridHeight > 0 ? (clientHeight / totalGridHeight) * minimapH : minimapH;

  return (
    <svg
      width={minimapW}
      height={minimapH}
      className="rounded-md border border-gray-700 bg-gray-900/90 cursor-pointer shadow-lg"
      onClick={onMinimapClick}
      style={{ imageRendering: 'pixelated' }}
    >
      {/* Grid background */}
      <rect x={0} y={0} width={minimapW} height={minimapH} fill="#111827" />
      {/* Building dots */}
      {regionBuildings.map(b => {
        if (b.gridRow === undefined || b.gridCol === undefined) return null;
        const fp = getBuildingFootprint(b.type);
        const def = BUILDING_DEFS[b.type];
        const catColor = def?.category === 'extractor' ? '#f59e0b' : def?.category === 'power' ? '#eab308' : def?.tier === 0 ? '#6b7280' : def?.tier === 1 ? '#06b6d4' : def?.tier === 2 ? '#f97316' : def?.tier === 3 ? '#a855f7' : '#10b981';
        return (
          <rect
            key={b.id}
            x={b.gridCol * cellW}
            y={b.gridRow * cellH}
            width={fp.width * cellW}
            height={fp.height * cellH}
            fill={catColor}
            opacity={b.active ? 0.8 : 0.3}
            rx={1}
          />
        );
      })}
      {/* Viewport indicator */}
      <rect
        x={Math.max(0, vpX)}
        y={Math.max(0, vpY)}
        width={Math.min(minimapW - vpX, vpW)}
        height={Math.min(minimapH - vpY, vpH)}
        fill="none"
        stroke={regionColor}
        strokeWidth={1.5}
        opacity={0.8}
        rx={1}
      />
      {/* Border */}
      <rect x={0} y={0} width={minimapW} height={minimapH} fill="none" stroke={regionColor} strokeWidth={1} opacity={0.4} rx={3} />
    </svg>
  );
}

// =============================================
// Terrain Cell Visual Enhancements
// =============================================
function TerrainOverlay({ terrain, cellSize }: { terrain: GridTile['terrain']; cellSize: number }) {
  if (terrain === 'water') {
    return (
      <div className="absolute inset-0 overflow-hidden pointer-events-none rounded-sm">
        {/* Wave animation */}
        <div className="absolute inset-0 bg-blue-500/10" style={{ animation: 'wave 3s ease-in-out infinite' }} />
        <svg className="absolute bottom-0 left-0 w-full h-1/3 opacity-30" viewBox="0 0 20 6" preserveAspectRatio="none">
          <path d="M0,3 Q5,0 10,3 Q15,6 20,3 L20,6 L0,6 Z" fill="#3b82f6">
            <animate attributeName="d" dur="2s" repeatCount="indefinite" values="M0,3 Q5,0 10,3 Q15,6 20,3 L20,6 L0,6 Z;M0,4 Q5,6 10,4 Q15,2 20,4 L20,6 L0,6 Z;M0,3 Q5,0 10,3 Q15,6 20,3 L20,6 L0,6 Z" />
          </path>
        </svg>
      </div>
    );
  }
  if (terrain === 'forest') {
    return (
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-30">
        <Trees className="w-2.5 h-2.5 text-green-500" />
      </div>
    );
  }
  if (terrain === 'mountain') {
    return (
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-25">
        <Mountain className="w-2.5 h-2.5 text-gray-400" />
      </div>
    );
  }
  if (terrain === 'rocky') {
    return (
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20">
        <span className="text-[6px]">⬡</span>
      </div>
    );
  }
  return null;
}

// =============================================
// Enhanced Logistics SVG Overlay (Anchor-Based, Grid-Aligned)
// =============================================
export function LogisticsSVGOverlay({
  routes,
  buildings,
  cellSize,
  regionId,
  selectedBuildingId,
  showThroughputLabels,
  gridWidth,
  gridHeight,
}: {
  routes: LogisticsRoute[];
  buildings: BuildingInstance[];
  cellSize: number;
  regionId: string;
  selectedBuildingId?: string | null;
  showThroughputLabels?: boolean;
  gridWidth: number;
  gridHeight: number;
}) {
  const regionRoutes = useMemo(() => routes.filter(r => {
    const from = buildings.find(b => b.id === r.fromBuildingId);
    const to = buildings.find(b => b.id === r.toBuildingId);
    return from?.regionId === regionId || to?.regionId === regionId;
  }), [routes, buildings, regionId]);

  // Determine which routes are highlighted (connected to selected building)
  const highlightedRouteIds = useMemo(() => {
    if (!selectedBuildingId) return new Set<string>();
    return new Set(
      regionRoutes
        .filter(r => r.fromBuildingId === selectedBuildingId || r.toBuildingId === selectedBuildingId)
        .map(r => r.id)
    );
  }, [selectedBuildingId, regionRoutes]);

  const hasHighlight = highlightedRouteIds.size > 0;

  // ---- Per-building connection distribution ----
  // For each building, track how many routes connect to it and assign each route
  // a slot index so anchors are distributed along the edge instead of clustering.
  const buildingRouteSlots = useMemo(() => {
    const slotMap = new Map<string, Map<string, number>>(); // buildingId -> (routeId -> slotIndex)
    const countMap = new Map<string, number>(); // buildingId -> total route count

    // Count routes per building
    for (const route of regionRoutes) {
      countMap.set(route.fromBuildingId, (countMap.get(route.fromBuildingId) ?? 0) + 1);
      countMap.set(route.toBuildingId, (countMap.get(route.toBuildingId) ?? 0) + 1);
    }

    // Assign slot indices
    const assignedCount = new Map<string, number>();
    for (const route of regionRoutes) {
      // From building
      if (!slotMap.has(route.fromBuildingId)) slotMap.set(route.fromBuildingId, new Map());
      const fromSlot = assignedCount.get(route.fromBuildingId) ?? 0;
      slotMap.get(route.fromBuildingId)!.set(route.id, fromSlot);
      assignedCount.set(route.fromBuildingId, fromSlot + 1);

      // To building
      if (!slotMap.has(route.toBuildingId)) slotMap.set(route.toBuildingId, new Map());
      const toSlot = assignedCount.get(route.toBuildingId) ?? 0;
      slotMap.get(route.toBuildingId)!.set(route.id, toSlot);
      assignedCount.set(route.toBuildingId, toSlot + 1);
    }

    return { slotMap, countMap };
  }, [regionRoutes]);

  // Calculate anchor point on the building edge, distributed for multiple connections
  const getAnchor = useCallback((buildingId: string, targetBuildingId: string, routeId: string): { x: number; y: number } | null => {
    const b = buildings.find(bb => bb.id === buildingId);
    const target = buildings.find(bb => bb.id === targetBuildingId);
    if (!b || b.gridRow === undefined || b.gridCol === undefined) return null;
    if (!target || target.gridRow === undefined || target.gridCol === undefined) return null;

    const fp = getBuildingFootprint(b.type);
    // Building center in grid coordinates
    const cx = (b.gridCol + fp.width / 2) * cellSize;
    const cy = (b.gridRow + fp.height / 2) * cellSize;
    // Target center
    const targetFp = getBuildingFootprint(target.type);
    const tcx = (target.gridCol + targetFp.width / 2) * cellSize;
    const tcy = (target.gridRow + targetFp.height / 2) * cellSize;

    // Direction from building to target
    const dx = tcx - cx;
    const dy = tcy - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist === 0) return { x: cx, y: cy };

    // Find intersection with building bounding box edge
    const halfW = (fp.width * cellSize) / 2;
    const halfH = (fp.height * cellSize) / 2;

    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    let edgeX: number, edgeY: number;
    let edgeSide: 'top' | 'bottom' | 'left' | 'right';
    if (absDx * halfH > absDy * halfW) {
      // Intersects left or right edge
      edgeX = halfW * Math.sign(dx);
      edgeY = (halfW * dy) / absDx;
      edgeSide = dx > 0 ? 'right' : 'left';
    } else {
      // Intersects top or bottom edge
      edgeY = halfH * Math.sign(dy);
      edgeX = (halfH * dx) / absDy;
      edgeSide = dy > 0 ? 'bottom' : 'top';
    }

    // Distribute multiple connections along the edge
    const totalRoutes = buildingRouteSlots.countMap.get(buildingId) ?? 1;
    const slotIndex = buildingRouteSlots.slotMap.get(buildingId)?.get(routeId) ?? 0;

    if (totalRoutes > 1) {
      // Spread connections evenly along the edge with padding from corners
      const spreadFactor = 0.6; // Use 60% of the edge, keeping 20% padding on each side
      const normalizedSlot = (slotIndex + 0.5) / totalRoutes; // 0.0 to 1.0
      const offset = (normalizedSlot - 0.5) * spreadFactor; // -0.3 to 0.3

      const perpX = -dy / dist;
      const perpY = dx / dist;

      if (edgeSide === 'left' || edgeSide === 'right') {
        // Distribute vertically along the left/right edge
        const edgeHeight = fp.height * cellSize;
        const distributedOffset = offset * edgeHeight;
        edgeY = Math.max(-halfH + 4, Math.min(halfH - 4, edgeY + distributedOffset));
      } else {
        // Distribute horizontally along the top/bottom edge
        const edgeWidth = fp.width * cellSize;
        const distributedOffset = offset * edgeWidth;
        edgeX = Math.max(-halfW + 4, Math.min(halfW - 4, edgeX + distributedOffset));
      }
    }

    return { x: cx + edgeX, y: cy + edgeY };
  }, [buildings, cellSize, buildingRouteSlots]);

  // Track route overlap offsets to prevent visual clutter
  const routeOffsetMap = useMemo(() => {
    const pairCount = new Map<string, number>();
    const offsets = new Map<string, number>();
    for (const route of regionRoutes) {
      const key = [route.fromBuildingId, route.toBuildingId].sort().join('->');
      const count = pairCount.get(key) ?? 0;
      pairCount.set(key, count + 1);
      offsets.set(route.id, count);
    }
    return offsets;
  }, [regionRoutes]);

  // Detect route intersection points for junction indicators
  const intersectionPoints = useMemo(() => {
    if (regionRoutes.length < 2) return [];

    // Get all route line segments
    const segments: { id: string; x1: number; y1: number; x2: number; y2: number }[] = [];
    for (const route of regionRoutes) {
      const from = getAnchor(route.fromBuildingId, route.toBuildingId, route.id);
      const to = getAnchor(route.toBuildingId, route.fromBuildingId, route.id);
      if (from && to) {
        segments.push({ id: route.id, x1: from.x, y1: from.y, x2: to.x, y2: to.y });
      }
    }

    // Find intersections between different route segments
    const points: { x: number; y: number; routeIds: string[] }[] = [];
    for (let i = 0; i < segments.length; i++) {
      for (let j = i + 1; j < segments.length; j++) {
        const a = segments[i];
        const b = segments[j];
        if (a.id === b.id) continue;

        // Line segment intersection
        const dx1 = a.x2 - a.x1;
        const dy1 = a.y2 - a.y1;
        const dx2 = b.x2 - b.x1;
        const dy2 = b.y2 - b.y1;
        const denom = dx1 * dy2 - dy1 * dx2;
        if (Math.abs(denom) < 0.001) continue; // Parallel

        const t = ((b.x1 - a.x1) * dy2 - (b.y1 - a.y1) * dx2) / denom;
        const u = ((b.x1 - a.x1) * dy1 - (b.y1 - a.y1) * dx1) / denom;

        if (t >= 0.1 && t <= 0.9 && u >= 0.1 && u <= 0.9) {
          points.push({
            x: a.x1 + t * dx1,
            y: a.y1 + t * dy1,
            routeIds: [a.id, b.id],
          });
        }
      }
    }
    return points;
  }, [regionRoutes, getAnchor]);

  if (regionRoutes.length === 0) return null;

  // Scale factor for consistent visual sizing across zoom levels
  const sf = Math.max(0.6, Math.min(1.2, cellSize / 32));

  return (
    <svg
      className="absolute top-0 left-0 pointer-events-none z-10"
      width={gridWidth}
      height={gridHeight}
      style={{ overflow: 'visible' }}
    >
      <defs>
        <filter id="route-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="route-highlight-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        {/* Arrow markers per route color */}
        <marker id="route-arrow" markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto" markerUnits="strokeWidth">
          <path d="M0,0 L6,2 L0,4 Z" fill="#00fff2" opacity="0.7" />
        </marker>
        <marker id="route-arrow-highlight" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto" markerUnits="strokeWidth">
          <path d="M0,0 L8,3 L0,6 Z" fill="#22d3ee" opacity="0.9" />
        </marker>
        {/* Junction indicator filter */}
        <filter id="junction-glow" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      {regionRoutes.map(route => {
        const from = getAnchor(route.fromBuildingId, route.toBuildingId, route.id);
        const to = getAnchor(route.toBuildingId, route.fromBuildingId, route.id);
        if (!from || !to) return null;

        const meta = RESOURCE_META[route.carriesResource];
        const color = meta?.color ?? '#00fff2';
        const isHighlighted = highlightedRouteIds.has(route.id);
        const isDimmed = hasHighlight && !isHighlighted;

        // Efficiency color coding
        const effStroke = route.efficiency >= 0.8 ? color : route.efficiency >= 0.5 ? '#facc15' : '#f87171';

        // Route offset for overlapping same-pair routes
        const routeIdx = routeOffsetMap.get(route.id) ?? 0;
        const offsetPerRoute = 4 * sf; // px offset per overlapping route

        // Midpoint with offset for overlapping routes
        const mx = (from.x + to.x) / 2;
        const my = (from.y + to.y) / 2;
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Perpendicular offset for overlapping routes
        const perpX = dist > 0 ? (-dy / dist) * (routeIdx * offsetPerRoute) : 0;
        const perpY = dist > 0 ? (dx / dist) * (routeIdx * offsetPerRoute) : 0;

        // Curve strength: stronger curve for longer routes, offset for overlapping
        const curveStrength = Math.min(0.2, 0.08 + dist * 0.0003) + routeIdx * 0.05;
        const qx = mx + perpX - dy * curveStrength;
        const qy = my + perpY + dx * curveStrength;

        const path = `M${from.x},${from.y} Q${qx},${qy} ${to.x},${to.y}`;

        // Scale-independent stroke width
        const baseStroke = isHighlighted ? 2.5 : 1.5;
        const strokeWidth = baseStroke * sf;

        return (
          <g key={route.id} opacity={isDimmed ? 0.12 : 1}>
            {/* Shadow / glow path */}
            <path
              d={path}
              fill="none"
              stroke={color}
              strokeWidth={strokeWidth + 2}
              opacity={0.08}
            />
            {/* Main route line */}
            <path
              d={path}
              fill="none"
              stroke={effStroke}
              strokeWidth={strokeWidth}
              opacity={route.active ? (isHighlighted ? 0.85 : 0.25 + route.efficiency * 0.4) : 0.12}
              strokeDasharray={route.active ? 'none' : '5 3'}
              strokeLinecap="round"
              markerEnd={route.active && !isDimmed ? (isHighlighted ? 'url(#route-arrow-highlight)' : 'url(#route-arrow)') : undefined}
              filter={isHighlighted ? 'url(#route-highlight-glow)' : route.efficiency >= 0.8 ? 'url(#route-glow)' : undefined}
            />
            {/* Route type icon at curve point */}
            <text
              x={qx}
              y={qy - 5 * sf}
              textAnchor="middle"
              fontSize={Math.max(8, Math.min(12, cellSize * 0.35))}
              opacity={isHighlighted ? 1 : 0.6}
            >
              {ROUTE_TYPE_ICON[route.routeType] ?? '🔗'}
            </text>
            {/* Throughput label on hover/selected */}
            {(isHighlighted || showThroughputLabels) && (
              <text
                x={qx}
                y={qy + 8 * sf}
                textAnchor="middle"
                fontSize={Math.max(6, Math.min(9, cellSize * 0.25))}
                fill={color}
                opacity="0.9"
                fontWeight="bold"
              >
                {meta?.emoji ?? ''} {formatNumber(route.throughput)}/t
              </text>
            )}
            {/* Anchor dots at connection points — always show small dots, bigger when highlighted */}
            <circle
              cx={from.x}
              cy={from.y}
              r={isHighlighted ? 3 * sf : 2 * sf}
              fill={isHighlighted ? color : color}
              opacity={isHighlighted ? 0.9 : 0.4}
              stroke={isHighlighted ? '#fff' : 'none'}
              strokeWidth={isHighlighted ? 0.5 : 0}
            />
            <circle
              cx={to.x}
              cy={to.y}
              r={isHighlighted ? 3 * sf : 2 * sf}
              fill={isHighlighted ? color : color}
              opacity={isHighlighted ? 0.9 : 0.4}
              stroke={isHighlighted ? '#fff' : 'none'}
              strokeWidth={isHighlighted ? 0.5 : 0}
            />
            {/* Animated flow particles - only for active routes */}
            {route.active && !isDimmed && [0, 0.33, 0.66].map((offset, j) => (
              <circle
                key={j}
                r={isHighlighted ? 2.5 * sf : 1.5 * sf}
                fill={color}
                opacity={isHighlighted ? 0.9 : 0.6}
              >
                <animateMotion
                  dur={`${1.5 + (1 - route.efficiency) * 1}s`}
                  repeatCount="indefinite"
                  begin={`${offset * 1.5}s`}
                  path={path}
                />
              </circle>
            ))}
          </g>
        );
      })}
      {/* Junction indicators at route intersections */}
      {intersectionPoints.map((pt, i) => (
        <g key={`junction-${i}`}>
          <circle
            cx={pt.x}
            cy={pt.y}
            r={3 * sf}
            fill="#f59e0b"
            opacity={0.5}
            filter="url(#junction-glow)"
          />
          <circle
            cx={pt.x}
            cy={pt.y}
            r={1.5 * sf}
            fill="#fbbf24"
            opacity={0.8}
          />
          {/* Diamond shape for junction */}
          <polygon
            points={`${pt.x},${pt.y - 4 * sf} ${pt.x + 3 * sf},${pt.y} ${pt.x},${pt.y + 4 * sf} ${pt.x - 3 * sf},${pt.y}`}
            fill="none"
            stroke="#fbbf24"
            strokeWidth={0.8 * sf}
            opacity={0.6}
          />
        </g>
      ))}
    </svg>
  );
}

// =============================================
// Logistics Route Overlay (panel)
// =============================================
function LogisticsRouteOverlay() {
  const store = useGameStore();
  const activeRegion = store.activeRegion ?? 'grasslands';
  const region = (store.mapRegions.length > 0 ? store.mapRegions : INITIAL_REGIONS).find(r => r.id === activeRegion);
  const routes = store.logisticsRoutes;
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [addRouteMode, setAddRouteMode] = useState(false);
  const [routeSourceId, setRouteSourceId] = useState<string | null>(null);
  const [routeDestId, setRouteDestId] = useState<string | null>(null);

  const regionBuildings = store.buildings.filter(b => b.regionId === activeRegion && b.gridRow !== undefined && b.gridCol !== undefined);
  const regionRoutes = routes.filter(r => {
    const from = store.buildings.find(b => b.id === r.fromBuildingId);
    const to = store.buildings.find(b => b.id === r.toBuildingId);
    return from?.regionId === activeRegion || to?.regionId === activeRegion;
  });

  if (!region) return null;

  const handleBuildingClickForRoute = (buildingId: string) => {
    if (!addRouteMode) return;
    if (!routeSourceId) {
      setRouteSourceId(buildingId);
    } else if (!routeDestId && buildingId !== routeSourceId) {
      setRouteDestId(buildingId);
      const fromDef = BUILDING_DEFS[store.buildings.find(b => b.id === routeSourceId)?.type ?? ''];
      const toDef = BUILDING_DEFS[store.buildings.find(b => b.id === buildingId)?.type ?? ''];
      if (fromDef?.outputs && toDef?.inputs) {
        const matchingResource = fromDef.outputs.find(o => o.resource !== 'money' && toDef.inputs.some(i => i.resource === o.resource));
        if (matchingResource) {
          store.addLogisticsRoute(routeSourceId, buildingId, matchingResource.resource as ResourceType);
        }
      }
      setRouteSourceId(null);
      setRouteDestId(null);
      setAddRouteMode(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant={addRouteMode ? 'default' : 'outline'} size="sm" className={`h-7 text-[10px] ${addRouteMode ? 'bg-cyan-700 hover:bg-cyan-600' : 'border-cyan-800/50 text-cyan-400'}`} onClick={() => { setAddRouteMode(!addRouteMode); setRouteSourceId(null); setRouteDestId(null); }}>
          <Route className="w-3 h-3 mr-1" /> {addRouteMode ? 'Click Source → Dest' : 'Add Route'}
        </Button>
        <span className="text-[10px] text-gray-500">{regionRoutes.length} route{regionRoutes.length !== 1 ? 's' : ''} in region</span>
        {addRouteMode && routeSourceId && <span className="text-[10px] text-yellow-400">Now click destination building...</span>}
      </div>
      {regionRoutes.length > 0 && (
        <div className="space-y-1 max-h-64 overflow-y-auto game-scrollbar">
          {regionRoutes.map(route => {
            const fromBuilding = store.buildings.find(b => b.id === route.fromBuildingId);
            const toBuilding = store.buildings.find(b => b.id === route.toBuildingId);
            const fromDef = fromBuilding ? BUILDING_DEFS[fromBuilding.type] : null;
            const toDef = toBuilding ? BUILDING_DEFS[toBuilding.type] : null;
            const meta = RESOURCE_META[route.carriesResource];
            const isSelected = selectedRouteId === route.id;
            const effColor = route.efficiency >= 0.8 ? 'text-green-400' : route.efficiency >= 0.5 ? 'text-yellow-400' : 'text-red-400';
            return (
              <div key={route.id} className={`p-2 rounded-md border transition-colors cursor-pointer ${isSelected ? 'border-cyan-500/50 bg-cyan-900/20' : 'border-gray-800 bg-gray-900/40 hover:bg-gray-800/40'}`} onClick={() => setSelectedRouteId(isSelected ? null : route.id)}>
                <div className="flex items-center gap-1.5 text-[10px]">
                  <span>{fromDef?.emoji}</span>
                  <ChevronRight className="w-3 h-3 text-gray-500" />
                  <span>{ROUTE_TYPE_ICON[route.routeType] ?? '🔗'}</span>
                  <ChevronRight className="w-3 h-3 text-gray-500" />
                  <span>{toDef?.emoji}</span>
                  <div className="ml-auto flex items-center gap-1">
                    <span className={`text-[9px] ${effColor}`}>●</span>
                    <span className="text-[9px]" style={{ color: meta?.color }}>{meta?.emoji} {meta?.name}</span>
                  </div>
                </div>
                {isSelected && (
                  <div className="mt-1.5 flex items-center gap-2 text-[9px] text-gray-400">
                    <span className={effColor}>Eff: {Math.round(route.efficiency * 100)}%</span>
                    <span>Throughput: {formatNumber(route.throughput)}/t</span>
                    <span>{route.active ? '🟢 Active' : '🔴 Inactive'}</span>
                    <Button variant="ghost" size="sm" className="h-5 text-[9px] text-red-400 hover:text-red-300 hover:bg-red-900/20 ml-auto" onClick={(e) => { e.stopPropagation(); store.removeLogisticsRoute(route.id); }}>
                      <Trash2 className="w-2.5 h-2.5 mr-0.5" /> Remove
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {addRouteMode && (
        <div className="space-y-1 max-h-48 overflow-y-auto game-scrollbar border border-cyan-900/30 rounded-lg p-2 bg-gray-900/60">
          <div className="text-[10px] text-cyan-400 font-semibold mb-1">Buildings in region — click to select</div>
          {regionBuildings.map(b => {
            const bDef = BUILDING_DEFS[b.type];
            if (!bDef) return null;
            const isSource = routeSourceId === b.id;
            return (
              <button key={b.id} className={`w-full text-left p-1.5 rounded-md border text-[10px] transition-colors ${isSource ? 'border-cyan-500/50 bg-cyan-900/20' : 'border-gray-800 bg-gray-800/30 hover:bg-gray-700/40'}`} onClick={() => handleBuildingClickForRoute(b.id)}>
                <div className="flex items-center gap-1.5">
                  <span>{bDef.emoji}</span>
                  <span className="text-gray-300">{bDef.name}</span>
                  <span className="text-gray-600">Lv{b.level}</span>
                  {isSource && <Badge className="text-[6px] bg-cyan-800 text-cyan-300 border-0">Source</Badge>}
                </div>
              </button>
            );
          })}
        </div>
      )}
      <div className="text-center text-[10px] text-gray-600 p-4">
        <Route className="w-5 h-5 mx-auto mb-1 text-gray-700" /> Route lines display on the Grid view
      </div>
    </div>
  );
}

// =============================================
// Grid Factory View (Enhanced)
// =============================================
function GridFactoryView() {
  const store = useGameStore();
  const activeRegion = store.activeRegion ?? 'grasslands';
  const region = (store.mapRegions.length > 0 ? store.mapRegions : INITIAL_REGIONS).find(r => r.id === activeRegion);
  const grid = store.mapGrids[activeRegion] ?? [];

  // Zoom state: percentage-based, 50% to 200%
  const [zoomPct, setZoomPct] = useState(100);
  const [hoveredCell, setHoveredCell] = useState<{ row: number; col: number } | null>(null);
  const [pendingBuildType, setPendingBuildType] = useState<BuildingType | null>(null);
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(null);
  const [mobilePaletteOpen, setMobilePaletteOpen] = useState(false);
  const [showLogisticsOverlay, setShowLogisticsOverlay] = useState(true);
  const [showThroughputLabels, setShowThroughputLabels] = useState(false);

  // Pan state
  const [isPanning, setIsPanning] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const panStart = useRef<{ x: number; y: number; scrollLeft: number; scrollTop: number } | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const gridContainerRef = useRef<HTMLDivElement>(null);

  // Base cell size - all grid content renders at this size, then scales via CSS transform
  const BASE_CELL_SIZE = 32;

  // Mobile detection
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Scroll position for minimap
  const [scrollPos, setScrollPos] = useState({ left: 0, top: 0, clientW: 0, clientH: 0 });
  const updateScrollPos = useCallback(() => {
    const el = scrollContainerRef.current;
    if (el) {
      setScrollPos({ left: el.scrollLeft, top: el.scrollTop, clientW: el.clientWidth, clientH: el.clientHeight });
    }
  }, []);

  const rows = region?.gridRows ?? 16;
  const cols = region?.gridCols ?? 20;

  // The cell size used for ALL rendering (grid cells, SVG, labels)
  // Zoom is applied via CSS transform: scale() on the entire grid content wrapper
  // This guarantees pixel-perfect alignment between grid and logistics SVG at all zoom levels
  const cellSize = BASE_CELL_SIZE;
  // The zoom scale factor for CSS transform
  const zoomScale = zoomPct / 100;

  // Buildings placed in this region
  const regionBuildings = useMemo(() => store.buildings.filter(b => b.regionId === activeRegion), [store.buildings, activeRegion]);

  const buildingMap = useMemo(() => {
    const m = new Map<string, BuildingInstance>();
    regionBuildings.forEach(b => m.set(b.id, b));
    return m;
  }, [regionBuildings]);

  const selectedBuilding = selectedBuildingId ? buildingMap.get(selectedBuildingId) ?? null : null;

  // Grid tile lookup (memoized)
  const tileMap = useMemo(() => {
    const m = new Map<string, GridTile>();
    for (const t of grid) {
      m.set(`${t.row}-${t.col}`, t);
    }
    return m;
  }, [grid]);

  // Building position lookup (memoized)
  const buildingAtCellMap = useMemo(() => {
    const m = new Map<string, BuildingInstance>();
    for (const b of regionBuildings) {
      if (b.gridRow === undefined || b.gridCol === undefined) continue;
      const fp = getBuildingFootprint(b.type);
      for (let dr = 0; dr < fp.height; dr++) {
        for (let dc = 0; dc < fp.width; dc++) {
          m.set(`${b.gridRow + dr}-${b.gridCol + dc}`, b);
        }
      }
    }
    return m;
  }, [regionBuildings]);

  const getBuildingAtCell = (row: number, col: number): BuildingInstance | null => {
    return buildingAtCellMap.get(`${row}-${col}`) ?? null;
  };

  const getTile = (row: number, col: number): GridTile | undefined => tileMap.get(`${row}-${col}`);

  const getConnectionCount = useCallback((buildingId: string): number => {
    return store.logisticsRoutes.filter(r => r.fromBuildingId === buildingId || r.toBuildingId === buildingId).length;
  }, [store.logisticsRoutes]);

  // Routes connected to selected building
  const connectedBuildingIds = useMemo(() => {
    if (!selectedBuildingId) return new Set<string>();
    const ids = new Set<string>();
    ids.add(selectedBuildingId);
    for (const r of store.logisticsRoutes) {
      if (r.fromBuildingId === selectedBuildingId) ids.add(r.toBuildingId);
      if (r.toBuildingId === selectedBuildingId) ids.add(r.fromBuildingId);
    }
    return ids;
  }, [selectedBuildingId, store.logisticsRoutes]);

  const handleCellClick = (row: number, col: number) => {
    const mode = store.mapViewMode;
    if (mode === 'demolish') {
      const b = getBuildingAtCell(row, col);
      if (b) { store.removeBuildingFromGrid(b.id); setSelectedBuildingId(null); }
      return;
    }
    if (mode === 'build' && pendingBuildType) {
      const canPlace = store.canPlaceBuilding(pendingBuildType, activeRegion, row, col);
      if (canPlace) {
        store.buildBuilding(pendingBuildType);
        const newBuilding = store.buildings[store.buildings.length - 1];
        if (newBuilding) { store.placeBuildingOnGrid(newBuilding.id, activeRegion, row, col); }
        setPendingBuildType(null);
      }
      return;
    }
    const b = getBuildingAtCell(row, col);
    if (b) {
      setSelectedBuildingId(prev => prev === b.id ? null : b.id);
      store.selectBuilding(b.id);
    } else {
      setSelectedBuildingId(null);
      store.selectBuilding(null);
    }
  };

  const isPlacementValid = (row: number, col: number): boolean => {
    if (!pendingBuildType) return false;
    return store.canPlaceBuilding(pendingBuildType, activeRegion, row, col);
  };

  // --- Zoom handlers ---
  const ZOOM_STEP = 10;
  const ZOOM_MIN = 50;
  const ZOOM_MAX = 200;

  const handleZoomIn = useCallback(() => {
    setZoomPct(z => Math.min(ZOOM_MAX, Math.round((z + ZOOM_STEP) / ZOOM_STEP) * ZOOM_STEP));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoomPct(z => Math.max(ZOOM_MIN, Math.round((z - ZOOM_STEP) / ZOOM_STEP) * ZOOM_STEP));
  }, []);

  const handleResetView = useCallback(() => {
    setZoomPct(100);
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({ left: 0, top: 0, behavior: 'smooth' });
    }
  }, []);

  // Fit to screen: calculate zoom so the entire grid fits in the viewport
  const handleFitToScreen = () => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const availW = container.clientWidth - 8;
    const availH = container.clientHeight - 8;
    const gridW = cols * BASE_CELL_SIZE + labelSize + 8;
    const gridH = rows * BASE_CELL_SIZE + labelSize + 8;
    const fitPct = Math.min(200, Math.max(50, Math.floor(Math.min(availW / gridW, availH / gridH) * 100 / ZOOM_STEP) * ZOOM_STEP));
    setZoomPct(fitPct);
    requestAnimationFrame(() => {
      container.scrollTo({ left: 0, top: 0, behavior: 'smooth' });
    });
  };

  // Pan by dragging - left click drag in view mode, middle mouse / Alt+drag / Space+drag always
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Left click in view/route mode on empty area, or middle mouse, or Alt+click, or Space+click
    const isViewMode = store.mapViewMode === 'view' || store.mapViewMode === 'route';
    const canPan = e.button === 1 || (e.button === 0 && e.altKey) || (e.button === 0 && spaceHeld) || (e.button === 0 && isViewMode);
    if (canPan) {
      e.preventDefault();
      const container = scrollContainerRef.current;
      if (!container) return;
      setIsPanning(true);
      panStart.current = { x: e.clientX, y: e.clientY, scrollLeft: container.scrollLeft, scrollTop: container.scrollTop };
    }
  }, [spaceHeld, store.mapViewMode]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning && panStart.current) {
      const container = scrollContainerRef.current;
      if (!container) return;
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      container.scrollLeft = panStart.current.scrollLeft - dx;
      container.scrollTop = panStart.current.scrollTop - dy;
    }
  }, [isPanning]);

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
    panStart.current = null;
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const container = scrollContainerRef.current;
      if (!container) return;
      const PAN_STEP = 60;

      // Space bar for panning
      if (e.key === ' ' && !e.repeat) {
        e.preventDefault();
        setSpaceHeld(true);
        return;
      }

      // Ctrl+= or Ctrl++ to zoom in
      if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) { handleZoomIn(); e.preventDefault(); }
      // Ctrl+- to zoom out
      else if ((e.ctrlKey || e.metaKey) && e.key === '-') { handleZoomOut(); e.preventDefault(); }
      // Ctrl+0 to reset zoom
      else if ((e.ctrlKey || e.metaKey) && e.key === '0') { handleResetView(); e.preventDefault(); }
      else if (e.key === 'ArrowLeft') { container.scrollLeft -= PAN_STEP; e.preventDefault(); }
      else if (e.key === 'ArrowRight') { container.scrollLeft += PAN_STEP; e.preventDefault(); }
      else if (e.key === 'ArrowUp') { container.scrollTop -= PAN_STEP; e.preventDefault(); }
      else if (e.key === 'ArrowDown') { container.scrollTop += PAN_STEP; e.preventDefault(); }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ') {
        setSpaceHeld(false);
        setIsPanning(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => { window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('keyup', handleKeyUp); };
  }, [handleZoomIn, handleZoomOut, handleResetView]);

  // Scroll observer for minimap
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(updateScrollPos);
    observer.observe(el);
    el.addEventListener('scroll', updateScrollPos);
    return () => { observer.disconnect(); el.removeEventListener('scroll', updateScrollPos); };
  }, [updateScrollPos]);

  // Non-passive wheel handler for zoom (preventDefault requires non-passive)
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    const handler = (e: WheelEvent) => {
      // If Ctrl is held, let browser handle normal scrolling
      if (e.ctrlKey || e.metaKey) return;
      // Otherwise, prevent default scroll and zoom instead
      e.preventDefault();

      const rect = el.getBoundingClientRect();
      const scrollRatioX = el.scrollLeft / (el.scrollWidth - el.clientWidth || 1);
      const scrollRatioY = el.scrollTop / (el.scrollHeight - el.clientHeight || 1);

      const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
      setZoomPct(prev => {
        const newZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round((prev + delta) / ZOOM_STEP) * ZOOM_STEP));
        requestAnimationFrame(() => {
          const newScrollX = scrollRatioX * (el.scrollWidth - el.clientWidth);
          const newScrollY = scrollRatioY * (el.scrollHeight - el.clientHeight);
          el.scrollTo(newScrollX, newScrollY);
        });
        return newZoom;
      });
    };

    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  // Minimap click handler
  const handleMinimapClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const ratioX = x / rect.width;
    const ratioY = y / rect.height;
    const targetScrollLeft = ratioX * (container.scrollWidth - container.clientWidth);
    const targetScrollTop = ratioY * (container.scrollHeight - container.clientHeight);
    container.scrollTo({ left: targetScrollLeft, top: targetScrollTop, behavior: 'smooth' });
  }, []);

  // Auto-Layout
  const handleAutoLayout = () => {
    if (typeof store.autoGenerateLogisticsRoutes === 'function') {
      store.autoGenerateLogisticsRoutes();
      toast({ title: '🔄 Auto-Layout', description: 'Logistics routes generated automatically!' });
    } else {
      toast({ title: '🔄 Auto-Layout', description: 'Auto-generate routes not yet available.' });
    }
  };

  // Auto-Arrange
  const handleAutoArrange = () => {
    const buildingsWithPositions = regionBuildings
      .filter(b => b.gridRow !== undefined && b.gridCol !== undefined)
      .map(b => ({ id: b.id, type: b.type, gridRow: b.gridRow!, gridCol: b.gridCol! }));
    if (buildingsWithPositions.length === 0) { toast({ title: '📐 Auto-Arrange', description: 'No buildings to arrange.' }); return; }

    interface BuildingGroup { id: string; type: BuildingType; tier: number; category: string; outputs: string[]; inputs: string[] }
    const buildGroups: BuildingGroup[] = buildingsWithPositions.map(b => {
      const bdef = BUILDING_DEFS[b.type];
      return { id: b.id, type: b.type, tier: bdef?.tier ?? 0, category: bdef?.category ?? 'factory', outputs: bdef?.outputs?.map(o => o.resource) ?? [], inputs: bdef?.inputs?.map(i => i.resource) ?? [] };
    });
    const sortedGroups = [...buildGroups].sort((a, b) => {
      const aRange = getTierRowRange(a.category, a.tier);
      const bRange = getTierRowRange(b.category, b.tier);
      if (aRange[0] !== bRange[0]) return aRange[0] - bRange[0];
      if (a.outputs.some(o => b.inputs.includes(o))) return -1;
      if (b.outputs.some(o => a.inputs.includes(o))) return 1;
      if (a.category !== b.category) { const catOrder: Record<string, number> = { extractor: 0, power: 1, factory: 2, storage: 3 }; return (catOrder[a.category] ?? 2) - (catOrder[b.category] ?? 2); }
      return 0;
    });
    let currentRow = 0;
    let currentCol = 0;
    const occupiedCells = new Set<string>();
    for (const group of sortedGroups) {
      const fp = getBuildingFootprint(group.type);
      const range = getTierRowRange(group.category, group.tier);
      if (currentRow < range[0]) { currentRow = range[0]; currentCol = 0; }
      let placed = false;
      for (let r = currentRow; r < Math.min(range[1], rows) && !placed; r++) {
        for (let c = (r === currentRow ? currentCol : 0); c <= cols - fp.width && !placed; c++) {
          let canPlaceHere = true;
          for (let dr = 0; dr < fp.height && canPlaceHere; dr++) {
            for (let dc = 0; dc < fp.width && canPlaceHere; dc++) {
              const tr = r + dr; const tc = c + dc;
              const tTile = grid.find(t => t.row === tr && t.col === tc);
              if (tr >= rows || tc >= cols || occupiedCells.has(`${tr}-${tc}`) || tTile?.terrain === 'water') canPlaceHere = false;
            }
          }
          if (canPlaceHere) {
            store.removeBuildingFromGrid(group.id);
            store.placeBuildingOnGrid(group.id, activeRegion, r, c);
            for (let dr = 0; dr < fp.height; dr++) for (let dc = 0; dc < fp.width; dc++) occupiedCells.add(`${r + dr}-${c + dc}`);
            currentRow = r; currentCol = c + fp.width;
            if (currentCol >= cols) { currentCol = 0; currentRow++; }
            placed = true;
          }
        }
        currentCol = 0;
      }
    }
    toast({ title: '📐 Auto-Arrange', description: `Arranged ${buildingsWithPositions.length} buildings by production tier!` });
    setSelectedBuildingId(null);
  };

  // Available building types
  const allowedCategories = region?.allowedCategories ?? [];
  const maxBuildingSize = region?.maxBuildingSize ?? 2;
  const availableTypes: BuildingType[] = [];
  for (const [key, def] of Object.entries(BUILDING_DEFS)) {
    if (allowedCategories.includes(def.category)) {
      const fp = getBuildingFootprint(key);
      if (fp.width <= maxBuildingSize && fp.height <= maxBuildingSize) availableTypes.push(key as BuildingType);
    }
  }
  const paletteGroups: { label: string; types: BuildingType[] }[] = [];
  for (const cat of BUILD_CATEGORIES) {
    const filtered = availableTypes.filter(t => BUILDING_DEFS[t]?.category === cat.key);
    if (filtered.length > 0) paletteGroups.push({ label: cat.label, types: filtered });
  }
  const isAffordable = (type: BuildingType) => { const def = BUILDING_DEFS[type]; if (!def) return false; return def.baseCost.every(c => c.resource !== 'money' || store.money >= c.amount); };
  const isUnlocked = (type: BuildingType) => { const def = BUILDING_DEFS[type]; if (!def?.unlockRequirement) return true; if (def.unlockRequirement.research && !store.completedResearch.includes(def.unlockRequirement.research)) return false; return true; };

  if (!region) return <div className="text-center text-gray-500 p-8">Region not found</div>;

  // Stats for bottom bar
  const activeRoutes = store.logisticsRoutes.filter(r => {
    const from = store.buildings.find(b => b.id === r.fromBuildingId);
    const to = store.buildings.find(b => b.id === r.toBuildingId);
    return (from?.regionId === activeRegion || to?.regionId === activeRegion) && r.active;
  }).length;
  const regionEfficiency = regionBuildings.length > 0 ? Math.round(regionBuildings.filter(b => b.active).reduce((sum, b) => sum + b.efficiency, 0) / regionBuildings.filter(b => b.active).length * 100) : 0;

  // Pending building footprint for preview
  const pendingFootprint = pendingBuildType ? getBuildingFootprint(pendingBuildType) : null;

  const sidebarContent = (
    <AnimatePresence mode="wait">
      {selectedBuilding ? (
        <SelectedBuildingDetail key="detail" building={selectedBuilding} connectionCount={getConnectionCount(selectedBuilding.id)} onClose={() => { setSelectedBuildingId(null); store.selectBuilding(null); }} />
      ) : store.mapViewMode === 'build' ? (
        <BuildPalette key="palette" groups={paletteGroups} pendingType={pendingBuildType} onSelectType={setPendingBuildType} isAffordable={isAffordable} isUnlocked={isUnlocked} />
      ) : (
        <div className="text-center text-gray-500 text-xs p-4">
          <Eye className="w-6 h-6 mx-auto mb-2 text-gray-600" />
          <p>Switch to Build mode to place buildings</p>
          <p className="mt-1 text-gray-600">Click any building to see details</p>
        </div>
      )}
    </AnimatePresence>
  );

  // Total grid dimensions for minimap calculation (in screen pixels, after zoom scaling)
  const totalGridWidth = cols * cellSize * zoomScale;
  const totalGridHeight = rows * cellSize * zoomScale;

  // Base label size (renders at base cell size, scales with transform)
  const labelSize = 20;

  return (
    <div className={`flex ${isMobile ? 'flex-col' : 'gap-3'} h-full`}>
      {/* Grid Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Breadcrumb + toolbar */}
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          {/* Breadcrumb */}
          <div className="flex items-center gap-1 text-[10px] mr-1">
            <button className="text-gray-500 hover:text-cyan-400 transition-colors" onClick={() => store.setMapViewLayer('region')}>
              <MapIcon className="w-3 h-3 inline mr-0.5" />World Map
            </button>
            <ChevronRight className="w-2.5 h-2.5 text-gray-600" />
            <span style={{ color: region.color }}>{region.emoji} {region.name}</span>
          </div>

          {/* Divider */}
          <div className="w-px h-4 bg-gray-700" />

          {/* Zoom controls group */}
          <div className="flex items-center bg-gray-900/60 rounded-md border border-gray-800 overflow-hidden">
            <TooltipProvider delayDuration={400}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-gray-400 hover:text-gray-200 rounded-none" onClick={handleZoomOut} disabled={zoomPct <= ZOOM_MIN}>
                    <ZoomOut className="w-3.5 h-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-[9px] bg-gray-900 border-gray-700">Zoom Out (Ctrl+-)</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider delayDuration={400}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className="h-6 px-1.5 text-[9px] text-gray-300 font-mono hover:bg-gray-800/40 cursor-pointer border-x border-gray-800 min-w-[32px] text-center"
                    onClick={handleResetView}
                  >
                    {zoomPct}%
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-[9px] bg-gray-900 border-gray-700">Click to reset zoom (Ctrl+0)</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider delayDuration={400}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-gray-400 hover:text-gray-200 rounded-none" onClick={handleZoomIn} disabled={zoomPct >= ZOOM_MAX}>
                    <ZoomIn className="w-3.5 h-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-[9px] bg-gray-900 border-gray-700">Zoom In (Ctrl+=)</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider delayDuration={400}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-gray-400 hover:text-gray-200 rounded-none" onClick={handleFitToScreen} title="Fit to screen">
                    <RotateCcw className="w-3 h-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-[9px] bg-gray-900 border-gray-700">Fit to Screen</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          {/* Divider */}
          <div className="w-px h-4 bg-gray-700" />

          {/* Layer toggle group */}
          <div className="flex items-center bg-gray-900/60 rounded-md border border-gray-800 overflow-hidden">
            <Button
              variant="ghost"
              size="sm"
              className={`h-6 px-1.5 text-[9px] rounded-none ${store.mapViewLayer === 'region' ? 'text-cyan-400 bg-cyan-900/20' : 'text-gray-500 hover:text-gray-300'}`}
              onClick={() => store.setMapViewLayer('region')}
            >
              <MapIcon className="w-3 h-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={`h-6 px-1.5 text-[9px] rounded-none ${store.mapViewLayer === 'grid' ? 'text-cyan-400 bg-cyan-900/20' : 'text-gray-500 hover:text-gray-300'}`}
              onClick={() => store.setMapViewLayer('grid')}
            >
              <Grid3X3 className="w-3 h-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={`h-6 px-1.5 text-[9px] rounded-none ${showLogisticsOverlay ? 'text-cyan-400 bg-cyan-900/20' : 'text-gray-500 hover:text-gray-300'}`}
              onClick={() => setShowLogisticsOverlay(v => !v)}
            >
              <Route className="w-3 h-3" />
            </Button>
          </div>

          {/* Divider */}
          <div className="w-px h-4 bg-gray-700" />

          {/* Mode toggle group */}
          <div className="flex items-center bg-gray-900/60 rounded-md border border-gray-800 overflow-hidden">
            {([
              { key: 'view' as MapViewMode, icon: <Eye className="w-3 h-3" />, label: 'View', activeClass: 'text-gray-300 bg-gray-800/40' },
              { key: 'build' as MapViewMode, icon: <Hammer className="w-3 h-3" />, label: 'Build', activeClass: 'text-amber-400 bg-amber-900/20' },
              { key: 'route' as MapViewMode, icon: <Route className="w-3 h-3" />, label: 'Route', activeClass: 'text-cyan-400 bg-cyan-900/20' },
              { key: 'demolish' as MapViewMode, icon: <Trash2 className="w-3 h-3" />, label: 'Demolish', activeClass: 'text-red-400 bg-red-900/20' },
            ] as const).map(mode => (
              <TooltipProvider key={mode.key} delayDuration={400}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className={`h-6 px-1.5 text-[9px] rounded-none ${store.mapViewMode === mode.key ? mode.activeClass : 'text-gray-500 hover:text-gray-300'}`}
                      onClick={() => store.setMapViewMode(mode.key)}
                    >
                      {mode.icon}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-[9px] bg-gray-900 border-gray-700">{mode.label}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ))}
          </div>

          {/* Divider */}
          <div className="w-px h-4 bg-gray-700" />

          {/* Action buttons */}
          <Button variant="outline" size="sm" className="h-6 text-[9px] border-cyan-800/50 text-cyan-400 hover:bg-cyan-900/20" onClick={handleAutoLayout}>
            <Wand2 className="w-3 h-3 mr-1" /> Auto-Layout
          </Button>
          <Button variant="outline" size="sm" className="h-6 text-[9px] border-purple-800/50 text-purple-400 hover:bg-purple-900/20" onClick={handleAutoArrange}>
            <LayoutGrid className="w-3 h-3 mr-1" /> Auto-Arrange
          </Button>
          <Button variant="outline" size="sm" className="h-6 text-[9px] border-amber-800/50 text-amber-400 hover:bg-amber-900/20" onClick={() => {
            store.autoAssignAllBuildings();
            // Switch to the region with the most buildings after auto-assign
            const currentStore = useGameStore.getState();
            const regions = currentStore.mapRegions.length > 0 ? currentStore.mapRegions : INITIAL_REGIONS;
            let bestRegion: RegionId = 'grasslands';
            let bestCount = 0;
            for (const r of regions) {
              const count = currentStore.buildings.filter(b => b.regionId === r.id).length;
              if (count > bestCount) { bestCount = count; bestRegion = r.id; }
            }
            // Directly set active region + layer (bypass unlock check since auto-assign unlocks all)
            useGameStore.setState({ activeRegion: bestRegion, mapViewLayer: 'grid' });
            const regionName = regions.find(r => r.id === bestRegion)?.name ?? bestRegion;
            toast({ title: '📍 Auto-Assign', description: `Buildings assigned! Viewing ${regionName} (${bestCount} buildings)` });
          }}>
            <MapPin className="w-3 h-3 mr-1" /> Auto-Assign
          </Button>

          {/* Mobile palette toggle */}
          {isMobile && store.mapViewMode === 'build' && (
            <Button variant="outline" size="sm" className="h-6 text-[9px] border-amber-800/50 text-amber-400 hover:bg-amber-900/20 ml-auto" onClick={() => setMobilePaletteOpen(true)}>
              <Hammer className="w-3 h-3 mr-1" /> Palette
            </Button>
          )}

          {!isMobile && <div className="ml-auto text-[10px] text-gray-500">{region.emoji} {region.name} • {regionBuildings.length} building{regionBuildings.length !== 1 ? 's' : ''}</div>}
        </div>

        {/* Scrollable grid container */}
        <div className="flex-1 relative overflow-hidden">
          <div
            ref={scrollContainerRef}
            className="w-full h-full overflow-auto game-scrollbar rounded-lg border-2 bg-gray-900/50 scroll-smooth"
            style={{ borderColor: `${region.color}40` }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onScroll={updateScrollPos}
          >
            {/* Outer spacer: defines scrollable area at scaled size */}
            <div style={{ width: (cols * cellSize + labelSize + 8) * zoomScale, height: (rows * cellSize + labelSize + 8) * zoomScale, position: 'relative' }}>
              {/* Transform-scaled content wrapper: renders everything at BASE_CELL_SIZE and scales uniformly */}
              <div
                ref={gridContainerRef}
                style={{
                  transform: `scale(${zoomScale})`,
                  transformOrigin: 'top left',
                  willChange: 'transform',
                  cursor: isPanning ? 'grabbing' : (spaceHeld || store.mapViewMode === 'view' || store.mapViewMode === 'route') ? 'grab' : undefined,
                }}
              >
                {/* Column headers */}
                <div className="flex" style={{ paddingLeft: labelSize }}>
                  {Array.from({ length: cols }, (_, c) => (
                    <div key={`col-${c}`} className="flex items-center justify-center text-[7px] text-gray-600 font-mono" style={{ width: cellSize, height: labelSize }}>
                      {colLetter(c)}
                    </div>
                  ))}
                </div>

                {/* Grid with row labels */}
                <div className="flex">
                  {/* Row headers */}
                  <div className="flex flex-col" style={{ width: labelSize }}>
                    {Array.from({ length: rows }, (_, r) => (
                      <div key={`row-${r}`} className="flex items-center justify-center text-[7px] text-gray-600 font-mono" style={{ height: cellSize }}>
                        {r}
                      </div>
                    ))}
                  </div>

                  {/* CSS Grid wrapper - positions SVG overlay exactly over grid cells */}
                  <div className="relative">
                    <div
                      className="grid"
                      style={{
                        gridTemplateColumns: `repeat(${cols}, ${cellSize}px)`,
                        gridTemplateRows: `repeat(${rows}, ${cellSize}px)`,
                      }}
                    >
                  {Array.from({ length: rows }, (_, r) =>
                    Array.from({ length: cols }, (_, c) => {
                      const tile = getTile(r, c);
                      const building = getBuildingAtCell(r, c);
                      const terrain = tile?.terrain ?? 'flat';
                      const isHovered = hoveredCell?.row === r && hoveredCell?.col === c;
                      const isWater = terrain === 'water';
                      const isTopLeft = building && building.gridRow === r && building.gridCol === c;
                      const fp = building ? getBuildingFootprint(building.type) : null;
                      const isBuildingCell = !!building;
                      const isSelected = selectedBuildingId && building?.id === selectedBuildingId;
                      const isRouteConnected = selectedBuildingId && building && connectedBuildingIds.has(building.id);

                      // Build mode preview
                      const showPreview = store.mapViewMode === 'build' && pendingBuildType && isHovered && !isBuildingCell;
                      const previewValid = showPreview && isPlacementValid(r, c);

                      const connectionCount = building ? getConnectionCount(building.id) : 0;

                      return (
                        <div
                          key={`${r}-${c}`}
                          className={`
                            relative border border-gray-800/50 transition-colors duration-100
                            ${TERRAIN_BG[terrain]}
                            ${isWater ? 'cursor-not-allowed' : 'cursor-pointer'}
                            ${isHovered && !isWater ? 'bg-gray-700/30' : ''}
                            ${isRouteConnected && !isSelected ? 'ring-1 ring-cyan-400/30' : ''}
                          `}
                          style={isTopLeft && fp ? {
                            gridColumn: `${c + 1} / span ${fp.width}`,
                            gridRow: `${r + 1} / span ${fp.height}`,
                            zIndex: 2,
                          } : isBuildingCell ? { display: 'none' } : undefined}
                          onClick={() => handleCellClick(r, c)}
                          onMouseEnter={() => setHoveredCell({ row: r, col: c })}
                          onMouseLeave={() => setHoveredCell(null)}
                        >
                          {/* Terrain visual overlay */}
                          {!isBuildingCell && <TerrainOverlay terrain={terrain} cellSize={cellSize} />}

                          {/* Building */}
                          {isTopLeft && building && fp && (
                            <BuildingTile
                              building={building}
                              footprint={fp}
                              isSelected={!!isSelected}
                              cellSize={cellSize}
                              mode={store.mapViewMode}
                              connectionCount={connectionCount}
                              isRouteHighlighted={!!isRouteConnected && !isSelected}
                            />
                          )}

                          {/* Tile bonus indicator */}
                          {tile?.bonus && !isBuildingCell && (
                            <div className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full" style={{ backgroundColor: tile.bonus.type === 'production' ? '#22c55e' : tile.bonus.type === 'extraction' ? '#f59e0b' : tile.bonus.type === 'efficiency' ? '#3b82f6' : tile.bonus.type === 'power' ? '#eab308' : '#9ca3af' }} title={tile.bonus.description} />
                          )}

                          {/* Hover tooltip */}
                          {isHovered && !isBuildingCell && !isWater && (
                            <div className="absolute z-30 bottom-full left-1/2 -translate-x-1/2 mb-1 px-1.5 py-0.5 rounded bg-gray-900 border border-gray-700 text-[8px] text-gray-300 whitespace-nowrap pointer-events-none shadow-lg">
                              {TERRAIN_NAMES[terrain]} ({colLetter(c)}{r})
                              {tile?.bonus && <span className="text-green-400 ml-1">+{tile.bonus.description}</span>}
                            </div>
                          )}

                          {/* Build preview overlay with footprint outline */}
                          {showPreview && pendingFootprint && (
                            <div className={`absolute rounded-sm ${previewValid ? 'bg-green-500/20 border border-green-500/40' : 'bg-red-500/20 border border-red-500/40'}`} style={{
                              // Show footprint size indicator
                              width: `${pendingFootprint.width * 100}%`,
                              height: `${pendingFootprint.height * 100}%`,
                              top: 0,
                              left: 0,
                            }}>
                              <span className="absolute top-0.5 left-0.5 text-[6px] text-white/60 font-mono">{pendingFootprint.width}×{pendingFootprint.height}</span>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                  </div>
                  {/* Logistics SVG overlay - positioned exactly over the grid cells */}
                  {showLogisticsOverlay && (
                    <LogisticsSVGOverlay
                      routes={store.logisticsRoutes}
                      buildings={store.buildings}
                      cellSize={cellSize}
                      regionId={activeRegion}
                      selectedBuildingId={selectedBuildingId}
                      showThroughputLabels={showThroughputLabels}
                      gridWidth={cols * cellSize}
                      gridHeight={rows * cellSize}
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
          </div>

          {/* Minimap */}
          <div className="absolute bottom-2 right-2 z-20">
            <Minimap
              rows={rows}
              cols={cols}
              regionBuildings={regionBuildings}
              scrollLeft={scrollPos.left}
              scrollTop={scrollPos.top}
              clientWidth={scrollPos.clientW}
              clientHeight={scrollPos.clientH}
              totalGridWidth={totalGridWidth}
              totalGridHeight={totalGridHeight}
              onMinimapClick={handleMinimapClick}
              regionColor={region.color}
            />
          </div>

          {/* Throughput labels toggle */}
          <div className="absolute top-2 right-2 z-20">
            <Button
              variant={showThroughputLabels ? 'outline' : 'ghost'}
              size="sm"
              className={`h-6 text-[8px] ${showThroughputLabels ? 'border-gray-600 text-gray-300 bg-gray-900/80' : 'text-gray-600 bg-gray-900/60'}`}
              onClick={() => setShowThroughputLabels(v => !v)}
            >
              <BarChart3 className="w-2.5 h-2.5 mr-0.5" /> Labels
            </Button>
          </div>
        </div>

        {/* Mini stats bar */}
        <div className="flex items-center gap-3 mt-1.5 px-1 text-[9px] text-gray-500">
          <div className="flex items-center gap-1">
            <Hammer className="w-2.5 h-2.5 text-gray-600" />
            <span className="text-gray-400 font-mono">{regionBuildings.length}</span> buildings
          </div>
          <div className="flex items-center gap-1">
            <Route className="w-2.5 h-2.5 text-gray-600" />
            <span className="text-gray-400 font-mono">{activeRoutes}</span> routes
          </div>
          <div className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: getEffColor(regionEfficiency / 100) }} />
            <span className="font-mono" style={{ color: getEffColor(regionEfficiency / 100) }}>{regionEfficiency}%</span> efficiency
          </div>
          <div className="ml-auto text-gray-600">
            {cols}×{rows} grid • Drag to pan • Scroll to zoom • Ctrl+Scroll to scroll
          </div>
        </div>
      </div>

      {/* Desktop: Right sidebar */}
      {!isMobile && (
        <div className="w-56 flex-shrink-0 overflow-y-auto game-scrollbar space-y-2">{sidebarContent}</div>
      )}

      {/* Mobile: Bottom sheet */}
      {isMobile && (
        <Sheet open={mobilePaletteOpen} onOpenChange={setMobilePaletteOpen}>
          <SheetContent side="bottom" className="h-[60vh] bg-gray-950 border-gray-800 p-3 overflow-y-auto">
            <SheetHeader className="pb-2"><SheetTitle className="text-sm text-cyan-400">Build Palette</SheetTitle></SheetHeader>
            {sidebarContent}
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}

// =============================================
// Top Navigation Bar
// =============================================
function TopNavBar() {
  const store = useGameStore();
  const activeRegion = store.activeRegion
    ? (store.mapRegions.length > 0 ? store.mapRegions : INITIAL_REGIONS).find(r => r.id === store.activeRegion)
    : null;

  const layers: { key: MapViewLayer; label: string; icon: React.ReactNode }[] = [
    { key: 'region', label: 'Region', icon: <MapIcon className="w-3.5 h-3.5" /> },
    { key: 'grid', label: 'Grid', icon: <Grid3X3 className="w-3.5 h-3.5" /> },
    { key: 'logistics', label: 'Logistics', icon: <Route className="w-3.5 h-3.5" /> },
  ];

  const modes: { key: MapViewMode; label: string; icon: React.ReactNode }[] = [
    { key: 'view', label: 'View', icon: <Eye className="w-3.5 h-3.5" /> },
    { key: 'build', label: 'Build', icon: <Hammer className="w-3.5 h-3.5" /> },
    { key: 'route', label: 'Route', icon: <Route className="w-3.5 h-3.5" /> },
    { key: 'demolish', label: 'Demolish', icon: <Trash2 className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="flex items-center gap-2 flex-wrap pb-2 border-b border-gray-800 mb-3">
      {store.mapViewLayer !== 'region' && (
        <Button variant="ghost" size="sm" className="h-7 text-[10px] text-gray-400 hover:text-cyan-400" onClick={() => store.setMapViewLayer('region')}>
          <ArrowLeft className="w-3 h-3 mr-1" /> Map
        </Button>
      )}
      <div className="flex items-center bg-gray-900/60 rounded-md border border-gray-800 overflow-hidden">
        {layers.map(layer => (
          <Button key={layer.key} variant="ghost" size="sm" className={`h-7 px-2 text-[10px] ${store.mapViewLayer === layer.key ? 'text-cyan-400 bg-cyan-900/20' : 'text-gray-500 hover:text-gray-300'}`} onClick={() => store.setMapViewLayer(layer.key)}>
            {layer.icon}<span className="ml-1 hidden sm:inline">{layer.label}</span>
          </Button>
        ))}
      </div>
      {activeRegion && store.mapViewLayer !== 'region' && (
        <div className="flex items-center gap-1 text-[10px] text-gray-500">
          <MapIcon className="w-2.5 h-2.5" />
          <span className="text-gray-500">World Map</span>
          <ChevronRight className="w-2.5 h-2.5 text-gray-600" />
          <span style={{ color: activeRegion.color }}>{activeRegion.emoji} {activeRegion.name}</span>
          <ChevronRight className="w-2.5 h-2.5 text-gray-600" />
          <span className="text-gray-400 capitalize">{store.mapViewLayer}</span>
        </div>
      )}
      {store.mapViewLayer !== 'region' && (
        <div className="flex items-center bg-gray-900/60 rounded-md border border-gray-800 overflow-hidden ml-auto">
          {modes.map(mode => (
            <Button key={mode.key} variant="ghost" size="sm" className={`h-7 px-2 text-[10px] ${store.mapViewMode === mode.key ? mode.key === 'demolish' ? 'text-red-400 bg-red-900/20' : mode.key === 'build' ? 'text-amber-400 bg-amber-900/20' : mode.key === 'route' ? 'text-cyan-400 bg-cyan-900/20' : 'text-gray-300 bg-gray-800/40' : 'text-gray-500 hover:text-gray-300'}`} onClick={() => store.setMapViewMode(mode.key)}>
              {mode.icon}<span className="ml-1 hidden sm:inline">{mode.label}</span>
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

// =============================================
// Main HybridMapPanel
// =============================================
export default function HybridMapPanel() {
  const store = useGameStore();
  const layer = store.mapViewLayer;
  const activeRegion = store.activeRegion
    ? (store.mapRegions.length > 0 ? store.mapRegions : INITIAL_REGIONS).find(r => r.id === store.activeRegion)
    : null;

  return (
    <div className="h-full flex flex-col">
      <TopNavBar />
      <AnimatePresence mode="wait">
        {layer === 'region' ? (
          <motion.div key="region" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }} className="flex-1 overflow-y-auto game-scrollbar">
            <RegionOverviewMap />
          </motion.div>
        ) : layer === 'logistics' ? (
          <motion.div key="logistics-panel" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }} className="flex-1 overflow-y-auto game-scrollbar">
            {activeRegion ? <LogisticsRouteOverlay /> : <div className="text-center text-gray-500 p-8"><Route className="w-8 h-8 mx-auto mb-2 text-gray-700" />Select a region to manage logistics</div>}
          </motion.div>
        ) : (
          <motion.div key="grid" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }} className="flex-1 overflow-hidden">
            {activeRegion ? (
              <div className="relative h-full"><GridFactoryView /></div>
            ) : (
              <div className="text-center text-gray-500 p-8"><MapIcon className="w-8 h-8 mx-auto mb-2 text-gray-700" />Select a region from the map first</div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
