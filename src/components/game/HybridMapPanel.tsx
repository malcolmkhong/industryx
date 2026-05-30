'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useGameStore, formatNumber } from '@/lib/game/store';
import { BUILDING_DEFS, RESOURCE_META, INITIAL_REGIONS, BUILDING_FOOTPRINTS, getBuildingFootprint } from '@/lib/game/data';
import { Region, RegionId, GridTile, LogisticsRoute, MapViewLayer, MapViewMode, BuildingType, BuildingInstance, ResourceType } from '@/lib/game/types';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { toast } from '@/hooks/use-toast';
import {
  Map as MapIcon, Grid3X3, Route, Lock, Unlock, Eye, Hammer,
  Trash2, ArrowLeft, ZoomIn, ZoomOut, ChevronRight, X,
  Power, PowerOff, ChevronUp, Wand2, LayoutGrid, ArrowDown,
  ArrowRight, ArrowUp, Link2, BarChart3,
} from 'lucide-react';

// --- Region layout order ---
const REGION_ORDER: RegionId[] = ['cosmic', 'quantum', 'highlands', 'industrial', 'grasslands'];

// --- Terrain bg colors ---
const TERRAIN_BG: Record<GridTile['terrain'], string> = {
  flat: 'bg-gray-800/40',
  rocky: 'bg-amber-900/20',
  water: 'bg-blue-900/30',
  forest: 'bg-green-900/20',
  mountain: 'bg-gray-700/20',
};

// --- Terrain names ---
const TERRAIN_NAMES: Record<GridTile['terrain'], string> = {
  flat: 'Flat Land',
  rocky: 'Rocky Terrain',
  water: 'Water',
  forest: 'Forest',
  mountain: 'Mountain',
};

// --- Build palette categories ---
const BUILD_CATEGORIES = [
  { label: '⛏️ Extraction', key: 'extractor' as const },
  { label: '🏭 Factory', key: 'factory' as const },
  { label: '⚡ Power', key: 'power' as const },
];

// --- Route type icons ---
const ROUTE_TYPE_ICON: Record<string, string> = {
  conveyor: '🔄', pipe: '🔌', truck: '🚛', train: '🚂', drone: '🛸',
};

// --- Get tier row range for auto-arrange ---
function getTierRowRange(category: string, tier: number): [number, number] {
  if (category === 'extractor') return [0, 3];
  if (category === 'power') return [0, 3];
  if (tier <= 1) return [3, 7];
  if (tier === 2) return [7, 11];
  if (tier === 3) return [11, 15];
  return [15, 999]; // T4/endgame
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

  // Layout positions for the vertical island map
  const layoutConfig: Record<RegionId, { row: string; col: string; wide: boolean }> = {
    cosmic: { row: '1', col: '1 / -1', wide: true },
    quantum: { row: '2', col: '1', wide: false },
    highlands: { row: '2', col: '2', wide: false },
    industrial: { row: '3', col: '1 / -1', wide: true },
    grasslands: { row: '4', col: '1 / -1', wide: true },
  };

  // --- Region positions for cross-region route SVG ---
  const regionCardPositions: Record<RegionId, { cx: number; cy: number }> = {
    cosmic: { cx: 50, cy: 10 },
    quantum: { cx: 25, cy: 35 },
    highlands: { cx: 75, cy: 35 },
    industrial: { cx: 50, cy: 60 },
    grasslands: { cx: 50, cy: 85 },
  };

  // --- Cross-region routes ---
  const crossRegionRoutes = useMemo(() => {
    return store.logisticsRoutes.filter(r => {
      const from = store.buildings.find(b => b.id === r.fromBuildingId);
      const to = store.buildings.find(b => b.id === r.toBuildingId);
      return from && to && from.regionId !== to.regionId;
    });
  }, [store.logisticsRoutes, store.buildings]);

  // --- Statistics ---
  const totalBuildings = store.buildings.length;
  const totalRoutes = store.logisticsRoutes.length;

  const gridUtilization = useMemo(() => {
    const result: { regionId: string; regionName: string; occupied: number; total: number; pct: number }[] = [];
    for (const region of regions) {
      if (!region.unlocked) continue;
      const grid = store.mapGrids[region.id] ?? [];
      const total = grid.length || (region.gridRows * region.gridCols);
      const occupied = store.buildings.filter(b => b.regionId === region.id && b.gridRow !== undefined).length;
      result.push({
        regionId: region.id,
        regionName: `${region.emoji} ${region.name}`,
        occupied,
        total,
        pct: total > 0 ? Math.round((occupied / total) * 100) : 0,
      });
    }
    return result;
  }, [regions, store.mapGrids, store.buildings]);

  const productionCapacity = useMemo(() => {
    const result: { regionId: string; regionName: string; capacity: number }[] = [];
    for (const region of regions) {
      if (!region.unlocked) continue;
      const regionBuildings = store.buildings.filter(b => b.regionId === region.id && b.active);
      const capacity = regionBuildings.reduce((sum, b) => {
        return sum + b.efficiency;
      }, 0);
      result.push({
        regionId: region.id,
        regionName: `${region.emoji} ${region.name}`,
        capacity: Math.round(capacity * 100),
      });
    }
    return result;
  }, [regions, store.buildings]);

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h2 className="text-lg font-bold text-cyan-400">🗺️ World Map</h2>
        <p className="text-xs text-gray-500">Click a region to enter — unlock new areas to expand your empire</p>
      </div>

      {/* Region cards with cross-region route overlay */}
      <div className="relative max-w-2xl mx-auto">
        {/* Cross-region route SVG overlay */}
        {crossRegionRoutes.length > 0 && (
          <svg className="absolute inset-0 pointer-events-none z-10" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
            <defs>
              <filter id="cross-route-glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="1" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
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
                  <path
                    d={`M${fromPos.cx},${fromPos.cy} Q${cx},${cy} ${toPos.cx},${toPos.cy}`}
                    fill="none"
                    stroke={color}
                    strokeWidth="0.5"
                    opacity="0.6"
                    filter="url(#cross-route-glow)"
                  />
                  {/* Animated particle */}
                  <circle r="0.8" fill={color} opacity="0.8">
                    <animateMotion
                      dur={`${2 + (1 - route.efficiency) * 1.5}s`}
                      repeatCount="indefinite"
                      path={`M${fromPos.cx},${fromPos.cy} Q${cx},${cy} ${toPos.cx},${toPos.cy}`}
                    />
                  </circle>
                  {/* Resource label at midpoint */}
                  <text x={mx} y={my - 1.5} textAnchor="middle" fontSize="2.5" fill={color} opacity="0.9">
                    {meta?.emoji ?? ''} {formatNumber(route.throughput)}/t
                  </text>
                </g>
              );
            })}
          </svg>
        )}

        <div
          className="grid gap-3 md:grid-cols-2 grid-cols-1"
          style={{
            gridTemplateColumns: undefined,
          }}
        >
          {REGION_ORDER.map(id => {
            const region = regions.find(r => r.id === id);
            if (!region) return null;
            const layout = layoutConfig[id];
            const buildingCount = getBuildingCount(region.id);

            return (
              <motion.button
                key={region.id}
                className={`
                  relative rounded-xl border-2 p-4 text-left transition-all duration-200
                  ${region.unlocked
                    ? 'cursor-pointer hover:scale-[1.02] hover:shadow-lg'
                    : 'cursor-pointer opacity-70 hover:opacity-90'}
                `}
                style={{
                  borderColor: region.unlocked ? region.color : '#374151',
                  background: region.unlocked
                    ? `linear-gradient(135deg, ${region.color}10, ${region.color}05)`
                    : 'rgba(17,24,39,0.8)',
                }}
                onClick={() => handleRegionClick(region)}
                whileTap={{ scale: 0.97 }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{region.emoji}</span>
                    <div>
                      <div className="text-sm font-bold" style={{ color: region.unlocked ? region.color : '#9ca3af' }}>
                        {region.name}
                      </div>
                      {!region.unlocked && (
                        <div className="flex items-center gap-1 text-xs text-gray-500">
                          <Lock className="w-3 h-3" />
                          <span>${formatNumber(region.unlockCost)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {region.unlocked ? (
                      <Badge variant="outline" className="text-[9px] border-green-500/30 text-green-400 bg-green-900/10">
                        {buildingCount} building{buildingCount !== 1 ? 's' : ''}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[9px] border-gray-600 text-gray-500 bg-gray-900/20">
                        <Lock className="w-2.5 h-2.5 mr-0.5" /> Locked
                      </Badge>
                    )}
                  </div>
                </div>
                {region.unlocked && (
                  <div className="mt-2 text-[10px] text-gray-500 line-clamp-1">{region.description}</div>
                )}
                {region.unlocked && region.bonuses.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {region.bonuses.map((b, i) => (
                      <span key={i} className="text-[8px] px-1 py-0.5 rounded bg-gray-800/60 text-gray-400">
                        {b.description}
                      </span>
                    ))}
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

      {/* --- Region Statistics Panel --- */}
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

        {/* Per-region utilization */}
        {gridUtilization.length > 0 && (
          <div className="mt-3 space-y-1.5">
            <div className="text-[9px] text-gray-500 font-semibold">Grid Utilization</div>
            {gridUtilization.map(r => (
              <div key={r.regionId} className="flex items-center gap-2 text-[9px]">
                <span className="text-gray-400 w-24 truncate">{r.regionName}</span>
                <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${r.pct}%`,
                      backgroundColor: r.pct < 30 ? '#4ade80' : r.pct < 60 ? '#facc15' : '#f87171',
                    }}
                  />
                </div>
                <span className="text-gray-500 font-mono w-12 text-right">{r.pct}%</span>
                <span className="text-gray-600 font-mono w-16 text-right">({r.occupied}/{r.total})</span>
              </div>
            ))}
          </div>
        )}

        {/* Per-region production capacity */}
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
// Grid Factory View
// =============================================
function GridFactoryView() {
  const store = useGameStore();
  const activeRegion = store.activeRegion ?? 'grasslands';
  const region = (store.mapRegions.length > 0 ? store.mapRegions : INITIAL_REGIONS).find(r => r.id === activeRegion);
  const grid = store.mapGrids[activeRegion] ?? [];
  const [zoom, setZoom] = useState(1);
  const [hoveredCell, setHoveredCell] = useState<{ row: number; col: number } | null>(null);
  const [pendingBuildType, setPendingBuildType] = useState<BuildingType | null>(null);
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(null);
  const [mobilePaletteOpen, setMobilePaletteOpen] = useState(false);
  const gridContainerRef = useRef<HTMLDivElement>(null);

  // Mobile detection
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const rows = region?.gridRows ?? 16;
  const cols = region?.gridCols ?? 20;

  // Buildings placed in this region
  const regionBuildings = store.buildings.filter(b => b.regionId === activeRegion);

  // Map building id → building instance
  const buildingMap = new Map<string, BuildingInstance>();
  regionBuildings.forEach(b => buildingMap.set(b.id, b));

  // Selected building details
  const selectedBuilding = selectedBuildingId ? buildingMap.get(selectedBuildingId) ?? null : null;

  // Cell size calculation based on container width
  const cellSize = Math.max(28, Math.min(56, Math.floor(700 / cols)));

  // Get building at grid position
  const getBuildingAtCell = (row: number, col: number): BuildingInstance | null => {
    for (const b of regionBuildings) {
      if (b.gridRow === undefined || b.gridCol === undefined) continue;
      const fp = getBuildingFootprint(b.type);
      if (row >= b.gridRow && row < b.gridRow + fp.height && col >= b.gridCol && col < b.gridCol + fp.width) {
        return b;
      }
    }
    return null;
  };

  // Get tile for position
  const getTile = (row: number, col: number): GridTile | undefined =>
    grid.find(t => t.row === row && t.col === col);

  // Connection count for a building
  const getConnectionCount = (buildingId: string): number => {
    return store.logisticsRoutes.filter(r => r.fromBuildingId === buildingId || r.toBuildingId === buildingId).length;
  };

  // Handle cell click
  const handleCellClick = (row: number, col: number) => {
    const mode = store.mapViewMode;

    if (mode === 'demolish') {
      const b = getBuildingAtCell(row, col);
      if (b) {
        store.removeBuildingFromGrid(b.id);
        setSelectedBuildingId(null);
      }
      return;
    }

    if (mode === 'build' && pendingBuildType) {
      const canPlace = store.canPlaceBuilding(pendingBuildType, activeRegion, row, col);
      if (canPlace) {
        store.buildBuilding(pendingBuildType);
        const newBuilding = store.buildings[store.buildings.length - 1];
        if (newBuilding) {
          store.placeBuildingOnGrid(newBuilding.id, activeRegion, row, col);
        }
        setPendingBuildType(null);
      }
      return;
    }

    // View mode — select building
    const b = getBuildingAtCell(row, col);
    if (b) {
      setSelectedBuildingId(prev => prev === b.id ? null : b.id);
      store.selectBuilding(b.id);
    } else {
      setSelectedBuildingId(null);
      store.selectBuilding(null);
    }
  };

  // Is placement valid for pending building?
  const isPlacementValid = (row: number, col: number): boolean => {
    if (!pendingBuildType) return false;
    return store.canPlaceBuilding(pendingBuildType, activeRegion, row, col);
  };

  // Zoom
  const handleZoomIn = () => setZoom(z => Math.min(1.5, z + 0.15));
  const handleZoomOut = () => setZoom(z => Math.max(0.5, z - 0.15));

  // Auto-Layout: generate logistics routes
  const handleAutoLayout = () => {
    if (typeof store.autoGenerateLogisticsRoutes === 'function') {
      store.autoGenerateLogisticsRoutes();
      toast({ title: '🔄 Auto-Layout', description: 'Logistics routes generated automatically!' });
    } else {
      toast({ title: '🔄 Auto-Layout', description: 'Auto-generate routes not yet available.' });
    }
  };

  // Auto-Arrange: rearrange buildings by tier
  const handleAutoArrange = () => {
    // Collect all buildings in this region with positions
    const buildingsWithPositions = regionBuildings
      .filter(b => b.gridRow !== undefined && b.gridCol !== undefined)
      .map(b => ({
        id: b.id,
        type: b.type,
        gridRow: b.gridRow!,
        gridCol: b.gridCol!,
      }));

    if (buildingsWithPositions.length === 0) {
      toast({ title: '📐 Auto-Arrange', description: 'No buildings to arrange.' });
      return;
    }

    // Group buildings by production chain tier
    interface BuildingGroup {
      id: string;
      type: BuildingType;
      tier: number;
      category: string;
      outputs: string[];
      inputs: string[];
    }

    const buildGroups: BuildingGroup[] = buildingsWithPositions.map(b => {
      const bdef = BUILDING_DEFS[b.type];
      return {
        id: b.id,
        type: b.type,
        tier: bdef?.tier ?? 0,
        category: bdef?.category ?? 'factory',
        outputs: bdef?.outputs?.map(o => o.resource) ?? [],
        inputs: bdef?.inputs?.map(i => i.resource) ?? [],
      };
    });

    // Sort by tier, then by production chain (buildings that supply each other are adjacent)
    const sortedGroups = [...buildGroups].sort((a, b) => {
      const aRange = getTierRowRange(a.category, a.tier);
      const bRange = getTierRowRange(b.category, b.tier);
      if (aRange[0] !== bRange[0]) return aRange[0] - bRange[0];

      if (a.outputs.some(o => b.inputs.includes(o))) return -1;
      if (b.outputs.some(o => a.inputs.includes(o))) return 1;

      if (a.category !== b.category) {
        const catOrder: Record<string, number> = { extractor: 0, power: 1, factory: 2, storage: 3 };
        return (catOrder[a.category] ?? 2) - (catOrder[b.category] ?? 2);
      }

      return 0;
    });

    let currentRow = 0;
    let currentCol = 0;
    const occupiedCells = new Set<string>();

    for (const group of sortedGroups) {
      const fp = getBuildingFootprint(group.type);
      const range = getTierRowRange(group.category, group.tier);

      if (currentRow < range[0]) {
        currentRow = range[0];
        currentCol = 0;
      }

      let placed = false;
      for (let r = currentRow; r < Math.min(range[1], rows) && !placed; r++) {
        for (let c = (r === currentRow ? currentCol : 0); c <= cols - fp.width && !placed; c++) {
          let canPlaceHere = true;
          for (let dr = 0; dr < fp.height && canPlaceHere; dr++) {
            for (let dc = 0; dc < fp.width && canPlaceHere; dc++) {
              const tr = r + dr;
              const tc = c + dc;
              const tTile = grid.find(t => t.row === tr && t.col === tc);
              if (tr >= rows || tc >= cols || occupiedCells.has(`${tr}-${tc}`) || tTile?.terrain === 'water') {
                canPlaceHere = false;
              }
            }
          }

          if (canPlaceHere) {
            store.removeBuildingFromGrid(group.id);
            store.placeBuildingOnGrid(group.id, activeRegion, r, c);

            for (let dr = 0; dr < fp.height; dr++) {
              for (let dc = 0; dc < fp.width; dc++) {
                occupiedCells.add(`${r + dr}-${c + dc}`);
              }
            }

            currentRow = r;
            currentCol = c + fp.width;
            if (currentCol >= cols) {
              currentCol = 0;
              currentRow++;
            }
            placed = true;
          }
        }
        currentCol = 0;
      }
    }

    toast({ title: '📐 Auto-Arrange', description: `Arranged ${buildingsWithPositions.length} buildings by production tier!` });
    setSelectedBuildingId(null);
  };

  // Get available building types for this region's allowed categories
  const allowedCategories = region?.allowedCategories ?? [];
  const maxBuildingSize = region?.maxBuildingSize ?? 2;

  const availableTypes: BuildingType[] = [];
  for (const [key, def] of Object.entries(BUILDING_DEFS)) {
    if (allowedCategories.includes(def.category)) {
      const fp = getBuildingFootprint(key);
      if (fp.width <= maxBuildingSize && fp.height <= maxBuildingSize) {
        availableTypes.push(key as BuildingType);
      }
    }
  }

  // Group by category for palette
  const paletteGroups: { label: string; types: BuildingType[] }[] = [];
  for (const cat of BUILD_CATEGORIES) {
    const filtered = availableTypes.filter(t => BUILDING_DEFS[t]?.category === cat.key);
    if (filtered.length > 0) paletteGroups.push({ label: cat.label, types: filtered });
  }

  // Check if building type is affordable
  const isAffordable = (type: BuildingType) => {
    const def = BUILDING_DEFS[type];
    if (!def) return false;
    return def.baseCost.every(c => {
      if (c.resource === 'money') return store.money >= c.amount;
      return true;
    });
  };

  // Check if unlocked
  const isUnlocked = (type: BuildingType) => {
    const def = BUILDING_DEFS[type];
    if (!def?.unlockRequirement) return true;
    if (def.unlockRequirement.research && !store.completedResearch.includes(def.unlockRequirement.research)) return false;
    return true;
  };

  if (!region) {
    return <div className="text-center text-gray-500 p-8">Region not found</div>;
  }

  // --- Sidebar content (shared between desktop sidebar and mobile sheet) ---
  const sidebarContent = (
    <AnimatePresence mode="wait">
      {selectedBuilding ? (
        <SelectedBuildingDetail
          key="detail"
          building={selectedBuilding}
          connectionCount={getConnectionCount(selectedBuilding.id)}
          onClose={() => { setSelectedBuildingId(null); store.selectBuilding(null); }}
        />
      ) : store.mapViewMode === 'build' ? (
        <BuildPalette
          key="palette"
          groups={paletteGroups}
          pendingType={pendingBuildType}
          onSelectType={setPendingBuildType}
          isAffordable={isAffordable}
          isUnlocked={isUnlocked}
        />
      ) : (
        <div className="text-center text-gray-500 text-xs p-4">
          <Eye className="w-6 h-6 mx-auto mb-2 text-gray-600" />
          <p>Switch to Build mode to place buildings</p>
          <p className="mt-1 text-gray-600">Click any building to see details</p>
        </div>
      )}
    </AnimatePresence>
  );

  return (
    <div className={`flex ${isMobile ? 'flex-col' : 'gap-3'} h-full`}>
      {/* Grid Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Zoom controls + toolbar */}
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-gray-400" onClick={handleZoomOut}>
            <ZoomOut className="w-3.5 h-3.5" />
          </Button>
          <span className="text-[10px] text-gray-500 font-mono">{Math.round(zoom * 100)}%</span>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-gray-400" onClick={handleZoomIn}>
            <ZoomIn className="w-3.5 h-3.5" />
          </Button>

          {/* Auto-Layout button */}
          <Button
            variant="outline" size="sm"
            className="h-6 text-[9px] border-cyan-800/50 text-cyan-400 hover:bg-cyan-900/20"
            onClick={handleAutoLayout}
          >
            <Wand2 className="w-3 h-3 mr-1" /> Auto-Layout
          </Button>

          {/* Auto-Arrange button */}
          <Button
            variant="outline" size="sm"
            className="h-6 text-[9px] border-purple-800/50 text-purple-400 hover:bg-purple-900/20"
            onClick={handleAutoArrange}
          >
            <LayoutGrid className="w-3 h-3 mr-1" /> Auto-Arrange
          </Button>

          {/* Mobile palette toggle */}
          {isMobile && store.mapViewMode === 'build' && (
            <Button
              variant="outline" size="sm"
              className="h-6 text-[9px] border-amber-800/50 text-amber-400 hover:bg-amber-900/20 ml-auto"
              onClick={() => setMobilePaletteOpen(true)}
            >
              <Hammer className="w-3 h-3 mr-1" /> Palette
            </Button>
          )}

          <div className={`${isMobile ? 'hidden' : 'ml-auto'} text-[10px] text-gray-500`}>
            {region.emoji} {region.name} • {regionBuildings.length} building{regionBuildings.length !== 1 ? 's' : ''}
          </div>
        </div>

        {/* Scrollable grid container */}
        <div className="flex-1 overflow-auto game-scrollbar rounded-lg border border-gray-800 bg-gray-900/50">
          <div
            ref={gridContainerRef}
            className="relative p-2 inline-block"
            style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }}
          >
            {/* CSS Grid */}
            <div
              className="grid gap-px"
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

                  // Build mode preview
                  const showPreview = store.mapViewMode === 'build' && pendingBuildType && isHovered && !isBuildingCell;
                  const previewValid = showPreview && isPlacementValid(r, c);

                  // Connection count for building
                  const connectionCount = building ? getConnectionCount(building.id) : 0;

                  // Tooltip content for empty cells
                  const tooltipContent = !isBuildingCell ? `${TERRAIN_NAMES[terrain]} • (${r}, ${c})${tile?.bonus ? ` • ${tile.bonus.description}` : ''}` : null;

                  return (
                    <div
                      key={`${r}-${c}`}
                      className={`
                        relative border border-gray-800/50 transition-colors duration-100
                        ${TERRAIN_BG[terrain]}
                        ${isWater ? 'cursor-not-allowed' : 'cursor-pointer'}
                        ${isHovered && !isWater ? 'bg-gray-700/30' : ''}
                      `}
                      style={isTopLeft && fp ? {
                        gridColumn: `${c + 1} / span ${fp.width}`,
                        gridRow: `${r + 1} / span ${fp.height}`,
                        zIndex: 2,
                      } : isBuildingCell ? { display: 'none' } : undefined}
                      onClick={() => handleCellClick(r, c)}
                      onMouseEnter={() => setHoveredCell({ row: r, col: c })}
                      onMouseLeave={() => setHoveredCell(null)}
                      title={tooltipContent ?? undefined}
                    >
                      {/* Building content (only rendered at top-left cell) */}
                      {isTopLeft && building && fp && (
                        <BuildingTile
                          building={building}
                          footprint={fp}
                          isSelected={!!isSelected}
                          cellSize={cellSize}
                          mode={store.mapViewMode}
                          connectionCount={connectionCount}
                        />
                      )}

                      {/* Tile bonus indicator */}
                      {tile?.bonus && !isBuildingCell && (
                        <div
                          className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full"
                          style={{
                            backgroundColor:
                              tile.bonus.type === 'production' ? '#22c55e' :
                              tile.bonus.type === 'extraction' ? '#f59e0b' :
                              tile.bonus.type === 'efficiency' ? '#3b82f6' :
                              tile.bonus.type === 'power' ? '#eab308' : '#9ca3af',
                          }}
                          title={tile.bonus.description}
                        />
                      )}

                      {/* Hover tooltip for empty cells */}
                      {isHovered && !isBuildingCell && !isWater && (
                        <div className="absolute z-30 bottom-full left-1/2 -translate-x-1/2 mb-1 px-1.5 py-0.5 rounded bg-gray-900 border border-gray-700 text-[8px] text-gray-300 whitespace-nowrap pointer-events-none shadow-lg">
                          {TERRAIN_NAMES[terrain]} ({r},{c})
                          {tile?.bonus && <span className="text-green-400 ml-1">+{tile.bonus.description}</span>}
                        </div>
                      )}

                      {/* Build preview overlay */}
                      {showPreview && (
                        <div className={`absolute inset-0 rounded-sm ${previewValid ? 'bg-green-500/20 border border-green-500/40' : 'bg-red-500/20 border border-red-500/40'}`} />
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Logistics SVG overlay — always render when there are routes */}
            <LogisticsSVGOverlay
              routes={store.logisticsRoutes}
              buildings={store.buildings}
              cellSize={cellSize}
              regionId={activeRegion}
            />
          </div>
        </div>
      </div>

      {/* Desktop: Right sidebar */}
      {!isMobile && (
        <div className="w-56 flex-shrink-0 overflow-y-auto game-scrollbar space-y-2">
          {sidebarContent}
        </div>
      )}

      {/* Mobile: Bottom sheet for build palette */}
      {isMobile && (
        <Sheet open={mobilePaletteOpen} onOpenChange={setMobilePaletteOpen}>
          <SheetContent side="bottom" className="h-[60vh] bg-gray-950 border-gray-800 p-3 overflow-y-auto">
            <SheetHeader className="pb-2">
              <SheetTitle className="text-sm text-cyan-400">Build Palette</SheetTitle>
            </SheetHeader>
            {sidebarContent}
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}

// =============================================
// Building Tile on Grid
// =============================================
function BuildingTile({
  building,
  footprint,
  isSelected,
  cellSize,
  mode,
  connectionCount,
}: {
  building: BuildingInstance;
  footprint: { width: number; height: number; cells: number };
  isSelected: boolean;
  cellSize: number;
  mode: MapViewMode;
  connectionCount: number;
}) {
  const def = BUILDING_DEFS[building.type];
  if (!def) return null;

  const effColor = building.efficiency >= 0.8 ? '#4ade80' : building.efficiency >= 0.5 ? '#facc15' : '#f87171';
  const categoryColor =
    def.category === 'extractor' ? '#92400e' :
    def.category === 'power' ? '#713f12' :
    def.tier === 1 ? '#164e63' :
    def.tier === 2 ? '#7c2d12' :
    def.tier === 3 ? '#581c87' : '#064e3b';

  // Multi-cell buildings get larger emoji
  const isMultiCell = footprint.width > 1 || footprint.height > 1;
  const emojiFontSize = isMultiCell
    ? Math.max(16, cellSize * 0.45)
    : Math.max(12, cellSize * 0.3);

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <motion.div
            className={`
              absolute inset-0 rounded-md border-2 overflow-hidden flex flex-col items-center justify-center
              ${!building.active ? 'opacity-40 grayscale' : ''}
              ${mode === 'demolish' ? 'hover:border-red-500 hover:bg-red-900/30' : ''}
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
            <span className="leading-none" style={{ fontSize: emojiFontSize }}>
              {def.emoji}
            </span>
            <div className="flex items-center gap-0.5 mt-0.5">
              <Badge className="text-[6px] px-0.5 py-0 h-3 min-w-[10px] bg-gray-800/80 text-gray-300 border-gray-600/50">
                {building.level}
              </Badge>
              {footprint.width > 1 && (
                <Badge className="text-[5px] px-0.5 py-0 h-3 bg-gray-700/60 text-gray-400 border-gray-600/30">
                  {footprint.width}×{footprint.height}
                </Badge>
              )}
            </div>
            <div className="w-3/4 h-0.5 bg-gray-800/60 rounded-full mt-0.5 overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${Math.round(building.efficiency * 100)}%`, backgroundColor: effColor }} />
            </div>

            {/* Connection count indicator */}
            {connectionCount > 0 && (
              <div className="absolute top-0.5 right-0.5 flex items-center gap-0.5">
                <Link2 className="w-2 h-2 text-cyan-400" />
                <span className="text-[6px] text-cyan-300 font-mono">{connectionCount}</span>
              </div>
            )}

            {/* Resource flow direction arrows when selected */}
            {isSelected && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="flex flex-col items-center gap-0.5">
                  {def.inputs && def.inputs.length > 0 && (
                    <div className="flex items-center gap-0.5">
                      <ArrowDown className="w-2 h-2 text-red-400 animate-bounce" />
                      <span className="text-[5px] text-red-300">IN</span>
                    </div>
                  )}
                  {def.outputs && def.outputs.length > 0 && (
                    <div className="flex items-center gap-0.5">
                      <ArrowUp className="w-2 h-2 text-green-400 animate-bounce" />
                      <span className="text-[5px] text-green-300">OUT</span>
                    </div>
                  )}
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
}

// =============================================
// Build Palette Sidebar
// =============================================
function BuildPalette({
  groups,
  pendingType,
  onSelectType,
  isAffordable,
  isUnlocked,
}: {
  groups: { label: string; types: BuildingType[] }[];
  pendingType: BuildingType | null;
  onSelectType: (type: BuildingType | null) => void;
  isAffordable: (type: BuildingType) => boolean;
  isUnlocked: (type: BuildingType) => boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="space-y-2"
    >
      <div className="text-xs font-bold text-cyan-400 flex items-center gap-1">
        <Hammer className="w-3 h-3" /> Build Palette
      </div>
      {pendingType && (
        <div className="flex items-center gap-1 p-2 rounded-md bg-cyan-900/20 border border-cyan-500/30">
          <span className="text-sm">{BUILDING_DEFS[pendingType]?.emoji}</span>
          <span className="text-[10px] text-cyan-300 flex-1">{BUILDING_DEFS[pendingType]?.name}</span>
          <Button variant="ghost" size="sm" className="h-4 w-4 p-0 text-gray-400" onClick={() => onSelectType(null)}>
            <X className="w-2.5 h-2.5" />
          </Button>
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
                  className={`
                    w-full text-left p-1.5 rounded-md border transition-colors text-[10px]
                    ${isActive ? 'border-cyan-500/50 bg-cyan-900/20' : 'border-gray-800 bg-gray-900/40 hover:bg-gray-800/60'}
                    ${!unlocked ? 'opacity-40' : !affordable ? 'opacity-60' : ''}
                  `}
                  onClick={() => onSelectType(isActive ? null : type)}
                  disabled={!unlocked}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm">{def.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <div className="truncate text-gray-300">{def.name}</div>
                      <div className="flex items-center gap-1 text-gray-500">
                        <span className="text-green-400">${formatNumber(cost)}</span>
                        <Badge className="text-[5px] px-0.5 py-0 h-3 bg-gray-700/60 text-gray-400 border-0">
                          {fp.width}×{fp.height}
                        </Badge>
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
  building,
  connectionCount,
  onClose,
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
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="space-y-3 bg-gray-900/80 rounded-lg border border-gray-800 p-3"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">{def.emoji}</span>
          <div>
            <h3 className={`text-sm font-semibold ${categoryColor}`}>{def.name}</h3>
            <p className="text-[10px] text-gray-500">Lv {building.level} • {building.active ? '🟢 Active' : '🔴 Off'}</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-gray-500" onClick={onClose}>
          <X className="w-3 h-3" />
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <div className="bg-gray-800/50 rounded p-1.5 text-center">
          <div className="text-[8px] text-gray-500">Efficiency</div>
          <div className="text-sm font-bold font-mono" style={{ color: building.efficiency >= 0.8 ? '#4ade80' : building.efficiency >= 0.5 ? '#facc15' : '#f87171' }}>
            {Math.round(building.efficiency * 100)}%
          </div>
        </div>
        <div className="bg-gray-800/50 rounded p-1.5 text-center">
          <div className="text-[8px] text-gray-500">Power</div>
          <div className="text-sm font-bold font-mono text-yellow-400">
            {def.basePowerProduction > 0
              ? `+${def.basePowerProduction * building.level}MW`
              : `-${def.basePowerConsumption * building.level}MW`}
          </div>
        </div>
      </div>

      {/* Connection count */}
      {connectionCount > 0 && (
        <div className="flex items-center gap-1.5 text-[9px] text-cyan-400 bg-cyan-900/10 rounded px-2 py-1 border border-cyan-900/30">
          <Link2 className="w-3 h-3" />
          <span>{connectionCount} logistics route{connectionCount !== 1 ? 's' : ''} connected</span>
        </div>
      )}

      {/* Resource flow direction */}
      <div className="space-y-1">
        {def.inputs && def.inputs.length > 0 && (
          <div className="flex items-center gap-1 text-[8px] text-red-400">
            <ArrowDown className="w-2.5 h-2.5" /> Input Flow
          </div>
        )}
        {def.outputs && def.outputs.length > 0 && (
          <div className="flex items-center gap-1 text-[8px] text-green-400">
            <ArrowUp className="w-2.5 h-2.5" /> Output Flow
          </div>
        )}
      </div>

      {def.outputs && (
        <div>
          <div className="text-[9px] text-gray-500 mb-1">Produces</div>
          <div className="space-y-0.5">
            {def.outputs.map((output, i) => {
              const meta = RESOURCE_META[output.resource as ResourceType];
              return (
                <div key={i} className="flex items-center justify-between bg-gray-800/40 rounded px-1.5 py-0.5">
                  <div className="flex items-center gap-1">
                    <span className="text-[10px]">{meta?.emoji ?? ''}</span>
                    <span className="text-[9px]" style={{ color: meta?.color }}>{meta?.name ?? output.resource}</span>
                  </div>
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
                  <div className="flex items-center gap-1">
                    <span className="text-[10px]">{meta?.emoji ?? ''}</span>
                    <span className="text-[9px]" style={{ color: meta?.color }}>{meta?.name ?? input.resource}</span>
                  </div>
                  <span className={`text-[9px] font-mono ${have >= needed ? 'text-gray-400' : 'text-red-400'}`}>
                    {formatNumber(have)}/{formatNumber(needed)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex gap-1.5">
        <Button
          variant="outline" size="sm"
          className={`flex-1 h-7 text-[10px] ${building.active ? 'border-red-800/50 text-red-400 hover:bg-red-900/20' : 'border-green-800/50 text-green-400 hover:bg-green-900/20'}`}
          onClick={() => store.toggleBuilding(building.id)}
        >
          {building.active ? <PowerOff className="w-2.5 h-2.5 mr-1" /> : <Power className="w-2.5 h-2.5 mr-1" />}
          {building.active ? 'Off' : 'On'}
        </Button>
        <Button
          variant="outline" size="sm"
          className={`flex-1 h-7 text-[10px] ${canAffordUpgrade ? 'border-cyan-800/50 text-cyan-400 hover:bg-cyan-900/20' : 'border-gray-700 text-gray-500'}`}
          onClick={() => store.upgradeBuilding(building.id)}
          disabled={!canAffordUpgrade}
        >
          <ChevronUp className="w-2.5 h-2.5 mr-1" /> ${formatNumber(upgradeCost)}
        </Button>
      </div>
    </motion.div>
  );
}

// =============================================
// Logistics Route Overlay
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

  // Region buildings with positions
  const regionBuildings = store.buildings.filter(b => b.regionId === activeRegion && b.gridRow !== undefined && b.gridCol !== undefined);

  // Only show routes that involve buildings in the current region
  const regionRoutes = routes.filter(r => {
    const from = store.buildings.find(b => b.id === r.fromBuildingId);
    const to = store.buildings.find(b => b.id === r.toBuildingId);
    return from?.regionId === activeRegion || to?.regionId === activeRegion;
  });

  if (!region) return null;

  const cellSize = Math.max(28, Math.min(56, Math.floor(700 / region.gridCols)));

  // Get center position of a building on the grid
  const getBuildingCenter = (buildingId: string): { x: number; y: number } | null => {
    const b = store.buildings.find(bb => bb.id === buildingId);
    if (!b || b.gridRow === undefined || b.gridCol === undefined) return null;
    const fp = getBuildingFootprint(b.type);
    return {
      x: (b.gridCol + fp.width / 2) * cellSize,
      y: (b.gridRow + fp.height / 2) * cellSize,
    };
  };

  const handleBuildingClickForRoute = (buildingId: string) => {
    if (!addRouteMode) return;
    if (!routeSourceId) {
      setRouteSourceId(buildingId);
    } else if (!routeDestId && buildingId !== routeSourceId) {
      setRouteDestId(buildingId);
      // Auto-create route with first matching resource
      const fromDef = BUILDING_DEFS[store.buildings.find(b => b.id === routeSourceId)?.type ?? ''];
      const toDef = BUILDING_DEFS[store.buildings.find(b => b.id === buildingId)?.type ?? ''];
      if (fromDef?.outputs && toDef?.inputs) {
        const matchingResource = fromDef.outputs.find(o =>
          o.resource !== 'money' && toDef.inputs.some(i => i.resource === o.resource)
        );
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
      {/* Route controls */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          variant={addRouteMode ? 'default' : 'outline'}
          size="sm"
          className={`h-7 text-[10px] ${addRouteMode ? 'bg-cyan-700 hover:bg-cyan-600' : 'border-cyan-800/50 text-cyan-400'}`}
          onClick={() => { setAddRouteMode(!addRouteMode); setRouteSourceId(null); setRouteDestId(null); }}
        >
          <Route className="w-3 h-3 mr-1" /> {addRouteMode ? 'Click Source → Dest' : 'Add Route'}
        </Button>
        <span className="text-[10px] text-gray-500">
          {regionRoutes.length} route{regionRoutes.length !== 1 ? 's' : ''} in region
        </span>
        {addRouteMode && routeSourceId && (
          <span className="text-[10px] text-yellow-400">Now click destination building...</span>
        )}
      </div>

      {/* Route list */}
      {regionRoutes.length > 0 && (
        <div className="space-y-1 max-h-64 overflow-y-auto game-scrollbar">
          {regionRoutes.map(route => {
            const fromBuilding = store.buildings.find(b => b.id === route.fromBuildingId);
            const toBuilding = store.buildings.find(b => b.id === route.toBuildingId);
            const fromDef = fromBuilding ? BUILDING_DEFS[fromBuilding.type] : null;
            const toDef = toBuilding ? BUILDING_DEFS[toBuilding.type] : null;
            const meta = RESOURCE_META[route.carriesResource];
            const isSelected = selectedRouteId === route.id;

            return (
              <div
                key={route.id}
                className={`p-2 rounded-md border transition-colors cursor-pointer ${
                  isSelected ? 'border-cyan-500/50 bg-cyan-900/20' : 'border-gray-800 bg-gray-900/40 hover:bg-gray-800/40'
                }`}
                onClick={() => setSelectedRouteId(isSelected ? null : route.id)}
              >
                <div className="flex items-center gap-1.5 text-[10px]">
                  <span>{fromDef?.emoji}</span>
                  <ChevronRight className="w-3 h-3 text-gray-500" />
                  <span>{ROUTE_TYPE_ICON[route.routeType] ?? '🔗'}</span>
                  <ChevronRight className="w-3 h-3 text-gray-500" />
                  <span>{toDef?.emoji}</span>
                  <div className="ml-auto flex items-center gap-1">
                    <span className="text-[9px]" style={{ color: meta?.color }}>{meta?.emoji} {meta?.name}</span>
                  </div>
                </div>
                {isSelected && (
                  <div className="mt-1.5 flex items-center gap-2 text-[9px] text-gray-400">
                    <span>Eff: {Math.round(route.efficiency * 100)}%</span>
                    <span>Throughput: {formatNumber(route.throughput)}/t</span>
                    <span>{route.active ? '🟢 Active' : '🔴 Inactive'}</span>
                    <Button
                      variant="ghost" size="sm"
                      className="h-5 text-[9px] text-red-400 hover:text-red-300 hover:bg-red-900/20 ml-auto"
                      onClick={(e) => { e.stopPropagation(); store.removeLogisticsRoute(route.id); }}
                    >
                      <Trash2 className="w-2.5 h-2.5 mr-0.5" /> Remove
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Interactive building list for route creation */}
      {addRouteMode && (
        <div className="space-y-1 max-h-48 overflow-y-auto game-scrollbar border border-cyan-900/30 rounded-lg p-2 bg-gray-900/60">
          <div className="text-[10px] text-cyan-400 font-semibold mb-1">Buildings in region — click to select</div>
          {regionBuildings.map(b => {
            const bDef = BUILDING_DEFS[b.type];
            if (!bDef) return null;
            const isSource = routeSourceId === b.id;
            return (
              <button
                key={b.id}
                className={`w-full text-left p-1.5 rounded-md border text-[10px] transition-colors ${
                  isSource ? 'border-cyan-500/50 bg-cyan-900/20' : 'border-gray-800 bg-gray-800/30 hover:bg-gray-700/40'
                }`}
                onClick={() => handleBuildingClickForRoute(b.id)}
              >
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

      {/* SVG route visualization info */}
      <div className="text-center text-[10px] text-gray-600 p-4">
        <Route className="w-5 h-5 mx-auto mb-1 text-gray-700" />
        Route lines display on the Grid view
      </div>
    </div>
  );
}

// =============================================
// Logistics SVG Overlay (renders on top of grid)
// Always renders when there are logistics routes
// =============================================
export function LogisticsSVGOverlay({
  routes,
  buildings,
  cellSize,
  regionId,
}: {
  routes: LogisticsRoute[];
  buildings: BuildingInstance[];
  cellSize: number;
  regionId: string;
}) {
  const regionRoutes = routes.filter(r => {
    const from = buildings.find(b => b.id === r.fromBuildingId);
    const to = buildings.find(b => b.id === r.toBuildingId);
    return from?.regionId === regionId || to?.regionId === regionId;
  });

  if (regionRoutes.length === 0) return null;

  const getCenter = (buildingId: string) => {
    const b = buildings.find(bb => bb.id === buildingId);
    if (!b || b.gridRow === undefined || b.gridCol === undefined) return null;
    const fp = getBuildingFootprint(b.type);
    return {
      x: (b.gridCol + fp.width / 2) * cellSize,
      y: (b.gridRow + fp.height / 2) * cellSize,
    };
  };

  return (
    <svg className="absolute inset-0 pointer-events-none z-10" style={{ width: '100%', height: '100%' }}>
      <defs>
        <filter id="route-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {regionRoutes.map(route => {
        const from = getCenter(route.fromBuildingId);
        const to = getCenter(route.toBuildingId);
        if (!from || !to) return null;

        const meta = RESOURCE_META[route.carriesResource];
        const color = meta?.color ?? '#00fff2';
        const mx = (from.x + to.x) / 2;
        const my = (from.y + to.y) / 2;
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const cx = mx - dy * 0.15;
        const cy = my + dx * 0.15;
        const path = `M${from.x},${from.y} Q${cx},${cy} ${to.x},${to.y}`;

        return (
          <g key={route.id}>
            <path
              d={path}
              fill="none"
              stroke={color}
              strokeWidth={Math.max(1, 2 * route.efficiency)}
              opacity={0.2 + route.efficiency * 0.4}
              filter={route.efficiency >= 0.8 ? 'url(#route-glow)' : undefined}
            />
            {/* Route type icon at midpoint */}
            <text x={mx} y={my - 6} textAnchor="middle" fontSize="10" opacity="0.7">
              {ROUTE_TYPE_ICON[route.routeType] ?? '🔗'}
            </text>
            {/* Animated flow particles */}
            {[0, 0.33, 0.66].map((offset, j) => (
              <circle key={j} r="2" fill={color} opacity="0.7">
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
    </svg>
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
      {/* Back to region overview */}
      {store.mapViewLayer !== 'region' && (
        <Button
          variant="ghost" size="sm"
          className="h-7 text-[10px] text-gray-400 hover:text-cyan-400"
          onClick={() => store.setMapViewLayer('region')}
        >
          <ArrowLeft className="w-3 h-3 mr-1" /> Map
        </Button>
      )}

      {/* Layer switcher */}
      <div className="flex items-center bg-gray-900/60 rounded-md border border-gray-800 overflow-hidden">
        {layers.map(layer => (
          <Button
            key={layer.key}
            variant="ghost" size="sm"
            className={`h-7 px-2 text-[10px] ${store.mapViewLayer === layer.key ? 'text-cyan-400 bg-cyan-900/20' : 'text-gray-500 hover:text-gray-300'}`}
            onClick={() => store.setMapViewLayer(layer.key)}
          >
            {layer.icon}
            <span className="ml-1 hidden sm:inline">{layer.label}</span>
          </Button>
        ))}
      </div>

      {/* Breadcrumb */}
      {activeRegion && store.mapViewLayer !== 'region' && (
        <div className="flex items-center gap-1 text-[10px] text-gray-500">
          <span>{activeRegion.emoji}</span>
          <span style={{ color: activeRegion.color }}>{activeRegion.name}</span>
          <ChevronRight className="w-3 h-3" />
          <span className="text-gray-400 capitalize">{store.mapViewLayer}</span>
        </div>
      )}

      {/* Mode switcher (only in grid/logistics) */}
      {store.mapViewLayer !== 'region' && (
        <div className="flex items-center bg-gray-900/60 rounded-md border border-gray-800 overflow-hidden ml-auto">
          {modes.map(mode => (
            <Button
              key={mode.key}
              variant="ghost" size="sm"
              className={`h-7 px-2 text-[10px] ${
                store.mapViewMode === mode.key
                  ? mode.key === 'demolish' ? 'text-red-400 bg-red-900/20' :
                    mode.key === 'build' ? 'text-amber-400 bg-amber-900/20' :
                    mode.key === 'route' ? 'text-cyan-400 bg-cyan-900/20' :
                    'text-gray-300 bg-gray-800/40'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
              onClick={() => store.setMapViewMode(mode.key)}
            >
              {mode.icon}
              <span className="ml-1 hidden sm:inline">{mode.label}</span>
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

  // Ensure grid/logistics always have an active region
  const activeRegion = store.activeRegion
    ? (store.mapRegions.length > 0 ? store.mapRegions : INITIAL_REGIONS).find(r => r.id === store.activeRegion)
    : null;

  return (
    <div className="h-full flex flex-col">
      <TopNavBar />

      <AnimatePresence mode="wait">
        {layer === 'region' && (
          <motion.div
            key="region"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="flex-1 overflow-y-auto game-scrollbar"
          >
            <RegionOverviewMap />
          </motion.div>
        )}

        {(layer === 'grid' || layer === 'logistics') && (
          <motion.div
            key="grid"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="flex-1 overflow-hidden"
          >
            {activeRegion ? (
              <div className="relative h-full">
                <GridFactoryView />
                {/* Logistics SVG overlay always renders when there are routes — NOT gated by logistics layer */}
              </div>
            ) : (
              <div className="text-center text-gray-500 p-8">
                <MapIcon className="w-8 h-8 mx-auto mb-2 text-gray-700" />
                Select a region from the map first
              </div>
            )}
          </motion.div>
        )}

        {layer === 'logistics' && (
          <motion.div
            key="logistics-panel"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="flex-1 overflow-y-auto game-scrollbar"
          >
            {activeRegion ? (
              <LogisticsRouteOverlay />
            ) : (
              <div className="text-center text-gray-500 p-8">
                <Route className="w-8 h-8 mx-auto mb-2 text-gray-700" />
                Select a region to manage logistics
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
