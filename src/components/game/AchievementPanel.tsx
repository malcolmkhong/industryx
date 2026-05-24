'use client';

import { useMemo, useState } from 'react';
import { useGameStore, formatNumber } from '@/lib/game/store';
import { BUILDING_DEFS } from '@/lib/game/data';
import { GameStore } from '@/lib/game/store';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Trophy, Lock, Check, Zap, Factory, FlaskConical,
  DollarSign, Rocket, Users, Globe, Target, Award,
  Flame, Shield, Cog, TrendingUp, Star,
  ChevronRight, ChevronDown, Search
} from 'lucide-react';

type AchievementCategory = 'Production' | 'Economy' | 'Research' | 'Expansion' | 'Special';

interface Achievement {
  id: string;
  name: string;
  description: string;
  emoji: string;
  category: AchievementCategory;
  condition: (s: GameStore) => boolean;
  progress: (s: GameStore) => number; // 0-1
  progressText: (s: GameStore) => string;
  reward: string;
  tier: 1 | 2 | 3; // difficulty tier
}

const ACHIEVEMENTS: Achievement[] = [
  // === PRODUCTION ===
  {
    id: 'first-light',
    name: 'First Light',
    description: 'Build your first power plant',
    emoji: '💡',
    category: 'Production',
    condition: (s) => s.buildings.some(b => BUILDING_DEFS[b.type]?.category === 'power'),
    progress: (s) => s.buildings.some(b => BUILDING_DEFS[b.type]?.category === 'power') ? 1 : 0,
    progressText: (s) => s.buildings.some(b => BUILDING_DEFS[b.type]?.category === 'power') ? '1/1' : '0/1',
    reward: 'Basic power knowledge',
    tier: 1,
  },
  {
    id: 'iron-will',
    name: 'Iron Will',
    description: 'Produce a total of 100 iron',
    emoji: '⛏️',
    category: 'Production',
    condition: (s) => s.stats.totalResourcesProduced.iron >= 100,
    progress: (s) => Math.min(1, s.stats.totalResourcesProduced.iron / 100),
    progressText: (s) => `${Math.floor(s.stats.totalResourcesProduced.iron)}/100`,
    reward: 'Iron production milestone',
    tier: 1,
  },
  {
    id: 'industrialist',
    name: 'Industrialist',
    description: 'Build 10 buildings total',
    emoji: '🏭',
    category: 'Production',
    condition: (s) => s.buildings.length >= 10,
    progress: (s) => Math.min(1, s.buildings.length / 10),
    progressText: (s) => `${s.buildings.length}/10`,
    reward: 'Industrial expansion recognized',
    tier: 2,
  },
  {
    id: 'power-hungry',
    name: 'Power Hungry',
    description: 'Generate 500MW of power',
    emoji: '⚡',
    category: 'Production',
    condition: (s) => s.powerGrid.totalProduction >= 500,
    progress: (s) => Math.min(1, s.powerGrid.totalProduction / 500),
    progressText: (s) => `${Math.floor(s.powerGrid.totalProduction)}/500 MW`,
    reward: 'Energy dominance achieved',
    tier: 2,
  },
  {
    id: 'factory-floor',
    name: 'Factory Floor',
    description: 'Have 5 active factory buildings',
    emoji: '🔧',
    category: 'Production',
    condition: (s) => s.buildings.filter(b => BUILDING_DEFS[b.type]?.category === 'factory' && b.active).length >= 5,
    progress: (s) => Math.min(1, s.buildings.filter(b => BUILDING_DEFS[b.type]?.category === 'factory' && b.active).length / 5),
    progressText: (s) => `${s.buildings.filter(b => BUILDING_DEFS[b.type]?.category === 'factory' && b.active).length}/5`,
    reward: 'Manufacturing mastery',
    tier: 2,
  },
  {
    id: 'chain-reaction',
    name: 'Chain Reaction',
    description: 'Complete a full production chain: have an extractor, a factory, and a power plant all active',
    emoji: '🔗',
    category: 'Production',
    condition: (s) => {
      const hasExtractor = s.buildings.some(b => BUILDING_DEFS[b.type]?.category === 'extractor' && b.active);
      const hasFactory = s.buildings.some(b => BUILDING_DEFS[b.type]?.category === 'factory' && b.active);
      const hasPower = s.buildings.some(b => BUILDING_DEFS[b.type]?.category === 'power' && b.active);
      return hasExtractor && hasFactory && hasPower;
    },
    progress: (s) => {
      const hasExtractor = s.buildings.some(b => BUILDING_DEFS[b.type]?.category === 'extractor' && b.active);
      const hasFactory = s.buildings.some(b => BUILDING_DEFS[b.type]?.category === 'factory' && b.active);
      const hasPower = s.buildings.some(b => BUILDING_DEFS[b.type]?.category === 'power' && b.active);
      return [hasExtractor, hasFactory, hasPower].filter(Boolean).length / 3;
    },
    progressText: (s) => {
      const hasExtractor = s.buildings.some(b => BUILDING_DEFS[b.type]?.category === 'extractor' && b.active);
      const hasFactory = s.buildings.some(b => BUILDING_DEFS[b.type]?.category === 'factory' && b.active);
      const hasPower = s.buildings.some(b => BUILDING_DEFS[b.type]?.category === 'power' && b.active);
      return `${[hasExtractor, hasFactory, hasPower].filter(Boolean).length}/3 types`;
    },
    reward: 'Production chain unlocked',
    tier: 1,
  },

  // === ECONOMY ===
  {
    id: 'market-mogul',
    name: 'Market Mogul',
    description: 'Earn $10,000 from total sales',
    emoji: '💰',
    category: 'Economy',
    condition: (s) => s.totalMoneyEarned >= 10000,
    progress: (s) => Math.min(1, s.totalMoneyEarned / 10000),
    progressText: (s) => `$${formatNumber(s.totalMoneyEarned)}/$10,000`,
    reward: 'Financial success',
    tier: 2,
  },
  {
    id: 'first-sale',
    name: 'First Sale',
    description: 'Sell any resource on the market',
    emoji: '💲',
    category: 'Economy',
    condition: (s) => Object.values(s.stats.totalResourcesSold).some(v => v > 0),
    progress: (s) => Object.values(s.stats.totalResourcesSold).some(v => v > 0) ? 1 : 0,
    progressText: (s) => Object.values(s.stats.totalResourcesSold).some(v => v > 0) ? 'Sold!' : 'Not yet',
    reward: 'Market access unlocked',
    tier: 1,
  },
  {
    id: 'resource-baron',
    name: 'Resource Baron',
    description: 'Have $50,000 cash on hand',
    emoji: '🏦',
    category: 'Economy',
    condition: (s) => s.money >= 50000,
    progress: (s) => Math.min(1, s.money / 50000),
    progressText: (s) => `$${formatNumber(s.money)}/$50,000`,
    reward: 'Wealth accumulation milestone',
    tier: 2,
  },

  // === RESEARCH ===
  {
    id: 'research-pioneer',
    name: 'Research Pioneer',
    description: 'Complete 3 researches',
    emoji: '🔬',
    category: 'Research',
    condition: (s) => s.completedResearch.length >= 3,
    progress: (s) => Math.min(1, s.completedResearch.length / 3),
    progressText: (s) => `${s.completedResearch.length}/3`,
    reward: 'Scientific breakthrough',
    tier: 2,
  },
  {
    id: 'knowledge-seeker',
    name: 'Knowledge Seeker',
    description: 'Complete your first research',
    emoji: '📖',
    category: 'Research',
    condition: (s) => s.completedResearch.length >= 1,
    progress: (s) => Math.min(1, s.completedResearch.length / 1),
    progressText: (s) => `${s.completedResearch.length}/1`,
    reward: 'First steps in technology',
    tier: 1,
  },
  {
    id: 'tech-master',
    name: 'Tech Master',
    description: 'Complete 10 researches',
    emoji: '🧪',
    category: 'Research',
    condition: (s) => s.completedResearch.length >= 10,
    progress: (s) => Math.min(1, s.completedResearch.length / 10),
    progressText: (s) => `${s.completedResearch.length}/10`,
    reward: 'Technological supremacy',
    tier: 3,
  },

  // === EXPANSION ===
  {
    id: 'global-expansion',
    name: 'Global Expansion',
    description: 'Prestige for the first time',
    emoji: '🌍',
    category: 'Expansion',
    condition: (s) => s.prestigeState.totalPrestiges >= 1,
    progress: (s) => Math.min(1, s.prestigeState.totalPrestiges / 1),
    progressText: (s) => `${s.prestigeState.totalPrestiges}/1`,
    reward: 'Corporation Points and permanent bonuses',
    tier: 3,
  },
  {
    id: 'contractor',
    name: 'Contractor',
    description: 'Complete 5 contracts',
    emoji: '📋',
    category: 'Expansion',
    condition: (s) => s.stats.contractsCompleted >= 5,
    progress: (s) => Math.min(1, s.stats.contractsCompleted / 5),
    progressText: (s) => `${s.stats.contractsCompleted}/5`,
    reward: 'Contracting reputation',
    tier: 2,
  },
  {
    id: 'multi-national',
    name: 'Multi-National',
    description: 'Prestige 3 times',
    emoji: '🌐',
    category: 'Expansion',
    condition: (s) => s.prestigeState.totalPrestiges >= 3,
    progress: (s) => Math.min(1, s.prestigeState.totalPrestiges / 3),
    progressText: (s) => `${s.prestigeState.totalPrestiges}/3`,
    reward: 'Global corporation status',
    tier: 3,
  },

  // === SPECIAL ===
  {
    id: 'automation-age',
    name: 'Automation Age',
    description: 'Activate your first automation',
    emoji: '🤖',
    category: 'Special',
    condition: (s) => s.automationUnlocks.some(a => a.active),
    progress: (s) => s.automationUnlocks.some(a => a.active) ? 1 : 0,
    progressText: (s) => s.automationUnlocks.some(a => a.active) ? 'Active!' : '0/1',
    reward: 'Automation mastery begins',
    tier: 2,
  },
  {
    id: 'speed-demon',
    name: 'Speed Demon',
    description: 'Reach 10x game speed',
    emoji: '🏎️',
    category: 'Special',
    condition: (s) => s.gameSpeed >= 10,
    progress: (s) => Math.min(1, s.gameSpeed / 10),
    progressText: (s) => `${s.gameSpeed}x/10x`,
    reward: 'Time manipulation achieved',
    tier: 2,
  },
  {
    id: 'efficiency-expert',
    name: 'Efficiency Expert',
    description: 'Reach 95% power grid efficiency',
    emoji: '🎯',
    category: 'Special',
    condition: (s) => s.powerGrid.efficiency >= 0.95,
    progress: (s) => Math.min(1, s.powerGrid.efficiency / 0.95),
    progressText: (s) => `${(s.powerGrid.efficiency * 100).toFixed(1)}%/95%`,
    reward: 'Peak performance recognition',
    tier: 2,
  },
  {
    id: 'worker-bee',
    name: 'Worker Bee',
    description: 'Hire 5 workers',
    emoji: '👷',
    category: 'Special',
    condition: (s) => s.workers.length >= 5,
    progress: (s) => Math.min(1, s.workers.length / 5),
    progressText: (s) => `${s.workers.length}/5`,
    reward: 'Workforce milestone',
    tier: 2,
  },
  {
    id: 'peak-performance',
    name: 'Peak Performance',
    description: 'Reach 100% peak efficiency',
    emoji: '🏔️',
    category: 'Special',
    condition: (s) => s.stats.peakEfficiency >= 1.0,
    progress: (s) => Math.min(1, s.stats.peakEfficiency / 1.0),
    progressText: (s) => `${(s.stats.peakEfficiency * 100).toFixed(1)}%/100%`,
    reward: 'Optimization excellence',
    tier: 3,
  },
  {
    id: 'marathon-runner',
    name: 'Marathon Runner',
    description: 'Play for 10,000 ticks',
    emoji: '⏱️',
    category: 'Special',
    condition: (s) => s.gameTick >= 10000,
    progress: (s) => Math.min(1, s.gameTick / 10000),
    progressText: (s) => `${formatNumber(s.gameTick)}/10,000`,
    reward: 'Dedication badge',
    tier: 2,
  },
  {
    id: 'nuclear-age',
    name: 'Nuclear Age',
    description: 'Build a Nuclear Reactor',
    emoji: '☢️',
    category: 'Special',
    condition: (s) => s.buildings.some(b => b.type === 'nuclearReactor'),
    progress: (s) => s.buildings.some(b => b.type === 'nuclearReactor') ? 1 : 0,
    progressText: (s) => s.buildings.some(b => b.type === 'nuclearReactor') ? 'Built!' : '0/1',
    reward: 'Nuclear power achievement',
    tier: 3,
  },
];

const CATEGORY_META: Record<AchievementCategory, { emoji: string; color: string; borderColor: string; bgColor: string; icon: React.ReactNode }> = {
  Production: {
    emoji: '🏭',
    color: 'text-cyan-400',
    borderColor: 'border-cyan-900/30',
    bgColor: 'bg-cyan-900/10',
    icon: <Factory className="w-4 h-4" />,
  },
  Economy: {
    emoji: '💰',
    color: 'text-green-400',
    borderColor: 'border-green-900/30',
    bgColor: 'bg-green-900/10',
    icon: <DollarSign className="w-4 h-4" />,
  },
  Research: {
    emoji: '🔬',
    color: 'text-purple-400',
    borderColor: 'border-purple-900/30',
    bgColor: 'bg-purple-900/10',
    icon: <FlaskConical className="w-4 h-4" />,
  },
  Expansion: {
    emoji: '🌍',
    color: 'text-fuchsia-400',
    borderColor: 'border-fuchsia-900/30',
    bgColor: 'bg-fuchsia-900/10',
    icon: <Globe className="w-4 h-4" />,
  },
  Special: {
    emoji: '⭐',
    color: 'text-amber-400',
    borderColor: 'border-amber-900/30',
    bgColor: 'bg-amber-900/10',
    icon: <Star className="w-4 h-4" />,
  },
};

const TIER_COLORS = {
  1: { label: 'Bronze', color: 'text-orange-400', bg: 'bg-orange-900/20', border: 'border-orange-800/30' },
  2: { label: 'Silver', color: 'text-gray-300', bg: 'bg-gray-800/30', border: 'border-gray-600/30' },
  3: { label: 'Gold', color: 'text-yellow-400', bg: 'bg-yellow-900/20', border: 'border-yellow-800/30' },
};

export function AchievementPanel() {
  const store = useGameStore();
  const [selectedCategory, setSelectedCategory] = useState<AchievementCategory | 'All'>('All');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const achievementStates = useMemo(() => {
    return ACHIEVEMENTS.map(a => ({
      ...a,
      unlocked: a.condition(store),
      progressValue: a.progress(store),
      progressLabel: a.progressText(store),
    }));
  }, [store]);

  const unlockedCount = achievementStates.filter(a => a.unlocked).length;
  const totalAchievements = achievementStates.length;

  // Category stats
  const categories = ['All', 'Production', 'Economy', 'Research', 'Expansion', 'Special'] as const;
  const categoryStats = useMemo(() => {
    const stats: Record<string, { total: number; unlocked: number }> = {};
    categories.forEach(cat => {
      if (cat === 'All') {
        stats['All'] = { total: totalAchievements, unlocked: unlockedCount };
      } else {
        const filtered = achievementStates.filter(a => a.category === cat);
        stats[cat] = { total: filtered.length, unlocked: filtered.filter(a => a.unlocked).length };
      }
    });
    return stats;
  }, [achievementStates, unlockedCount, totalAchievements]);

  const filteredAchievements = selectedCategory === 'All'
    ? achievementStates
    : achievementStates.filter(a => a.category === selectedCategory);

  // Recent unlocks (for highlighting)
  const recentUnlocks = achievementStates.filter(a => a.unlocked).slice(-3);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-amber-400 neon-glow-cyan tracking-wide">Achievements</h2>
          <p className="text-xs text-gray-500 mt-0.5">Track your milestones and accomplishments</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-amber-500/50 text-amber-400 bg-amber-900/20 text-xs">
            <Trophy className="w-3 h-3 mr-1" />
            {unlockedCount}/{totalAchievements}
          </Badge>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="game-card rounded-xl bg-[#111827] p-3 border border-amber-900/20">
          <div className="flex items-center gap-2 mb-1.5">
            <div className="w-7 h-7 rounded-lg bg-amber-900/20 flex items-center justify-center">
              <Trophy className="w-4 h-4 text-amber-400" />
            </div>
            <span className="text-[10px] text-gray-500 uppercase tracking-wider">Unlocked</span>
          </div>
          <div className="text-lg font-bold font-mono text-amber-400">{unlockedCount}</div>
          <div className="text-[10px] text-gray-500">of {totalAchievements} achievements</div>
        </div>
        <div className="game-card rounded-xl bg-[#111827] p-3 border border-[#1e293b]">
          <div className="flex items-center gap-2 mb-1.5">
            <div className="w-7 h-7 rounded-lg bg-cyan-900/20 flex items-center justify-center">
              <Target className="w-4 h-4 text-cyan-400" />
            </div>
            <span className="text-[10px] text-gray-500 uppercase tracking-wider">Completion</span>
          </div>
          <div className="text-lg font-bold font-mono text-cyan-400">
            {totalAchievements > 0 ? ((unlockedCount / totalAchievements) * 100).toFixed(0) : 0}%
          </div>
          <div className="text-[10px] text-gray-500">overall progress</div>
        </div>
        <div className="game-card rounded-xl bg-[#111827] p-3 border border-[#1e293b]">
          <div className="flex items-center gap-2 mb-1.5">
            <div className="w-7 h-7 rounded-lg bg-green-900/20 flex items-center justify-center">
              <Star className="w-4 h-4 text-green-400" />
            </div>
            <span className="text-[10px] text-gray-500 uppercase tracking-wider">Gold Tier</span>
          </div>
          <div className="text-lg font-bold font-mono text-green-400">
            {achievementStates.filter(a => a.unlocked && a.tier === 3).length}
          </div>
          <div className="text-[10px] text-gray-500">hardest achievements</div>
        </div>
        <div className="game-card rounded-xl bg-[#111827] p-3 border border-[#1e293b]">
          <div className="flex items-center gap-2 mb-1.5">
            <div className="w-7 h-7 rounded-lg bg-purple-900/20 flex items-center justify-center">
              <Award className="w-4 h-4 text-purple-400" />
            </div>
            <span className="text-[10px] text-gray-500 uppercase tracking-wider">Categories</span>
          </div>
          <div className="text-lg font-bold font-mono text-purple-400">5</div>
          <div className="text-[10px] text-gray-500">achievement types</div>
        </div>
      </div>

      {/* Overall Progress Bar */}
      <div className="game-card rounded-xl bg-[#111827] p-4 border border-amber-900/20">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-400" />
            <span className="text-sm font-semibold text-amber-400">Overall Progress</span>
          </div>
          <span className="text-xs text-gray-400 font-mono">{unlockedCount}/{totalAchievements}</span>
        </div>
        <div className="h-3 bg-gray-800 rounded-full overflow-hidden relative">
          <div
            className="h-full bg-gradient-to-r from-amber-600 to-amber-400 rounded-full transition-all duration-700"
            style={{ width: `${(unlockedCount / Math.max(1, totalAchievements)) * 100}%` }}
          >
            <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent" />
          </div>
        </div>
        {/* Per-category mini bars */}
        <div className="grid grid-cols-5 gap-2 mt-3">
          {(['Production', 'Economy', 'Research', 'Expansion', 'Special'] as AchievementCategory[]).map(cat => {
            const meta = CATEGORY_META[cat];
            const stats = categoryStats[cat];
            const pct = stats.total > 0 ? (stats.unlocked / stats.total) * 100 : 0;
            return (
              <div key={cat} className="text-center">
                <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden mb-1">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      cat === 'Production' ? 'bg-cyan-400' :
                      cat === 'Economy' ? 'bg-green-400' :
                      cat === 'Research' ? 'bg-purple-400' :
                      cat === 'Expansion' ? 'bg-fuchsia-400' :
                      'bg-amber-400'
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="text-[9px] text-gray-500">{stats.unlocked}/{stats.total}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Category Filter */}
      <div className="flex flex-wrap gap-2">
        {categories.map(cat => {
          const stats = categoryStats[cat];
          const meta = cat !== 'All' ? CATEGORY_META[cat] : null;
          const isActive = selectedCategory === cat;

          return (
            <Button
              key={cat}
              variant="outline"
              size="sm"
              className={`h-7 text-[10px] ${
                isActive
                  ? cat === 'All'
                    ? 'border-amber-500/50 text-amber-400 bg-amber-900/20'
                    : `${meta!.borderColor} ${meta!.color} ${meta!.bgColor}`
                  : 'border-gray-800 text-gray-500 hover:text-gray-300'
              }`}
              onClick={() => setSelectedCategory(cat)}
            >
              {cat === 'All' ? '🏆' : meta!.emoji} {cat} ({stats.unlocked}/{stats.total})
            </Button>
          );
        })}
      </div>

      {/* Achievement Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {filteredAchievements.map(achievement => {
          const isExpanded = expandedId === achievement.id;
          const meta = CATEGORY_META[achievement.category];
          const tierMeta = TIER_COLORS[achievement.tier];

          return (
            <div
              key={achievement.id}
              className={`game-card rounded-xl border transition-all duration-300 ${
                achievement.unlocked
                  ? `bg-[#111827] ${meta.borderColor}`
                  : 'bg-[#111827] border-[#1e293b] opacity-70'
              }`}
            >
              <button
                className="w-full p-3 text-left"
                onClick={() => setExpandedId(isExpanded ? null : achievement.id)}
              >
                <div className="flex items-start gap-3">
                  {/* Achievement icon */}
                  <div
                    className={`w-10 h-10 rounded-lg flex items-center justify-center text-xl flex-shrink-0 ${
                      achievement.unlocked
                        ? `${meta.bgColor}`
                        : 'bg-gray-800/30 grayscale'
                    }`}
                  >
                    {achievement.unlocked ? achievement.emoji : <Lock className="w-5 h-5 text-gray-600" />}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span
                        className={`text-xs font-semibold ${
                          achievement.unlocked ? meta.color : 'text-gray-500'
                        }`}
                      >
                        {achievement.name}
                      </span>
                      <Badge
                        variant="outline"
                        className={`text-[8px] h-3.5 px-1 ${tierMeta.bg} ${tierMeta.color} ${tierMeta.border}`}
                      >
                        {tierMeta.label}
                      </Badge>
                    </div>
                    <p className="text-[10px] text-gray-500 leading-relaxed line-clamp-2">
                      {achievement.description}
                    </p>

                    {/* Progress bar */}
                    {!achievement.unlocked && (
                      <div className="mt-1.5">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-[9px] text-gray-600">Progress</span>
                          <span className="text-[9px] text-gray-500 font-mono">{achievement.progressLabel}</span>
                        </div>
                        <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              achievement.progressValue >= 0.75
                                ? 'bg-gradient-to-r from-green-600 to-green-400'
                                : achievement.progressValue >= 0.4
                                  ? 'bg-gradient-to-r from-yellow-600 to-yellow-400'
                                  : 'bg-gradient-to-r from-gray-600 to-gray-400'
                            }`}
                            style={{ width: `${Math.min(100, achievement.progressValue * 100)}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {achievement.unlocked && (
                      <div className="flex items-center gap-1 mt-1">
                        <Check className="w-3 h-3 text-green-400" />
                        <span className="text-[9px] text-green-400 font-medium">Unlocked</span>
                      </div>
                    )}
                  </div>

                  {/* Expand icon */}
                  <div className="flex-shrink-0">
                    <ChevronRight
                      className={`w-3.5 h-3.5 text-gray-600 transition-transform duration-200 ${
                        isExpanded ? 'rotate-90' : ''
                      }`}
                    />
                  </div>
                </div>
              </button>

              {/* Expanded Details */}
              {isExpanded && (
                <div className="px-3 pb-3 pt-0 border-t border-[#1e293b]/50 mt-0">
                  <div className="pt-2.5 space-y-2">
                    {/* Reward */}
                    <div className="bg-[#0a0e17] rounded-lg p-2.5">
                      <div className="text-[10px] text-gray-500 mb-0.5">Reward</div>
                      <div className={`text-xs font-medium ${achievement.unlocked ? 'text-green-400' : meta.color}`}>
                        🎁 {achievement.reward}
                      </div>
                    </div>

                    {/* Category & Tier */}
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm">{meta.emoji}</span>
                        <span className={`text-[10px] ${meta.color}`}>{achievement.category}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Award className={`w-3 h-3 ${tierMeta.color}`} />
                        <span className={`text-[10px] ${tierMeta.color}`}>{tierMeta.label} Tier</span>
                      </div>
                    </div>

                    {/* Progress Detail */}
                    {!achievement.unlocked && (
                      <div className="bg-[#0a0e17] rounded-lg p-2.5">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] text-gray-500">Current Progress</span>
                          <span className="text-xs font-mono text-cyan-400">{achievement.progressLabel}</span>
                        </div>
                        <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-cyan-600 to-cyan-400 rounded-full transition-all duration-500"
                            style={{ width: `${Math.min(100, achievement.progressValue * 100)}%` }}
                          />
                        </div>
                        <div className="text-right mt-0.5">
                          <span className="text-[9px] text-gray-500 font-mono">
                            {(achievement.progressValue * 100).toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Locked Achievements Count */}
      {unlockedCount < totalAchievements && (
        <div className="game-card rounded-xl bg-[#111827] p-4 border border-[#1e293b]">
          <div className="flex items-center gap-2 mb-2">
            <Lock className="w-4 h-4 text-gray-500" />
            <h3 className="text-sm font-semibold text-gray-400">Still to Unlock</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {achievementStates.filter(a => !a.unlocked).map(a => {
              const meta = CATEGORY_META[a.category];
              return (
                <div
                  key={a.id}
                  className="flex items-center gap-1.5 bg-[#0a0e17] rounded-lg px-2.5 py-1.5"
                >
                  <span className="text-xs grayscale opacity-50">{a.emoji}</span>
                  <span className="text-[10px] text-gray-500">{a.name}</span>
                  <span className={`text-[9px] ${meta.color}`}>({a.progressLabel})</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
