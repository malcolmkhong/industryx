'use client';

import { useState, useMemo } from 'react';
import { useGameStore, formatNumber } from '@/lib/game/store';
import { PRESTIGE_BONUSES, BUILDING_DEFS } from '@/lib/game/data';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Globe, Award, Star, Rocket, Lock, Check,
  ArrowUpRight, Zap, TrendingUp, FlaskConical, Package,
  Database, Shield, Factory, AlertTriangle, ChevronRight
} from 'lucide-react';
import { GameIcon } from './shared/GameIcon';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter, DialogClose
} from '@/components/ui/dialog';
import {
  Tooltip, TooltipTrigger, TooltipContent
} from '@/components/ui/tooltip';

export function PrestigePanel() {
  const store = useGameStore();
  const [showPrestigeDialog, setShowPrestigeDialog] = useState(false);
  const [confirmStep, setConfirmStep] = useState(0);

  const pointsEarned = Math.floor(
    store.buildings.length * 0.5 +
    store.completedResearch.length * 2 +
    store.stats.contractsCompleted
  );

  const canPrestige = store.buildings.length >= 5;
  const purchasedBonuses = store.prestigeState.bonuses.filter(b => b.purchased).length;

  // Progress toward next CP
  const nextCPBuildings = store.buildings.length < 2 ? 2 - store.buildings.length : 0;
  const nextCPResearch = store.completedResearch.length < 1 ? 1 - store.completedResearch.length : 0;

  // Current money production rate for tooltip calculations — derived from snapshot
  // (payoutPerCycle / basePayoutInterval gives per-tick payout income + endgame passive)
  const moneyPerTick = useMemo(() => {
    const payoutPerTick = (store.productionSnapshot.payoutPerCycle ?? 0) / 100;
    const endgameMoney = store.productionSnapshot.endgameMoney ?? 0;
    return payoutPerTick + endgameMoney;
  }, [store.productionSnapshot.payoutPerCycle, store.productionSnapshot.endgameMoney]);

  // Prestige bonus effect descriptions
  const bonusDetails: Record<string, {
    plainLanguage: string;
    currentValue: string;
    scalingNote: string;
  }> = {
    productionMultiplier: {
      plainLanguage: 'Increases the production rate of all buildings. Every building produces resources faster, meaning more output per tick.',
      currentValue: store.prestigeState.bonuses.filter(b => b.purchased && b.effect.type === 'productionMultiplier').length > 0
        ? `+${(store.prestigeState.bonuses.filter(b => b.purchased && b.effect.type === 'productionMultiplier').reduce((s, b) => s + b.effect.value, 0) * 100).toFixed(0)}% production → currently +$${formatNumber(moneyPerTick * store.prestigeState.bonuses.filter(b => b.purchased && b.effect.type === 'productionMultiplier').reduce((s, b) => s + b.effect.value, 0))}/tick`
        : 'No production bonus active yet',
      scalingNote: 'Stacks additively: Production Boost I (+25%) + Production Boost II (+50%) = +75% total',
    },
    powerMultiplier: {
      plainLanguage: 'Increases the power output of all power plants. More power means higher efficiency for your entire factory.',
      currentValue: store.prestigeState.bonuses.filter(b => b.purchased && b.effect.type === 'powerMultiplier').length > 0
        ? `+${(store.prestigeState.bonuses.filter(b => b.purchased && b.effect.type === 'powerMultiplier').reduce((s, b) => s + b.effect.value, 0) * 100).toFixed(0)}% power generation`
        : 'No power bonus active yet',
      scalingNote: 'Stacks additively with research bonuses. More power = better factory efficiency.',
    },
    gameSpeed: {
      plainLanguage: 'Increases the game tick speed. The simulation runs faster, so resources are produced and research completes sooner.',
      currentValue: store.prestigeState.bonuses.filter(b => b.purchased && b.effect.type === 'gameSpeed').length > 0
        ? `+${(store.prestigeState.bonuses.filter(b => b.purchased && b.effect.type === 'gameSpeed').reduce((s, b) => s + b.effect.value, 0) * 100).toFixed(0)}% game speed`
        : 'No speed bonus active yet',
      scalingNote: 'Makes everything happen faster. Extremely valuable for long play sessions.',
    },
    marketMultiplier: {
      plainLanguage: 'Improves sell prices on the market. Every resource you sell generates more money per unit.',
      currentValue: store.prestigeState.bonuses.filter(b => b.purchased && b.effect.type === 'marketMultiplier').length > 0
        ? `+${(store.prestigeState.bonuses.filter(b => b.purchased && b.effect.type === 'marketMultiplier').reduce((s, b) => s + b.effect.value, 0) * 100).toFixed(0)}% sell prices`
        : 'No market bonus active yet',
      scalingNote: 'Stacks with Market Analysis research (+20%). Combined = much better margins.',
    },
    storageMultiplier: {
      plainLanguage: 'Increases resource storage capacity. Each storage unit holds more, reducing overflow waste.',
      currentValue: store.prestigeState.bonuses.filter(b => b.purchased && b.effect.type === 'storageMultiplier').length > 0
        ? `+${(store.prestigeState.bonuses.filter(b => b.purchased && b.effect.type === 'storageMultiplier').reduce((s, b) => s + b.effect.value, 0) * 100).toFixed(0)}% storage`
        : 'No storage bonus active yet',
      scalingNote: 'Reduces the need for frequent storage upgrades. Saves money long-term.',
    },
    researchMultiplier: {
      plainLanguage: 'Speeds up all research. Research progress ticks faster, so you unlock new tech sooner.',
      currentValue: store.prestigeState.bonuses.filter(b => b.purchased && b.effect.type === 'researchMultiplier').length > 0
        ? `+${(store.prestigeState.bonuses.filter(b => b.purchased && b.effect.type === 'researchMultiplier').reduce((s, b) => s + b.effect.value, 0) * 100).toFixed(0)}% research speed`
        : 'No research bonus active yet',
      scalingNote: 'Research persists through prestiges, so faster research = stronger resets.',
    },
    unlockMegaFactory: {
      plainLanguage: 'Unlocks Mega Factory buildings that have extremely high production rates and unique capabilities.',
      currentValue: store.prestigeState.megaFactoryUnlocked ? 'Mega Factories unlocked!' : 'Not yet unlocked',
      scalingNote: 'One-time unlock. Mega Factories are the most powerful buildings in the game.',
    },
    offlineMultiplier: {
      plainLanguage: 'Increases the production rate while you are offline. Your factories continue working even when you\'re away.',
      currentValue: store.prestigeState.bonuses.filter(b => b.purchased && b.effect.type === 'offlineMultiplier').length > 0
        ? `+${(store.prestigeState.bonuses.filter(b => b.purchased && b.effect.type === 'offlineMultiplier').reduce((s, b) => s + b.effect.value, 0) * 100).toFixed(0)}% offline production`
        : 'No offline bonus active yet',
      scalingNote: 'Base offline rate is 50%. This bonus doubles it to 100% or more.',
    },
  };

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

  const handlePrestigeConfirm = () => {
    if (confirmStep === 0) {
      setConfirmStep(1);
    } else {
      store.doPrestige();
      setShowPrestigeDialog(false);
      setConfirmStep(0);
    }
  };

  const handleDialogClose = () => {
    setShowPrestigeDialog(false);
    setConfirmStep(0);
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

      {/* Progress Indicator - toward next CP */}
      <div className="game-card rounded-xl bg-card p-4 border border-fuchsia-900/20">
        <div className="flex items-center gap-2 mb-2">
          <Star className="w-4 h-4 text-fuchsia-400" />
          <h3 className="text-sm font-semibold text-fuchsia-400">Progress to Next CP</h3>
          <span className="text-[10px] text-gray-500 ml-auto">Current: {pointsEarned} CP potential</span>
        </div>
        <div className="h-3 bg-gray-800 rounded-full overflow-hidden mb-2">
          <div
            className="h-full rounded-full transition-all duration-500 bg-gradient-to-r from-fuchsia-600 to-fuchsia-400"
            style={{ width: `${Math.min(100, (pointsEarned / Math.max(1, pointsEarned + 2)) * 100)}%` }}
          >
            <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent" />
          </div>
        </div>
        <div className="flex items-center gap-4 text-[10px] text-gray-500">
          <span>Next CP from:</span>
          {nextCPBuildings > 0 && (
            <span className="text-cyan-400">{nextCPBuildings} more building{nextCPBuildings > 1 ? 's' : ''}</span>
          )}
          {nextCPResearch > 0 && (
            <span className="text-purple-400">{nextCPResearch} more research</span>
          )}
          {nextCPBuildings === 0 && nextCPResearch === 0 && (
            <span className="text-green-400">Earning CP every expansion!</span>
          )}
        </div>
      </div>

      {/* Prestige Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Main Prestige Card */}
        <div className="lg:col-span-2 space-y-4">
          <div className="game-card rounded-xl bg-card p-6 border border-fuchsia-900/30">
            <div className="text-center mb-6">
              <div className="w-20 h-20 rounded-2xl bg-fuchsia-900/20 flex items-center justify-center mx-auto mb-3 neon-pulse">
                <GameIcon icon="gi:planet-core" size={48} />
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
                <div className="text-[10px] text-green-400 font-medium mb-1"><GameIcon icon="gi:check-mark" size={12} className="inline" /> You Keep</div>
                <ul className="text-[11px] text-gray-400 space-y-0.5">
                  <li>• Completed research</li>
                  <li>• Corporation Points</li>
                  <li>• Prestige bonuses</li>
                  <li>• Automation unlocks</li>
                </ul>
              </div>
              <div className="bg-red-900/10 rounded-lg p-3 border border-red-900/30">
                <div className="text-[10px] text-red-400 font-medium mb-1"><GameIcon icon="gi:cross-mark" size={12} className="inline" /> You Lose</div>
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
              onClick={() => setShowPrestigeDialog(true)}
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

          {/* Prestige Bonuses with Tooltips */}
          <div className="game-card rounded-xl bg-card p-4 border border-border">
            <div className="flex items-center gap-2 mb-3">
              <Star className="w-4 h-4 text-fuchsia-400" />
              <h3 className="text-sm font-semibold text-fuchsia-400">Permanent Bonuses</h3>
              <span className="text-[10px] text-gray-500 ml-auto">{purchasedBonuses}/{store.prestigeState.bonuses.length}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {store.prestigeState.bonuses.map(bonus => {
                const canAfford = store.prestigeState.corporationPoints >= bonus.cost;
                const icon = bonusIcons[bonus.effect.type] || <Star className="w-4 h-4" />;
                const details = bonusDetails[bonus.effect.type];

                return (
                  <Tooltip key={bonus.id}>
                    <TooltipTrigger asChild>
                      <div
                        className={`rounded-lg p-3 border cursor-help ${
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
                            onClick={(e) => { e.stopPropagation(); store.purchasePrestigeBonus(bonus.id); }}
                            disabled={!canAfford}
                            className={`w-full mt-2 text-[10px] h-6 min-h-[36px] ${
                              canAfford ? 'bg-fuchsia-600 hover:bg-fuchsia-500 text-white' : 'bg-gray-800 text-gray-500'
                            }`}
                            size="sm"
                          >
                            {bonus.cost} CP
                          </Button>
                        )}
                        {bonus.purchased && (
                          <div className="mt-2 text-center text-[10px] text-fuchsia-400/60">
                            <GameIcon icon="gi:check-mark" size={12} className="inline" /> Active
                          </div>
                        )}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="bg-gray-900 border border-fuchsia-900/30 text-gray-200 p-3 max-w-xs z-50">
                      <div className="space-y-2">
                        <div className="text-xs font-semibold text-fuchsia-400">{bonus.name}</div>
                        {details && (
                          <>
                            <div className="text-[10px] text-gray-400">{details.plainLanguage}</div>
                            <div className="text-[10px] text-cyan-400 border-t border-gray-700 pt-1">
                              {details.currentValue}
                            </div>
                            <div className="text-[10px] text-gray-500 border-t border-gray-700 pt-1">
                              {details.scalingNote}
                            </div>
                          </>
                        )}
                        {!details && (
                          <div className="text-[10px] text-gray-400">{bonus.description}</div>
                        )}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Current Stats */}
          <div className="game-card rounded-xl bg-card p-4 border border-border">
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
            <div className="game-card rounded-xl bg-card p-4 border border-fuchsia-900/30">
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
          <div className="game-card rounded-xl bg-card p-4 border border-border">
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
              <p>• Hover over bonuses to see detailed effects</p>
            </div>
          </div>
        </div>
      </div>

      {/* Prestige Preview Dialog */}
      <Dialog open={showPrestigeDialog} onOpenChange={handleDialogClose}>
        <DialogContent className="bg-card border-fuchsia-900/50 text-gray-200 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-fuchsia-400 flex items-center gap-2">
              <Globe className="w-5 h-5" />
              {confirmStep === 0 ? 'Confirm Global Expansion' : <><GameIcon icon="gi:hazard-sign" size={14} className="inline" /> Double Confirm</>}
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              {confirmStep === 0
                ? 'Review the consequences of your expansion before proceeding.'
                : 'This is your last chance to cancel. All progress will be lost!'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Points earned */}
            <div className="bg-[#0a0e17] rounded-lg p-4 text-center">
              <div className="text-[10px] text-gray-500 mb-1">You will earn</div>
              <div className="text-2xl font-bold font-mono text-fuchsia-400">{pointsEarned} CP</div>
            </div>

            {/* What you keep */}
            <div className="bg-green-900/10 rounded-lg p-3 border border-green-900/30">
              <div className="text-[10px] text-green-400 font-medium mb-1"><GameIcon icon="gi:check-mark" size={12} className="inline" /> You will keep</div>
              <ul className="text-[11px] text-gray-400 space-y-0.5">
                <li>• Completed research ({store.completedResearch.length} nodes)</li>
                <li>• Corporation Points ({store.prestigeState.corporationPoints} + {pointsEarned} new)</li>
                <li>• Prestige bonuses ({purchasedBonuses} active)</li>
                <li>• Automation unlocks</li>
              </ul>
            </div>

            {/* What you lose */}
            <div className="bg-red-900/10 rounded-lg p-3 border border-red-900/30">
              <div className="text-[10px] text-red-400 font-medium mb-1"><GameIcon icon="gi:cross-mark" size={12} className="inline" /> You will lose</div>
              <ul className="text-[11px] text-gray-400 space-y-0.5">
                <li>• All {store.buildings.length} buildings</li>
                <li>• All resources</li>
                <li>• ${formatNumber(store.money)} money & {formatNumber(store.researchPoints)} RP</li>
                <li>• {store.workers.length} workers & {store.contracts.length} contracts</li>
              </ul>
            </div>

            {/* Permanent bonuses that will apply */}
            {purchasedBonuses > 0 && (
              <div className="bg-fuchsia-900/10 rounded-lg p-3 border border-fuchsia-900/30">
                <div className="text-[10px] text-fuchsia-400 font-medium mb-1"><GameIcon icon="gi:sparkles" size={12} className="inline" /> Permanent bonuses will apply</div>
                <div className="space-y-0.5">
                  {store.prestigeState.bonuses.filter(b => b.purchased).map(bonus => (
                    <div key={bonus.id} className="text-[11px] text-gray-400">
                      • {bonus.name} (+{(bonus.effect.value * 100).toFixed(0)}%)
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Double-confirm warning */}
            {confirmStep === 1 && (
              <div
                className="bg-red-900/20 rounded-lg p-3 border border-red-600/50 text-center"
              >
                <AlertTriangle className="w-6 h-6 text-red-400 mx-auto mb-2" />
                <p className="text-sm text-red-400 font-bold">FINAL WARNING</p>
                <p className="text-xs text-gray-400 mt-1">Click &quot;Confirm Expansion&quot; to permanently reset your factory.</p>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <Button variant="ghost" className="text-gray-400 hover:text-gray-200">
                Cancel
              </Button>
            </DialogClose>
            <Button
              onClick={handlePrestigeConfirm}
              className={`${
                confirmStep === 0
                  ? 'bg-fuchsia-600 hover:bg-fuchsia-500 text-white'
                  : 'bg-red-600 hover:bg-red-500 text-white'
              }`}
            >
              {confirmStep === 0 ? 'Continue' : 'Confirm Expansion'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
