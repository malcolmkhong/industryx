'use client';

import { useGameStore, formatNumber } from '@/lib/game/store';
import { AUTOMATION_UNLOCKS, RESEARCH_TREE } from '@/lib/game/configCache';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Bot, Lock, Check, Zap, ArrowRight, Brain,
  RefreshCw, Scale, Wrench, TrendingUp, Building, Package
} from 'lucide-react';
import { GameItemTooltip } from '@/components/game/GameItemTooltip';
import { GameIcon } from '@/components/game/shared/GameIcon';

const AUTO_ICONS: Record<string, React.ReactNode> = {
  autoRouting: <RefreshCw className="w-5 h-5" />,
  autoBalancing: <Scale className="w-5 h-5" />,
  selfRepair: <Wrench className="w-5 h-5" />,
  autoTrading: <TrendingUp className="w-5 h-5" />,
  autoExpansion: <Building className="w-5 h-5" />,
  smartStorage: <Package className="w-5 h-5" />,
  aiOptimization: <Brain className="w-5 h-5" />,
};

export function AutomationPanel() {
  const store = useGameStore();

  const activeCount = store.automationUnlocks.filter(a => a.active).length;
  const totalCount = store.automationUnlocks.length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-teal-400 neon-glow-cyan tracking-wide">Automation Systems</h2>
          <p className="text-xs text-gray-500 mt-0.5">Unlock AI-powered automation to grow your empire</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-teal-500/50 text-teal-400 bg-teal-900/20 text-xs">
            <Bot className="w-3 h-3 mr-1" />
            {activeCount}/{totalCount} active
          </Badge>
          <Badge variant="outline" className="border-fuchsia-500/50 text-fuchsia-400 bg-fuchsia-900/20 text-xs">
            {store.prestigeState.corporationPoints} CP
          </Badge>
        </div>
      </div>

      {/* Progress */}
      <div className="game-card rounded-xl bg-card p-4 border border-teal-900/30">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-gray-400">Automation Progress</span>
          <span className="text-xs text-teal-400 font-mono">{activeCount}/{totalCount}</span>
        </div>
        <div className="h-3 bg-gray-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-teal-600 to-teal-400 rounded-full transition-all duration-500"
            style={{ width: `${(activeCount / totalCount) * 100}%` }}
          />
        </div>
      </div>

      {/* Automation Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {store.automationUnlocks.map(unlock => {
          const isActive = unlock.active;
          const canAfford = store.prestigeState.corporationPoints >= unlock.cost;
          const requiredResearch = unlock.requiresResearch
            ? RESEARCH_TREE.find(r => r.id === unlock.requiresResearch)
            : null;
          const hasResearch = !unlock.requiresResearch || store.completedResearch.includes(unlock.requiresResearch);
          const canActivate = !isActive && hasResearch && canAfford;

          return (
            <GameItemTooltip
              key={unlock.type}
              name={unlock.name}
              icon={unlock.icon}
              description={unlock.description}
              category="Automation"
              details={[
                { label: 'Cost', value: `${unlock.cost} CP`, color: canAfford ? 'text-green-400' : 'text-red-400' },
                { label: 'Status', value: isActive ? 'Active' : 'Inactive', color: isActive ? 'text-green-400' : 'text-gray-400' },
              ]}
              requirements={[
                ...(unlock.requiresResearch ? [{ label: 'Research', value: RESEARCH_TREE.find(r => r.id === unlock.requiresResearch)?.name ?? unlock.requiresResearch, color: hasResearch ? 'text-green-400' : 'text-red-400' }] : []),
              ]}
              side="bottom"
            >
            <div
              className={`game-card rounded-xl bg-card p-4 border ${
                isActive
                  ? 'border-teal-500/50 bg-teal-900/5'
                  : canActivate
                    ? 'border-cyan-900/30 hover:border-teal-500/30'
                    : 'border-gray-800 opacity-60'
              }`}
            >
              <div className="flex items-start gap-3 mb-3">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                  isActive ? 'bg-teal-900/30 text-teal-400' : 'bg-gray-800/50 text-gray-500'
                }`}>
                  {AUTO_ICONS[unlock.type] || <Bot className="w-5 h-5" />}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-gray-200">{unlock.name}</span>
                    {isActive && (
                      <Badge className="text-[9px] bg-teal-900/30 text-teal-400 border-0">
                        <Check className="w-2.5 h-2.5 mr-0.5" /> Active
                      </Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-400 mt-0.5">{unlock.description}</p>
                </div>
              </div>

              {/* Requirements */}
              <div className="space-y-2 mb-3">
                {/* Research requirement */}
                {requiredResearch && (
                  <div className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg ${
                    hasResearch ? 'bg-green-900/10 text-green-400' : 'bg-red-900/10 text-red-400'
                  }`}>
                    {hasResearch ? <Check className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                    <span>Research: {requiredResearch.name}</span>
                  </div>
                )}

                {/* Cost */}
                <div className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg ${
                  isActive ? 'bg-gray-800/30 text-gray-500' :
                  canAfford ? 'bg-green-900/10 text-green-400' : 'bg-red-900/10 text-red-400'
                }`}>
                  <Zap className="w-3 h-3" />
                  <span>Cost: {unlock.cost} Corporation Points</span>
                </div>
              </div>

              {/* Activate button */}
              {!isActive && (
                <Button
                  onClick={() => store.activateAutomation(unlock.type)}
                  disabled={!canActivate}
                  className={`w-full text-xs h-8 min-h-[36px] ${
                    canActivate ? 'bg-teal-600 hover:bg-teal-500 text-white' : 'bg-gray-800 text-gray-500'
                  }`}
                  size="sm"
                >
                  {canActivate ? (
                    <><Zap className="w-3 h-3 mr-1" /> Activate ({unlock.cost} CP)</>
                  ) : !hasResearch ? (
                    <><Lock className="w-3 h-3 mr-1" /> Research Required</>
                  ) : (
                    <><Lock className="w-3 h-3 mr-1" /> Need {unlock.cost} CP</>
                  )}
                </Button>
              )}

              {isActive && (
                <div className="text-center text-xs text-teal-400/60">
                  <GameIcon icon="gi:sparkles" size={14} className="inline" /> Running automatically
                </div>
              )}
            </div>
            </GameItemTooltip>
          );
        })}
      </div>

      {/* Info Section */}
      <div className="game-card rounded-xl bg-card p-4 border border-border">
        <div className="flex items-center gap-2 mb-3">
          <Brain className="w-4 h-4 text-teal-400" />
          <h3 className="text-sm font-semibold text-teal-400">About Automation</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px] text-gray-400">
          <div>
            <h4 className="text-xs text-gray-300 font-medium mb-1">How It Works</h4>
            <p>Automation systems use Corporation Points (CP) earned through Global Expansion and high-tier contracts. Once activated, they run passively in the background.</p>
          </div>
          <div>
            <h4 className="text-xs text-gray-300 font-medium mb-1">Getting CP</h4>
            <p>Earn CP by completing ★★★★+ contracts or by performing Global Expansion (prestige reset). Each automation unlock costs CP.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
