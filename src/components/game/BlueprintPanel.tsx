'use client';

import { useState } from 'react';
import { useGameStore, formatNumber } from '@/lib/game/store';
import { BUILDING_DEFS, RESOURCE_META, PRODUCTION_CHAINS } from '@/lib/game/data';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Save, Download, Upload, Share2, Copy, Trash2,
  ArrowRight, Factory, ChevronDown, ChevronUp, Layout
} from 'lucide-react';

interface SavedBlueprint {
  id: string;
  name: string;
  buildings: { type: string; count: number }[];
  transportLines: number;
  savedAt: number;
  totalCost: number;
}

export function BlueprintPanel() {
  const store = useGameStore();
  const [blueprints, setBlueprints] = useState<SavedBlueprint[]>([]);
  const [blueprintName, setBlueprintName] = useState('');
  const [expandedBlueprint, setExpandedBlueprint] = useState<string | null>(null);

  const handleSave = () => {
    if (!blueprintName.trim()) return;

    // Group buildings by type
    const buildingCounts: Record<string, number> = {};
    store.buildings.forEach(b => {
      buildingCounts[b.type] = (buildingCounts[b.type] || 0) + 1;
    });

    const buildings = Object.entries(buildingCounts).map(([type, count]) => ({ type, count }));
    const totalCost = buildings.reduce((sum, b) => {
      const def = BUILDING_DEFS[b.type];
      return sum + (def?.baseCost.find(c => c.resource === 'money')?.amount ?? 0) * b.count;
    }, 0);

    const bp: SavedBlueprint = {
      id: Date.now().toString(36),
      name: blueprintName,
      buildings,
      transportLines: store.transportLines.length,
      savedAt: store.gameTick,
      totalCost,
    };

    setBlueprints(prev => [bp, ...prev]);
    setBlueprintName('');
    store.addNotification('success', `Blueprint saved: ${bp.name}`);
  };

  const handleDelete = (id: string) => {
    setBlueprints(prev => prev.filter(bp => bp.id !== id));
  };

  const handleCopy = (bp: SavedBlueprint) => {
    const text = JSON.stringify(bp, null, 2);
    navigator.clipboard.writeText(text).then(() => {
      store.addNotification('success', `Blueprint copied to clipboard: ${bp.name}`);
    }).catch(() => {
      store.addNotification('error', 'Failed to copy blueprint');
    });
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-indigo-400 neon-glow-cyan tracking-wide">Blueprints</h2>
          <p className="text-xs text-gray-500 mt-0.5">Save, share, and load factory layouts</p>
        </div>
        <Badge variant="outline" className="border-indigo-500/50 text-indigo-400 bg-indigo-900/20 text-xs">
          <Save className="w-3 h-3 mr-1" />
          {blueprints.length} saved
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Save Blueprint */}
        <div className="lg:col-span-2 space-y-4">
          <div className="game-card rounded-xl bg-[#111827] p-4 border border-indigo-900/30">
            <div className="flex items-center gap-2 mb-3">
              <Save className="w-4 h-4 text-indigo-400" />
              <h3 className="text-sm font-semibold text-indigo-400">Save Current Layout</h3>
            </div>

            {store.buildings.length === 0 ? (
              <div className="text-center py-6">
                <Factory className="w-10 h-10 text-gray-700 mx-auto mb-2" />
                <p className="text-xs text-gray-500">No buildings to save</p>
                <p className="text-[10px] text-gray-600 mt-1">Build some structures first, then save your layout</p>
              </div>
            ) : (
              <>
                {/* Current layout summary */}
                <div className="bg-[#0a0e17] rounded-lg p-3 mb-3">
                  <div className="text-[10px] text-gray-500 mb-2">Current Factory Layout</div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
                    <div>
                      <div className="text-gray-500">Buildings</div>
                      <div className="font-mono text-cyan-400 font-bold">{store.buildings.length}</div>
                    </div>
                    <div>
                      <div className="text-gray-500">Transport</div>
                      <div className="font-mono text-blue-400 font-bold">{store.transportLines.length}</div>
                    </div>
                    <div>
                      <div className="text-gray-500">Workers</div>
                      <div className="font-mono text-sky-400 font-bold">{store.workers.length}</div>
                    </div>
                    <div>
                      <div className="text-gray-500">Power</div>
                      <div className="font-mono text-yellow-400 font-bold">{formatNumber(store.powerGrid.totalProduction)}MW</div>
                    </div>
                  </div>
                </div>

                {/* Building breakdown */}
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {(() => {
                    const counts: Record<string, number> = {};
                    store.buildings.forEach(b => { counts[b.type] = (counts[b.type] || 0) + 1; });
                    return Object.entries(counts).map(([type, count]) => {
                      const def = BUILDING_DEFS[type];
                      return (
                        <Badge key={type} variant="outline" className="text-[10px] border-gray-700 text-gray-300">
                          {def?.emoji} {def?.name} ×{count}
                        </Badge>
                      );
                    });
                  })()}
                </div>

                {/* Name and save */}
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={blueprintName}
                    onChange={e => setBlueprintName(e.target.value)}
                    placeholder="Blueprint name..."
                    className="flex-1 bg-[#0a0e17] border border-gray-800 rounded-lg px-3 py-2 text-xs text-gray-300 focus:border-indigo-500/50 focus:outline-none"
                    onKeyDown={e => e.key === 'Enter' && handleSave()}
                  />
                  <Button
                    onClick={handleSave}
                    disabled={!blueprintName.trim()}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs"
                    size="sm"
                  >
                    <Save className="w-3 h-3 mr-1" />
                    Save
                  </Button>
                </div>
              </>
            )}
          </div>

          {/* Saved Blueprints List */}
          <div className="game-card rounded-xl bg-[#111827] p-4 border border-[#1e293b]">
            <div className="flex items-center gap-2 mb-3">
              <Layout className="w-4 h-4 text-indigo-400" />
              <h3 className="text-sm font-semibold text-indigo-400">Saved Blueprints</h3>
            </div>
            {blueprints.length === 0 ? (
              <div className="text-center py-8">
                <Save className="w-10 h-10 text-gray-700 mx-auto mb-2" />
                <p className="text-xs text-gray-500">No blueprints saved yet</p>
                <p className="text-[10px] text-gray-600 mt-1">Save your factory layout to recreate it later</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto game-scrollbar">
                {blueprints.map(bp => {
                  const isExpanded = expandedBlueprint === bp.id;
                  return (
                    <div key={bp.id} className="bg-[#0a0e17] rounded-lg border border-gray-800">
                      <div className="flex items-center justify-between p-3">
                        <div className="flex items-center gap-2">
                          <Layout className="w-4 h-4 text-indigo-400" />
                          <div>
                            <div className="text-xs font-medium text-gray-200">{bp.name}</div>
                            <div className="text-[9px] text-gray-500">
                              {bp.buildings.length} types • {bp.transportLines} lines • Saved at tick {formatNumber(bp.savedAt)}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-gray-500 hover:text-indigo-400"
                            onClick={() => handleCopy(bp)}
                          >
                            <Copy className="w-3 h-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-gray-500 hover:text-red-400"
                            onClick={() => handleDelete(bp.id)}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-gray-500"
                            onClick={() => setExpandedBlueprint(isExpanded ? null : bp.id)}
                          >
                            {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          </Button>
                        </div>
                      </div>
                      {isExpanded && (
                        <div className="px-3 pb-3 pt-0 border-t border-gray-800">
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {bp.buildings.map(b => {
                              const def = BUILDING_DEFS[b.type];
                              return (
                                <Badge key={b.type} variant="outline" className="text-[10px] border-gray-700 text-gray-300">
                                  {def?.emoji} {def?.name} ×{b.count}
                                </Badge>
                              );
                            })}
                          </div>
                          <div className="mt-2 text-[10px] text-gray-500">
                            Est. cost: ${formatNumber(bp.totalCost)} • Transport: {bp.transportLines} lines
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Production Chains Reference */}
          <div className="game-card rounded-xl bg-[#111827] p-4 border border-[#1e293b]">
            <div className="flex items-center gap-2 mb-3">
              <ArrowRight className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-semibold text-cyan-400">Production Chains</h3>
            </div>
            <div className="space-y-2">
              {PRODUCTION_CHAINS.map((chain, i) => (
                <div key={i} className="bg-[#0a0e17] rounded-lg p-2">
                  <div className="text-[10px] text-gray-400 font-medium mb-1">{chain.name}</div>
                  <div className="flex items-center gap-1 flex-wrap">
                    {chain.steps.map((step, j) => (
                      <div key={j} className="flex items-center gap-1">
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-300">
                          {RESOURCE_META[step as keyof typeof RESOURCE_META]?.emoji} {RESOURCE_META[step as keyof typeof RESOURCE_META]?.name}
                        </span>
                        {j < chain.steps.length - 1 && (
                          <ArrowRight className="w-2.5 h-2.5 text-gray-600 flex-shrink-0" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Tips */}
          <div className="game-card rounded-xl bg-[#111827] p-4 border border-[#1e293b]">
            <div className="flex items-center gap-2 mb-3">
              <Share2 className="w-4 h-4 text-gray-400" />
              <h3 className="text-sm font-semibold text-gray-400">Blueprint Tips</h3>
            </div>
            <div className="space-y-2 text-[11px] text-gray-500">
              <p>• Save layouts before trying risky changes</p>
              <p>• Copy blueprints as JSON to share</p>
              <p>• Use production chains as building guides</p>
              <p>• Balance extractors → factories → power</p>
              <p>• Start with iron chain, then expand</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
