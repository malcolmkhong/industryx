'use client';

import { useState, useMemo } from 'react';
import { useGameStore, formatNumber, GameStore } from '@/lib/game/store';
import { BUILDING_DEFS } from '@/lib/game/data';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Zap, Pickaxe, TrendingUp, Flame, DollarSign,
  FlaskConical, Check, ChevronRight, X, Lightbulb,
  Factory, BookOpen, Target, Rocket, Shield,
  Keyboard, Star
} from 'lucide-react';

interface TutorialStep {
  id: string;
  title: string;
  description: string;
  detailedExplanation: string;
  icon: React.ReactNode;
  emoji: string;
  tip: string;
  checkCompleted: (store: GameStore) => boolean;
  targetTab?: string;
}

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 'build-coal-generator',
    title: 'Build a Coal Generator',
    description: 'Every factory needs power. Start by building a Coal Generator to supply electricity.',
    detailedExplanation:
      'Power is the lifeblood of your factory. Without it, no buildings can operate. The Coal Generator burns coal to produce 20 MW of electricity. It is cheap to build and reliable, making it the perfect starting power plant. You start with $1,000 — enough to build one right away!',
    icon: <Zap className="w-5 h-5" />,
    emoji: '🏭',
    tip: 'Always ensure your power production exceeds consumption. Buildings consume power each tick, and running a deficit drastically reduces efficiency.',
    checkCompleted: (store) => store.buildings.some(b => b.type === 'coalGenerator' || b.type === 'solarPanel' || b.type === 'windTurbine'),
  },
  {
    id: 'build-mining-drill',
    title: 'Build a Mining Drill',
    description: 'Extract raw resources from the earth. Mining Drills produce iron, copper, and coal.',
    detailedExplanation:
      'Mining Drills are your primary resource extractors. Each one produces iron, copper, and coal every tick. Iron is needed for iron plates and steel, copper for wire and circuits, and coal to fuel your generators. Build at least 2-3 drills to ensure a steady resource flow.',
    icon: <Pickaxe className="w-5 h-5" />,
    emoji: '⛏️',
    tip: 'Build multiple Mining Drills early. They produce a mix of resources, so having several ensures you never run short on raw materials.',
    checkCompleted: (store) => store.buildings.some(b => b.type === 'miningDrill'),
  },
  {
    id: 'watch-resources',
    title: 'Watch Resources Accumulate',
    description: 'Resources are produced every tick. Watch your stockpiles grow as buildings work.',
    detailedExplanation:
      'Each tick, your active buildings produce resources automatically. The production rate depends on building level, efficiency, and power supply. You can view all your resources in the Resources tab. Each resource has a storage capacity — if you hit the cap, excess production is wasted!',
    icon: <TrendingUp className="w-5 h-5" />,
    emoji: '📊',
    tip: 'Keep an eye on storage capacity. When resources near capacity, it is time to process them in factories or sell them on the market.',
    checkCompleted: (store) => {
      const rawTotal = store.resources.iron + store.resources.copper + store.resources.coal;
      return rawTotal >= 20;
    },
  },
  {
    id: 'build-smelter',
    title: 'Build a Smelter',
    description: 'Process raw iron into iron plates. Smelters are your first step in the production chain.',
    detailedExplanation:
      'Raw resources alone are not enough — you need to process them! The Smelter takes iron ore and converts it into iron plates, which are used to craft gears, and eventually engines. This is the start of your production chain: iron → iron plate → gear → engine. Each tier of processing adds value.',
    icon: <Flame className="w-5 h-5" />,
    emoji: '🔥',
    tip: 'Smelters need power and iron to operate. Make sure your Mining Drills are producing enough iron before building too many Smelters.',
    checkCompleted: (store) => store.buildings.some(b => b.type === 'smelter'),
  },
  {
    id: 'sell-on-market',
    title: 'Sell on the Market',
    description: 'Convert resources into cash by selling on the market. Prices fluctuate over time!',
    detailedExplanation:
      'The Market is your primary source of income. Each resource has a market price that fluctuates based on supply and demand. Sell when prices are high for maximum profit! You can also buy resources you need. Market prices update every tick, so timing your trades can be very lucrative.',
    icon: <DollarSign className="w-5 h-5" />,
    emoji: '💰',
    tip: 'Watch price trends — sell when the trend is "up" and buy when it is "down". Processed resources (iron plates, circuits) sell for much more than raw materials.',
    checkCompleted: (store) => store.totalMoneyEarned > 1000,
  },
  {
    id: 'start-research',
    title: 'Start Research',
    description: 'Unlock new technologies and buildings. Research is key to long-term progression.',
    detailedExplanation:
      'Research Points (RP) accumulate over time and can be spent on the Research tab to unlock new buildings, bonuses, and abilities. Start with "Basic Automation" for +15% extractor speed, or "Basic Machining" to unlock the Gear Factory. Each research has prerequisites, forming a tech tree.',
    icon: <FlaskConical className="w-5 h-5" />,
    emoji: '🔬',
    tip: 'Prioritize research that unlocks new buildings — they open up entire new production chains. "Basic Automation" and "Basic Machining" are great starting points.',
    checkCompleted: (store) => store.completedResearch.length > 0 || store.activeResearch !== null,
  },
];

const CATEGORY_COLORS: Record<string, { dot: string; label: string }> = {
  gettingStarted: { dot: 'bg-cyan-400', label: 'Getting Started' },
  production: { dot: 'bg-amber-400', label: 'Production' },
  economy: { dot: 'bg-green-400', label: 'Economy' },
  advanced: { dot: 'bg-purple-400', label: 'Advanced' },
};

const STRATEGY_HINTS = [
  {
    title: 'Balance Power & Production',
    text: 'Always keep power production above consumption. A power deficit drops efficiency to near-zero, crippling your entire factory.',
    emoji: '⚡',
    category: 'gettingStarted' as const,
  },
  {
    title: 'Diversify Early',
    text: 'Do not rely on just one resource. Build a mix of extractors and factories to create a balanced production pipeline.',
    emoji: '🔄',
    category: 'production' as const,
  },
  {
    title: 'Upgrade Before Expanding',
    text: 'Upgrading existing buildings is often more cost-effective than building new ones. A level 3 building produces 3x as much as level 1.',
    emoji: '⬆️',
    category: 'production' as const,
  },
  {
    title: 'Watch the Market',
    text: 'Prices fluctuate every tick. Sell when prices peak and buy when they dip. The market trend indicator helps time your trades.',
    emoji: '📈',
    category: 'economy' as const,
  },
  {
    title: 'Workers Boost Efficiency',
    text: 'Hiring Engineers and assigning them to buildings can significantly boost production speed. Each worker adds a percentage bonus.',
    emoji: '👷',
    category: 'advanced' as const,
  },
  {
    title: 'Complete Contracts',
    text: 'Contracts offer big payouts for delivering resources. They have time limits though, so only accept what you can fulfill.',
    emoji: '📋',
    category: 'economy' as const,
  },
  {
    title: 'Plan for Prestige',
    text: 'When you have enough buildings and research, consider Global Expansion (Prestige). You lose current progress but gain permanent Corporation Points for powerful bonuses.',
    emoji: '🌍',
    category: 'advanced' as const,
  },
];

const PRO_TIPS = [
  {
    title: 'Build Coal Generators first — everything needs power!',
    category: 'gettingStarted' as const,
  },
  {
    title: 'Check the Market for the best-selling resources',
    category: 'economy' as const,
  },
  {
    title: 'Research unlocks powerful new buildings',
    category: 'advanced' as const,
  },
  {
    title: 'Workers can boost building efficiency',
    category: 'production' as const,
  },
  {
    title: 'Prestige resets give Corporation Points for permanent bonuses',
    category: 'advanced' as const,
  },
];

const KEYBOARD_SHORTCUTS = [
  { keys: '1-9', description: 'Switch between navigation tabs' },
  { keys: 'Space', description: 'Pause / Resume the game' },
  { keys: '+ / =', description: 'Increase game speed' },
  { keys: '-', description: 'Decrease game speed' },
  { keys: 'Esc', description: 'Deselect building' },
  { keys: '?', description: 'Toggle keyboard shortcuts help' },
];

export function OnboardingPanel() {
  const store = useGameStore();
  const [skipped, setSkipped] = useState(false);
  const [expandedStep, setExpandedStep] = useState<string | null>(null);
  const [showHints, setShowHints] = useState(false);

  const stepStates = useMemo(() => {
    return TUTORIAL_STEPS.map(step => ({
      ...step,
      completed: step.checkCompleted(store),
    }));
  }, [store]);

  const completedCount = stepStates.filter(s => s.completed).length;
  const totalCount = stepStates.length;
  const progressPercent = (completedCount / totalCount) * 100;
  const allCompleted = completedCount === totalCount;

  if (skipped || (allCompleted && store.gameTick > 10)) {
    return (
      <div className="space-y-4">
        <div className="game-card rounded-xl bg-[#111827] p-6 border border-[#1e293b] text-center">
          <div className="w-16 h-16 rounded-2xl bg-cyan-900/20 flex items-center justify-center text-3xl mx-auto mb-3">
            {allCompleted ? '🎓' : '📋'}
          </div>
          <h3 className="text-lg font-bold text-cyan-400 neon-glow-cyan">
            {allCompleted ? 'Tutorial Complete!' : 'Tutorial Skipped'}
          </h3>
          <p className="text-xs text-gray-400 mt-1 max-w-md mx-auto">
            {allCompleted
              ? 'Congratulations! You have mastered the basics. Continue building your industrial empire!'
              : 'You skipped the tutorial. You can always explore the tabs to learn the game mechanics.'}
          </p>
          {!allCompleted && (
            <Button
              variant="outline"
              size="sm"
              className="mt-3 border-cyan-800/50 text-cyan-400 hover:bg-cyan-900/20 text-xs"
              onClick={() => setSkipped(false)}
            >
              Restart Tutorial
            </Button>
          )}
        </div>

        {/* Quick Strategy Hints */}
        <div className="game-card rounded-xl bg-[#111827] p-4 border border-[#1e293b]">
          <div className="flex items-center gap-2 mb-3">
            <Lightbulb className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-semibold text-amber-400">Strategy Hints</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {STRATEGY_HINTS.map((hint, i) => (
              <div key={i} className="bg-[#0a0e17] rounded-lg p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${CATEGORY_COLORS[hint.category]?.dot ?? 'bg-gray-400'}`} title={CATEGORY_COLORS[hint.category]?.label} />
                  <span className="text-sm">{hint.emoji}</span>
                  <span className="text-xs text-amber-300 font-medium">{hint.title}</span>
                </div>
                <p className="text-[10px] text-gray-500 leading-relaxed">{hint.text}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Pro Tips */}
        <div className="game-card rounded-xl bg-[#111827] p-4 border border-[#1e293b]">
          <div className="flex items-center gap-2 mb-3">
            <Star className="w-4 h-4 text-yellow-400" />
            <h3 className="text-sm font-semibold text-yellow-400">Pro Tips</h3>
          </div>
          <div className="space-y-2">
            {PRO_TIPS.map((tip, i) => (
              <div key={i} className="flex items-center gap-2 bg-[#0a0e17] rounded-lg px-3 py-2">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${CATEGORY_COLORS[tip.category]?.dot ?? 'bg-gray-400'}`} title={CATEGORY_COLORS[tip.category]?.label} />
                <span className="text-xs text-gray-300">{tip.title}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Keyboard Shortcuts */}
        <div className="game-card rounded-xl bg-[#111827] p-4 border border-[#1e293b]">
          <div className="flex items-center gap-2 mb-3">
            <Keyboard className="w-4 h-4 text-gray-400" />
            <h3 className="text-sm font-semibold text-gray-300">Keyboard Shortcuts</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {KEYBOARD_SHORTCUTS.map((shortcut, i) => (
              <div key={i} className="flex items-center justify-between bg-[#0a0e17] rounded-lg px-3 py-2">
                <span className="text-[10px] text-gray-400">{shortcut.description}</span>
                <kbd className="text-[10px] font-mono bg-gray-800 text-gray-300 px-2 py-0.5 rounded border border-gray-700">{shortcut.keys}</kbd>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-cyan-400 neon-glow-cyan tracking-wide">Getting Started</h2>
          <p className="text-xs text-gray-500 mt-0.5">Learn the basics of running your factory</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-cyan-500/50 text-cyan-400 bg-cyan-900/20 text-xs">
            <BookOpen className="w-3 h-3 mr-1" />
            {completedCount}/{totalCount}
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[10px] text-gray-500 hover:text-red-400 px-2"
            onClick={() => {
              if (confirm('Skip the tutorial? You can always revisit it later.')) {
                setSkipped(true);
              }
            }}
          >
            <X className="w-3 h-3 mr-1" />
            Skip
          </Button>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="game-card rounded-xl bg-[#111827] p-4 border border-cyan-900/20">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-cyan-400" />
            <span className="text-sm font-semibold text-cyan-400">Tutorial Progress</span>
          </div>
          <span className="text-xs text-gray-400 font-mono">{completedCount}/{totalCount} steps</span>
        </div>
        <div className="h-3 bg-gray-800 rounded-full overflow-hidden relative">
          <div
            className="h-full bg-gradient-to-r from-cyan-600 to-cyan-400 rounded-full transition-all duration-700"
            style={{ width: `${progressPercent}%` }}
          >
            <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent" />
          </div>
          <div className="absolute inset-0 overflow-hidden rounded-full">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-[conveyorFlow_2s_linear_infinite]" />
          </div>
        </div>
        {allCompleted && (
          <div className="mt-2 text-center">
            <span className="text-xs text-green-400 font-medium">
              🎉 All steps completed! Great job, Commander!
            </span>
          </div>
        )}
      </div>

      {/* Tutorial Steps */}
      <div className="space-y-3">
        {stepStates.map((step, index) => {
          const isExpanded = expandedStep === step.id;
          const isNextStep = !step.completed && stepStates.slice(0, index).every(s => s.completed);

          return (
            <div
              key={step.id}
              className={`game-card rounded-xl border transition-all duration-300 ${
                step.completed
                  ? 'bg-[#111827] border-green-900/30'
                  : isNextStep
                    ? 'bg-[#111827] border-cyan-900/40 shadow-[0_0_15px_rgba(34,211,238,0.1)]'
                    : 'bg-[#111827] border-[#1e293b]'
              }`}
            >
              <button
                className="w-full p-4 text-left"
                onClick={() => setExpandedStep(isExpanded ? null : step.id)}
              >
                <div className="flex items-start gap-3">
                  {/* Step number / checkmark */}
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-all ${
                      step.completed
                        ? 'bg-green-900/30 text-green-400'
                        : isNextStep
                          ? 'bg-cyan-900/30 text-cyan-400 neon-pulse'
                          : 'bg-gray-800/50 text-gray-500'
                    }`}
                  >
                    {step.completed ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <span className="text-xs font-bold font-mono">{index + 1}</span>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-base">{step.emoji}</span>
                      <h4
                        className={`text-sm font-semibold ${
                          step.completed ? 'text-green-400' : isNextStep ? 'text-cyan-300' : 'text-gray-300'
                        }`}
                      >
                        {step.title}
                      </h4>
                      {isNextStep && !step.completed && (
                        <Badge variant="outline" className="border-cyan-500/50 text-cyan-400 bg-cyan-900/20 text-[9px] h-4 px-1.5">
                          NEXT
                        </Badge>
                      )}
                      {step.completed && (
                        <Badge variant="outline" className="border-green-500/50 text-green-400 bg-green-900/20 text-[9px] h-4 px-1.5">
                          DONE
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{step.description}</p>
                  </div>

                  {/* Expand indicator */}
                  <ChevronRight
                    className={`w-4 h-4 text-gray-500 flex-shrink-0 transition-transform duration-200 ${
                      isExpanded ? 'rotate-90' : ''
                    }`}
                  />
                </div>
              </button>

              {/* Expanded Content */}
              {isExpanded && (
                <div className="px-4 pb-4 pt-0 border-t border-[#1e293b]/50 mt-0">
                  <div className="pt-3 space-y-3">
                    {/* Detailed Explanation */}
                    <div className="bg-[#0a0e17] rounded-lg p-3">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <Factory className="w-3.5 h-3.5 text-cyan-400" />
                        <span className="text-[10px] text-cyan-400 font-medium uppercase tracking-wider">
                          How It Works
                        </span>
                      </div>
                      <p className="text-xs text-gray-300 leading-relaxed">{step.detailedExplanation}</p>
                    </div>

                    {/* Tip */}
                    <div className="bg-amber-900/10 rounded-lg p-3 border border-amber-900/20">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
                        <span className="text-[10px] text-amber-400 font-medium uppercase tracking-wider">
                          Pro Tip
                        </span>
                      </div>
                      <p className="text-xs text-amber-200/70 leading-relaxed">{step.tip}</p>
                    </div>

                    {/* Status */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        {step.completed ? (
                          <>
                            <Shield className="w-3.5 h-3.5 text-green-400" />
                            <span className="text-[10px] text-green-400 font-medium">Step completed!</span>
                          </>
                        ) : (
                          <>
                            <Target className="w-3.5 h-3.5 text-cyan-400" />
                            <span className="text-[10px] text-cyan-400 font-medium">
                              {isNextStep ? 'This is your next goal' : 'Complete previous steps first'}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Strategy Hints Section */}
      <div className="game-card rounded-xl bg-[#111827] p-4 border border-[#1e293b]">
        <button
          className="w-full flex items-center justify-between"
          onClick={() => setShowHints(!showHints)}
        >
          <div className="flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-semibold text-amber-400">Strategy Hints & Tips</h3>
          </div>
          <ChevronRight
            className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${
              showHints ? 'rotate-90' : ''
            }`}
          />
        </button>
        {showHints && (
          <div className="mt-3 space-y-2">
            {STRATEGY_HINTS.map((hint, i) => (
              <div key={i} className="bg-[#0a0e17] rounded-lg p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${CATEGORY_COLORS[hint.category]?.dot ?? 'bg-gray-400'}`} title={CATEGORY_COLORS[hint.category]?.label} />
                  <span className="text-sm">{hint.emoji}</span>
                  <span className="text-xs text-amber-300 font-medium">{hint.title}</span>
                </div>
                <p className="text-[10px] text-gray-500 leading-relaxed">{hint.text}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Game Basics Reference */}
      <div className="game-card rounded-xl bg-[#111827] p-4 border border-[#1e293b]">
        <div className="flex items-center gap-2 mb-3">
          <Rocket className="w-4 h-4 text-purple-400" />
          <h3 className="text-sm font-semibold text-purple-400">Game Basics</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="bg-[#0a0e17] rounded-lg p-3">
            <div className="text-xs text-cyan-400 font-medium mb-1">⚡ Power System</div>
            <p className="text-[10px] text-gray-500">
              Power plants generate MW. Buildings consume MW. If consumption exceeds production, all buildings lose efficiency.
            </p>
          </div>
          <div className="bg-[#0a0e17] rounded-lg p-3">
            <div className="text-xs text-amber-400 font-medium mb-1">🏭 Production Chains</div>
            <p className="text-[10px] text-gray-500">
              Raw resources → Tier 1 (Plates/Wire) → Tier 2 (Circuits/Engines) → Tier 3 (AI Chips/Robotics). Higher tiers = more value.
            </p>
          </div>
          <div className="bg-[#0a0e17] rounded-lg p-3">
            <div className="text-xs text-green-400 font-medium mb-1">💰 Economy</div>
            <p className="text-[10px] text-gray-500">
              Sell resources on the Market for cash. Complete Contracts for big payouts. Use money to build and upgrade your factory.
            </p>
          </div>
          <div className="bg-[#0a0e17] rounded-lg p-3">
            <div className="text-xs text-purple-400 font-medium mb-1">🔬 Research</div>
            <p className="text-[10px] text-gray-500">
              Spend Research Points to unlock new buildings, speed boosts, and abilities. Research persists through Prestige resets.
            </p>
          </div>
        </div>
      </div>

      {/* Current Status Summary */}
      <div className="game-card rounded-xl bg-[#111827] p-4 border border-cyan-900/20">
        <div className="flex items-center gap-2 mb-3">
          <Target className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-semibold text-cyan-400">Your Current Status</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="bg-[#0a0e17] rounded-lg p-2.5 text-center">
            <div className="text-[10px] text-gray-500 mb-0.5">Money</div>
            <div className="text-sm font-bold font-mono text-green-400">${formatNumber(store.money)}</div>
          </div>
          <div className="bg-[#0a0e17] rounded-lg p-2.5 text-center">
            <div className="text-[10px] text-gray-500 mb-0.5">Buildings</div>
            <div className="text-sm font-bold font-mono text-cyan-400">{store.buildings.length}</div>
          </div>
          <div className="bg-[#0a0e17] rounded-lg p-2.5 text-center">
            <div className="text-[10px] text-gray-500 mb-0.5">Power</div>
            <div className={`text-sm font-bold font-mono ${store.powerGrid.overload ? 'text-red-400' : 'text-yellow-400'}`}>
              {formatNumber(store.powerGrid.totalProduction)} MW
            </div>
          </div>
          <div className="bg-[#0a0e17] rounded-lg p-2.5 text-center">
            <div className="text-[10px] text-gray-500 mb-0.5">Research</div>
            <div className="text-sm font-bold font-mono text-purple-400">{formatNumber(store.researchPoints)} RP</div>
          </div>
        </div>
      </div>

      {/* Pro Tips */}
      <div className="game-card rounded-xl bg-[#111827] p-4 border border-[#1e293b]">
        <div className="flex items-center gap-2 mb-3">
          <Star className="w-4 h-4 text-yellow-400" />
          <h3 className="text-sm font-semibold text-yellow-400">Pro Tips</h3>
        </div>
        <div className="space-y-2">
          {PRO_TIPS.map((tip, i) => (
            <div key={i} className="flex items-center gap-2 bg-[#0a0e17] rounded-lg px-3 py-2">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${CATEGORY_COLORS[tip.category]?.dot ?? 'bg-gray-400'}`} title={CATEGORY_COLORS[tip.category]?.label} />
              <span className="text-xs text-gray-300">{tip.title}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Keyboard Shortcuts */}
      <div className="game-card rounded-xl bg-[#111827] p-4 border border-[#1e293b]">
        <div className="flex items-center gap-2 mb-3">
          <Keyboard className="w-4 h-4 text-gray-400" />
          <h3 className="text-sm font-semibold text-gray-300">Keyboard Shortcuts</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {KEYBOARD_SHORTCUTS.map((shortcut, i) => (
            <div key={i} className="flex items-center justify-between bg-[#0a0e17] rounded-lg px-3 py-2">
              <span className="text-[10px] text-gray-400">{shortcut.description}</span>
              <kbd className="text-[10px] font-mono bg-gray-800 text-gray-300 px-2 py-0.5 rounded border border-gray-700">{shortcut.keys}</kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
