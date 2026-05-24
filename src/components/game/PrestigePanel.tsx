'use client';

import { useGameStore, formatNumber } from '@/lib/game/store';
import { PRESTIGE_BONUSES } from '@/lib/game/data';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Globe, Award, Star, Rocket, Lock, Check,
  ArrowUpRight, Zap, TrendingUp, FlaskConical, Package,
  Database, Shield, Factory
} from 'lucide-react';

export function PrestigePanel() {
  const store = useGameStore();

  const pointsEarned = Math.floor(
    store.buildings.length * 0.5 +
    store.completedResearch.length * 2 +
    store.stats.contractsCompleted
  );

  const canPrestige = store.buildings.length >= 5;
  const purchasedBonuses = store.prestigeState.bonuses.filter(b => b.purchased).length;

  const bonusIcons: Record<string, React.ReactNode> = {
    productionMultiplier: <Factory className="w-4 h-4" />,
    powerMultiplier: <Zap className="w-4 h-4" />,
    gameSpeed: <Rocket className="w-4 h-4" />,
    marketMultiplier: <TrendingUp className="w-4 h-4" />,
    storageMultiplier: <Package className="w-4 h-4" />,
    researchMultiplier: <FlaskConical className="w-4 h-4" />,
    unlockMegaFactory: <Database className="w-4 h-4" />,
    offlineMultiplier: <Shield className="w-4 h-4" />,
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-fuchsia-400 neon-glow-cyan tracking-wide">Global Expansion</h2>
          <p className="text-xs text-gray-500 mt-0.5">Reset for permanent bonuses and new possibilities</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-fuchsia-500/50 text-fuchsia-400 bg-fuchsia-900/20 text-xs">
            <Globe className="w-3 h-3 mr-1" />
            {store.prestigeState.corporationPoints} CP
          </Badge>
          <Badge variant="outline" className="border-purple-500/50 text-purple-400 bg-purple-900/20 text-xs">
            <Award className="w-3 h-3 mr-1" />
            {store.prestigeState.totalPrestiges} expansions
          </Badge>
        </div>
      </div>

      {/* Prestige Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Main Prestige Card */}
        <div className="lg:col-span-2 space-y-4">
          <div className="game-card rounded-xl bg-[#111827] p-6 border border-fuchsia-900/30">
            <div className="text-center mb-6">
              <div className="w-20 h-20 rounded-2xl bg-fuchsia-900/20 flex items-center justify-center text-4xl mx-auto mb-3 neon-pulse">
                🌍
              </div>
              <h3 className="text-lg font-bold text-fuchsia-400 neon-glow-cyan">Global Expansion</h3>
              <p className="text-xs text-gray-400 mt-1 max-w-md mx-auto">
                Reset your current factory but keep research and earn Corporation Points. 
                Use CP to purchase permanent bonuses that persist across all expansions.
              </p>
            </div>

            {/* What you keep */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-green-900/10 rounded-lg p-3 border border-green-900/30">
                <div className="text-[10px] text-green-400 font-medium mb-1">✅ You Keep</div>
                <ul className="text-[11px] text-gray-400 space-y-0.5">
                  <li>• Completed research</li>
                  <li>• Corporation Points</li>
                  <li>• Prestige bonuses</li>
                  <li>• Automation unlocks</li>
                </ul>
              </div>
              <div className="bg-red-900/10 rounded-lg p-3 border border-red-900/30">
                <div className="text-[10px] text-red-400 font-medium mb-1">❌ You Lose</div>
                <ul className="text-[11px] text-gray-400 space-y-0.5">
                  <li>• All buildings</li>
                  <li>• All resources</li>
                  <li>• Money & RP</li>
                  <li>• Workers & contracts</li>
                </ul>
              </div>
            </div>

            {/* Points preview */}
            <div className="bg-[#0a0e17] rounded-lg p-4 mb-4">
              <div className="text-center">
                <div className="text-[10px] text-gray-500 mb-1">Corporation Points You'll Earn</div>
                <div className="text-3xl font-bold font-mono text-fuchsia-400">{pointsEarned} CP</div>
                <div className="text-[10px] text-gray-500 mt-1">
                  ({store.buildings.length} buildings × 0.5) + ({store.completedResearch.length} research × 2) + ({store.stats.contractsCompleted} contracts)
                </div>
              </div>
            </div>

            <Button
              onClick={() => {
                if (confirm(`Are you sure you want to Global Expand? You'll earn ${pointsEarned} Corporation Points but lose all current progress (except research and prestige bonuses).`)) {
                  store.doPrestige();
                }
              }}
              disabled={!canPrestige}
              className={`w-full text-sm h-10 ${
                canPrestige
                  ? 'bg-fuchsia-600 hover:bg-fuchsia-500 text-white'
                  : 'bg-gray-800 text-gray-500'
              }`}
              size="sm"
            >
              <Globe className="w-4 h-4 mr-2" />
              {canPrestige ? `Global Expand (+${pointsEarned} CP)` : 'Need 5+ Buildings to Expand'}
            </Button>
          </div>

          {/* Prestige Bonuses */}
          <div className="game-card rounded-xl bg-[#111827] p-4 border border-[#1e293b]">
            <div className="flex items-center gap-2 mb-3">
              <Star className="w-4 h-4 text-fuchsia-400" />
              <h3 className="text-sm font-semibold text-fuchsia-400">Permanent Bonuses</h3>
              <span className="text-[10px] text-gray-500 ml-auto">{purchasedBonuses}/{store.prestigeState.bonuses.length}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {store.prestigeState.bonuses.map(bonus => {
                const canAfford = store.prestigeState.corporationPoints >= bonus.cost;
                const icon = bonusIcons[bonus.effect.type] || <Star className="w-4 h-4" />;

                return (
                  <div
                    key={bonus.id}
                    className={`rounded-lg p-3 border transition-all ${
                      bonus.purchased
                        ? 'bg-fuchsia-900/10 border-fuchsia-900/30'
                        : canAfford
                          ? 'bg-[#0a0e17] border-gray-800 hover:border-fuchsia-900/50'
                          : 'bg-[#0a0e17] border-gray-800 opacity-60'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                        bonus.purchased ? 'bg-fuchsia-900/30 text-fuchsia-400' : 'bg-gray-800/50 text-gray-500'
                      }`}>
                        {bonus.purchased ? <Check className="w-4 h-4" /> : icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-gray-200">{bonus.name}</div>
                        <div className="text-[10px] text-gray-400">{bonus.description}</div>
                      </div>
                    </div>
                    {!bonus.purchased && (
                      <Button
                        onClick={() => store.purchasePrestigeBonus(bonus.id)}
                        disabled={!canAfford}
                        className={`w-full mt-2 text-[10px] h-6 ${
                          canAfford ? 'bg-fuchsia-600 hover:bg-fuchsia-500 text-white' : 'bg-gray-800 text-gray-500'
                        }`}
                        size="sm"
                      >
                        {bonus.cost} CP
                      </Button>
                    )}
                    {bonus.purchased && (
                      <div className="mt-2 text-center text-[10px] text-fuchsia-400/60">
                        ✅ Active
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Current Stats */}
          <div className="game-card rounded-xl bg-[#111827] p-4 border border-[#1e293b]">
            <div className="flex items-center gap-2 mb-3">
              <Award className="w-4 h-4 text-fuchsia-400" />
              <h3 className="text-sm font-semibold text-fuchsia-400">Expansion Stats</h3>
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-500">Total Expansions</span>
                <span className="text-fuchsia-400 font-mono">{store.prestigeState.totalPrestiges}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Corporation Points</span>
                <span className="text-fuchsia-400 font-mono">{store.prestigeState.corporationPoints} CP</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Bonuses Purchased</span>
                <span className="text-green-400 font-mono">{purchasedBonuses}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Current Buildings</span>
                <span className="text-cyan-400 font-mono">{store.buildings.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Research Done</span>
                <span className="text-purple-400 font-mono">{store.completedResearch.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Contracts Done</span>
                <span className="text-rose-400 font-mono">{store.stats.contractsCompleted}</span>
              </div>
            </div>
          </div>

          {/* Active Bonuses Summary */}
          {purchasedBonuses > 0 && (
            <div className="game-card rounded-xl bg-[#111827] p-4 border border-fuchsia-900/30">
              <div className="flex items-center gap-2 mb-3">
                <Zap className="w-4 h-4 text-green-400" />
                <h3 className="text-sm font-semibold text-green-400">Active Bonuses</h3>
              </div>
              <div className="space-y-1.5">
                {store.prestigeState.bonuses.filter(b => b.purchased).map(bonus => (
                  <div key={bonus.id} className="flex items-center justify-between text-xs bg-green-900/10 rounded px-2 py-1">
                    <span className="text-green-400">{bonus.name}</span>
                    <span className="text-green-300 font-mono">+{(bonus.effect.value * 100).toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Strategy Tips */}
          <div className="game-card rounded-xl bg-[#111827] p-4 border border-[#1e293b]">
            <div className="flex items-center gap-2 mb-3">
              <Rocket className="w-4 h-4 text-gray-400" />
              <h3 className="text-sm font-semibold text-gray-400">Strategy Tips</h3>
            </div>
            <div className="space-y-2 text-[11px] text-gray-500">
              <p>• Don&apos;t expand too early — build up your factory first</p>
              <p>• Research persists, so prioritize it before expanding</p>
              <p>• Production Boost I + II stack for +75% total</p>
              <p>• Speed Boost makes the game tick faster</p>
              <p>• Mega Factory unlock requires 25 CP</p>
              <p>• Each expansion gets easier with permanent bonuses</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
