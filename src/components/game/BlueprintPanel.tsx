'use client';

import { useState, useMemo } from 'react';
import { useGameStore, formatNumber } from '@/lib/game/store';
import { BUILDING_DEFS, TRANSPORT_DEFS, PRODUCTION_CHAINS, RESOURCE_META } from '@/lib/game/configCache';
import { BuildingType, TransportType } from '@/lib/game/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Save, Download, Upload, Share2, Copy, Trash2,
  ArrowRight, Factory, ChevronDown, ChevronUp, Layout,
  Pencil, Check, X, Hammer, AlertTriangle, Clock
} from 'lucide-react';
import { LoadingSpinner } from '@/components/game/shared/LoadingSpinner';
import { GameIcon } from '@/components/game/shared/GameIcon';

// Color map for building category bars in the distribution preview
const CATEGORY_COLORS: Record<string, string> = {
  extractor: 'bg-amber-500',
  factory: 'bg-orange-500',
  power: 'bg-yellow-500',
  storage: 'bg-teal-500',
};

export function BlueprintPanel() {
  const store = useGameStore();
  const [blueprintName, setBlueprintName] = useState('');
  const [expandedBlueprint, setExpandedBlueprint] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [importCode, setImportCode] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Auto-name with timestamp
  const autoName = useMemo(() => {
    const now = new Date();
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const existing = store.blueprints.length + 1;
    return `Factory Layout #${existing} - ${monthNames[now.getMonth()]} ${now.getDate()}`;
  }, [store.blueprints.length]);

  const handleSave = () => {
    const name = blueprintName.trim() || autoName;
    setIsSaving(true);
    store.saveBlueprint(name);
    setBlueprintName('');
    setTimeout(() => setIsSaving(false), 300);
  };

  const handleCopyCode = (id: string) => {
    const code = store.exportBlueprint(id);
    if (!code) return;
    navigator.clipboard.writeText(code).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }).catch(() => {
      store.addNotification('error', 'Failed to copy blueprint code');
    });
  };

  const handleImport = () => {
    if (!importCode.trim()) return;
    const success = store.importBlueprint(importCode.trim());
    if (success) {
      setImportCode('');
      setShowImport(false);
    }
  };

  const handleRename = (id: string) => {
    if (renameValue.trim()) {
      store.renameBlueprint(id, renameValue.trim());
    }
    setRenamingId(null);
    setRenameValue('');
  };

  // Compute comparison between current factory and blueprint
  const getComparison = (bpId: string) => {
    const bp = store.blueprints.find(b => b.id === bpId);
    if (!bp) return null;

    const currentBuildingCounts: Record<string, number> = {};
    store.buildings.forEach(b => {
      currentBuildingCounts[b.type] = (currentBuildingCounts[b.type] || 0) + 1;
    });

    const currentTransportCounts: Record<string, number> = {};
    store.transportLines.forEach(t => {
      currentTransportCounts[t.type] = (currentTransportCounts[t.type] || 0) + 1;
    });

    const missingBuildings = bp.buildings
      .map(b => {
        const current = currentBuildingCounts[b.type] || 0;
        const needed = Math.max(0, b.count - current);
        const def = BUILDING_DEFS[b.type];
        const costPerBuilding = def ? (def.baseCost.find(c => c.resource === 'money')?.amount ?? 0) : 0;
        return {
          type: b.type,
          current,
          target: b.count,
          needed,
          costPerBuilding,
          totalCost: costPerBuilding * needed,
          icon: def?.icon ?? 'gi:help',
          name: def?.name ?? b.type,
        };
      })
      .filter(b => b.needed > 0);

    const totalCost = missingBuildings.reduce((sum, b) => sum + b.totalCost, 0);
    const canAfford = store.money >= totalCost;

    return { missingBuildings, totalCost, canAfford };
  };

  // Building distribution bar data
  const getDistribution = (bpId: string) => {
    const bp = store.blueprints.find(b => b.id === bpId);
    if (!bp) return [];

    const total = bp.buildings.reduce((s, b) => s + b.count, 0);
    if (total === 0) return [];

    // Group by category
    const categoryCounts: Record<string, number> = {};
    bp.buildings.forEach(b => {
      const def = BUILDING_DEFS[b.type];
      const cat = def?.category ?? 'factory';
      categoryCounts[cat] = (categoryCounts[cat] || 0) + b.count;
    });

    return Object.entries(categoryCounts).map(([cat, count]) => ({
      category: cat,
      count,
      percent: (count / total) * 100,
      color: CATEGORY_COLORS[cat] ?? 'bg-gray-500',
    }));
  };

  const formatDate = (timestamp: number) => {
    const d = new Date(timestamp);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-bold text-cyan-400 tracking-wide neon-glow-cyan">
            Blueprints
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">Save, share, and load factory layouts</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-cyan-500/50 text-cyan-400 bg-cyan-900/20 text-xs">
            <Save className="w-3 h-3 mr-1" />
            {store.blueprints.length} saved
          </Badge>
          <Button
            variant="outline"
            size="sm"
            className={`text-xs border-gray-700 ${showImport ? 'text-cyan-400 bg-cyan-900/20' : 'text-gray-400'}`}
            onClick={() => setShowImport(!showImport)}
          >
            <Upload className="w-3 h-3 mr-1" />
            Import
          </Button>
        </div>
      </div>

      {/* Import Section (collapsible) */}
      {showImport && (
        <div className="game-card rounded-xl bg-card p-4 border border-cyan-900/30">
          <div className="flex items-center gap-2 mb-3">
            <Upload className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-semibold text-cyan-400">Import Blueprint</h3>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={importCode}
              onChange={e => setImportCode(e.target.value)}
              placeholder="Paste blueprint code here..."
              className="flex-1 bg-[#0a0e17] border border-gray-800 rounded-lg px-3 py-2 text-xs text-gray-300 focus:border-cyan-500/50 focus:outline-none font-mono"
              onKeyDown={e => e.key === 'Enter' && handleImport()}
            />
            <Button
              onClick={handleImport}
              disabled={!importCode.trim()}
              className="bg-cyan-600 hover:bg-cyan-500 text-white text-xs"
              size="sm"
            >
              <Download className="w-3 h-3 mr-1" />
              Import
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-gray-500 h-8 w-8 p-0"
              onClick={() => { setShowImport(false); setImportCode(''); }}
              aria-label="Close import dialog"
            >
              <X className="w-3 h-3" />
            </Button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Save Blueprint */}
        <div className="lg:col-span-2 space-y-4">
          <div className="game-card rounded-xl bg-card p-4 border border-cyan-900/30">
            <div className="flex items-center gap-2 mb-3">
              <Save className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-semibold text-cyan-400">Save Current Layout</h3>
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
                          <GameIcon icon={def?.icon} size={12} className="inline-flex" /> {def?.name} ×{count}
                        </Badge>
                      );
                    });
                  })()}
                </div>

                {/* Transport breakdown */}
                {store.transportLines.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {(() => {
                      const counts: Record<string, number> = {};
                      store.transportLines.forEach(t => { counts[t.type] = (counts[t.type] || 0) + 1; });
                      return Object.entries(counts).map(([type, count]) => {
                        const def = TRANSPORT_DEFS[type];
                        return (
                          <Badge key={type} variant="outline" className="text-[10px] border-gray-700 text-blue-300">
                            <GameIcon icon={def?.icon} size={12} className="inline-flex" /> {def?.name} ×{count}
                          </Badge>
                        );
                      });
                    })()}
                  </div>
                )}

                {/* Name and save */}
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={blueprintName}
                    onChange={e => setBlueprintName(e.target.value)}
                    placeholder={autoName}
                    className="flex-1 bg-[#0a0e17] border border-gray-800 rounded-lg px-3 py-2 text-xs text-gray-300 focus:border-cyan-500/50 focus:outline-none placeholder:text-gray-600"
                    onKeyDown={e => e.key === 'Enter' && handleSave()}
                  />
                  <Button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="bg-cyan-600 hover:bg-cyan-500 text-white text-xs"
                    size="sm"
                  >
                    {isSaving ? <LoadingSpinner /> : <Save className="w-3 h-3 mr-1" />}
                    Save
                  </Button>
                </div>
                <p className="text-[9px] text-gray-600 mt-1.5">Leave name blank for auto-name: &quot;{autoName}&quot;</p>
              </>
            )}
          </div>

          {/* Saved Blueprints List */}
          <div className="game-card rounded-xl bg-card p-4 border border-border">
            <div className="flex items-center gap-2 mb-3">
              <Layout className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-semibold text-cyan-400">Saved Blueprints</h3>
            </div>
            {store.blueprints.length === 0 ? (
              <div className="text-center py-8">
                <Save className="w-10 h-10 text-gray-700 mx-auto mb-2" />
                <p className="text-xs text-gray-500">No blueprints saved yet</p>
                <p className="text-[10px] text-gray-600 mt-1">Save your factory layout to recreate it later</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[500px] overflow-y-auto game-scrollbar relative">
                {store.blueprints.map(bp => {
                  const isExpanded = expandedBlueprint === bp.id;
                  const isRenaming = renamingId === bp.id;
                  const distribution = getDistribution(bp.id);
                  const totalBuildings = bp.buildings.reduce((s, b) => s + b.count, 0);
                  const totalTransport = bp.transportLines.reduce((s, t) => s + t.count, 0);
                  const comparison = isExpanded ? getComparison(bp.id) : null;

                  return (
                    <div key={bp.id} className="bg-[#0a0e17] rounded-lg border border-gray-800 hover:border-cyan-900/40">
                      {/* Header row */}
                      <div className="flex items-center justify-between p-3">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <Layout className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                          <div className="min-w-0 flex-1">
                            {isRenaming ? (
                              <div className="flex items-center gap-1">
                                <input
                                  type="text"
                                  value={renameValue}
                                  onChange={e => setRenameValue(e.target.value)}
                                  className="flex-1 bg-card border border-cyan-800 rounded px-2 py-0.5 text-xs text-gray-200 focus:outline-none"
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') handleRename(bp.id);
                                    if (e.key === 'Escape') setRenamingId(null);
                                  }}
                                  autoFocus
                                />
                                <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-success min-h-[36px] min-w-[36px]" onClick={() => handleRename(bp.id)} aria-label="Confirm rename">
                                  <Check className="w-3 h-3" />
                                </Button>
                                <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-red-400 min-h-[36px] min-w-[36px]" onClick={() => setRenamingId(null)} aria-label="Cancel rename">
                                  <X className="w-3 h-3" />
                                </Button>
                              </div>
                            ) : (
                              <>
                                <div className="text-xs font-medium text-gray-200 truncate">{bp.name}</div>
                                <div className="text-[9px] text-gray-500">
                                  {totalBuildings} buildings • {totalTransport} transport • {formatDate(bp.savedAt)}
                                  {bp.shared && <span className="ml-1 text-cyan-500">• shared</span>}
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 text-gray-500 hover:text-cyan-400 min-h-[36px] min-w-[36px]"
                                onClick={() => {
                                  setRenamingId(bp.id);
                                  setRenameValue(bp.name);
                                }}
                                aria-label="Rename blueprint"
                              >
                                <Pencil className="w-3 h-3" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="bg-card border-cyan-900/30 text-xs">Rename</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 text-gray-500 hover:text-cyan-400 min-h-[36px] min-w-[36px]"
                                onClick={() => handleCopyCode(bp.id)}
                                aria-label="Export share code"
                              >
                                {copiedId === bp.id ? <Check className="w-3 h-3 text-success" /> : <Share2 className="w-3 h-3" />}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="bg-card border-cyan-900/30 text-xs">
                              {copiedId === bp.id ? 'Copied!' : 'Export share code'}
                            </TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 text-gray-500 hover:text-red-400 min-h-[36px] min-w-[36px]"
                                onClick={() => {
                                  if (confirm('Are you sure you want to delete this blueprint? This cannot be undone.')) {
                                    store.deleteBlueprint(bp.id);
                                  }
                                }}
                                aria-label="Delete blueprint"
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="bg-card border-cyan-900/30 text-xs">Delete</TooltipContent>
                          </Tooltip>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-gray-500 min-h-[36px] min-w-[36px]"
                            onClick={() => setExpandedBlueprint(isExpanded ? null : bp.id)}
                            aria-label={isExpanded ? 'Collapse blueprint details' : 'Expand blueprint details'}
                            aria-expanded={isExpanded}
                          >
                            {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          </Button>
                        </div>
                      </div>

                      {/* Distribution bar */}
                      {distribution.length > 0 && (
                        <div className="px-3 pb-1">
                          <div className="flex h-1.5 rounded-full overflow-hidden bg-gray-800">
                            {distribution.map((d, i) => (
                              <div
                                key={i}
                                className={`${d.color} transition-all duration-300`}
                                style={{ width: `${d.percent}%` }}
                              />
                            ))}
                          </div>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            {distribution.map((d, i) => (
                              <span key={i} className="text-[9px] text-gray-500 flex items-center gap-0.5">
                                <span className={`w-1.5 h-1.5 rounded-full ${d.color}`} />
                                {d.category} {d.count}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Expanded detail */}
                      {isExpanded && (
                        <div className="px-3 pb-3 pt-2 border-t border-gray-800">
                          {/* Blueprint buildings list */}
                          <div className="text-[10px] text-gray-500 font-medium mb-1.5">Blueprint Contents</div>
                          <div className="flex flex-wrap gap-1.5 mb-3">
                            {bp.buildings.map(b => {
                              const def = BUILDING_DEFS[b.type];
                              return (
                                <Badge key={b.type} variant="outline" className="text-[10px] border-gray-700 text-gray-300">
                                  <GameIcon icon={def?.icon} size={12} className="inline-flex" /> {def?.name} ×{b.count}
                                </Badge>
                              );
                            })}
                            {bp.transportLines.map(t => {
                              const def = TRANSPORT_DEFS[t.type];
                              return (
                                <Badge key={t.type} variant="outline" className="text-[10px] border-blue-800 text-blue-300">
                                  <GameIcon icon={def?.icon} size={12} className="inline-flex" /> {def?.name} ×{t.count}
                                </Badge>
                              );
                            })}
                          </div>

                          {/* Comparison: Missing buildings */}
                          {comparison && comparison.missingBuildings.length > 0 && (
                            <div className="bg-[#0a0e17] rounded-lg p-3 mb-3 border border-amber-900/20">
                              <div className="text-[10px] text-amber-400 font-medium mb-2 flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" />
                                Missing Buildings to Complete Layout
                              </div>
                              <div className="space-y-1.5">
                                {comparison.missingBuildings.map(mb => (
                                  <div key={mb.type} className="flex items-center justify-between text-[11px]">
                                    <div className="flex items-center gap-1.5">
                                      <GameIcon icon={mb.icon} size={14} className="inline-flex" />
                                      <span className="text-gray-300">{mb.name}</span>
                                      <span className="text-gray-500">
                                        ({mb.current}/{mb.target})
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <span className="text-amber-400">+{mb.needed}</span>
                                      <span className="text-gray-600">@</span>
                                      <span className="text-gray-400">${formatNumber(mb.totalCost)}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                              <div className="mt-2 pt-2 border-t border-gray-800 flex items-center justify-between">
                                <div className="text-[11px] text-gray-400">
                                  Total cost: <span className={comparison.canAfford ? 'text-success' : 'text-red-400'}>${formatNumber(comparison.totalCost)}</span>
                                </div>
                                <div className="text-[10px] text-gray-500">
                                  Balance: ${formatNumber(store.money)}
                                </div>
                              </div>
                            </div>
                          )}

                          {/* All buildings match */}
                          {comparison && comparison.missingBuildings.length === 0 && (
                            <div className="bg-green-900/10 rounded-lg p-3 mb-3 border border-success/20">
                              <div className="text-[10px] text-success flex items-center gap-1">
                                <Check className="w-3 h-3" /> Your factory already matches this blueprint!
                              </div>
                            </div>
                          )}

                          {/* Action buttons */}
                          <div className="flex items-center gap-2">
                            {comparison && comparison.missingBuildings.length > 0 && (
                              <Button
                                onClick={() => store.loadBlueprint(bp.id)}
                                disabled={!comparison.canAfford && comparison.missingBuildings.length > 0}
                                className={`flex-1 text-xs h-8 ${
                                  comparison.canAfford
                                    ? 'bg-cyan-600 hover:bg-cyan-500 text-white'
                                    : 'bg-gray-800 text-gray-500'
                                }`}
                                size="sm"
                              >
                                <Hammer className="w-3 h-3 mr-1" />
                                {comparison.canAfford ? `Build All (${comparison.missingBuildings.reduce((s, b) => s + b.needed, 0)} buildings)` : 'Insufficient Funds'}
                              </Button>
                            )}
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
          {/* Share Code Section */}
          <div className="game-card rounded-xl bg-card p-4 border border-border">
            <div className="flex items-center gap-2 mb-3">
              <Share2 className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-semibold text-cyan-400">Share Blueprints</h3>
            </div>
            <div className="space-y-2 text-[11px] text-gray-500">
              <p className="flex items-start gap-1.5">
                <Share2 className="w-3 h-3 mt-0.5 flex-shrink-0 text-cyan-600" />
                Click the share icon on any blueprint to copy its code
              </p>
              <p className="flex items-start gap-1.5">
                <Download className="w-3 h-3 mt-0.5 flex-shrink-0 text-cyan-600" />
                Paste codes into the Import section to load shared layouts
              </p>
              <p className="flex items-start gap-1.5">
                <Copy className="w-3 h-3 mt-0.5 flex-shrink-0 text-cyan-600" />
                Share codes are compact base64 strings you can send anywhere
              </p>
            </div>
          </div>

          {/* Production Chains Reference */}
          <div className="game-card rounded-xl bg-card p-4 border border-border">
            <div className="flex items-center gap-2 mb-3">
              <ArrowRight className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-semibold text-cyan-400">Production Chains</h3>
            </div>
            <div className="space-y-2 max-h-80 overflow-y-auto game-scrollbar">
              {PRODUCTION_CHAINS.map((chain, i) => (
                <div key={i} className="bg-[#0a0e17] rounded-lg p-2">
                  <div className="text-[10px] text-gray-400 font-medium mb-1">{chain.name}</div>
                  <div className="flex items-center gap-1 flex-wrap">
                    {chain.steps.map((step, j) => (
                      <div key={j} className="flex items-center gap-1">
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-300">
                          <GameIcon icon={RESOURCE_META[step as keyof typeof RESOURCE_META]?.icon} size={12} className="inline-flex" /> {RESOURCE_META[step as keyof typeof RESOURCE_META]?.name}
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
          <div className="game-card rounded-xl bg-card p-4 border border-border">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-gray-400" />
              <h3 className="text-sm font-semibold text-gray-400">Blueprint Tips</h3>
            </div>
            <div className="space-y-2 text-[11px] text-gray-500">
              <p>• Save layouts before trying risky changes</p>
              <p>• Share codes work across different saves</p>
              <p>• Use production chains as building guides</p>
              <p>• Balance extractors → factories → power</p>
              <p>• &quot;Build All&quot; only builds missing buildings</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
