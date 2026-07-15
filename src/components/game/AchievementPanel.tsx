"use client";

import React, { useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useGameStore, formatNumber } from "@/lib/game/state/store";
import { BUILDING_DEFS } from "@/lib/game/config/configCache";
import type { GameStore } from "@/lib/game/state/store-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GameIcon } from "@/components/icons";
import {
  Trophy,
  Lock,
  Check,
  Zap,
  Rocket,
  Users,
  Target,
  Award,
  Flame,
  Shield,
  Cog,
  TrendingUp,
  Star,
  ChevronRight,
  ChevronDown,
  Search,
} from "lucide-react";

type AchievementCategory =
  "Production" | "Economy" | "Research" | "Expansion" | "Special";

interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
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
    id: "first-light",
    name: "First Light",
    description: "Build your first power plant",
    icon: "game-icons:light-bulb",
    category: "Production",
    condition: (s) =>
      s.buildings.some((b) => BUILDING_DEFS[b.type]?.category === "power"),
    progress: (s) =>
      s.buildings.some((b) => BUILDING_DEFS[b.type]?.category === "power")
        ? 1
        : 0,
    progressText: (s) =>
      s.buildings.some((b) => BUILDING_DEFS[b.type]?.category === "power")
        ? "1/1"
        : "0/1",
    reward: "Basic power knowledge",
    tier: 1,
  },
  {
    id: "iron-will",
    name: "Iron Will",
    description: "Produce a total of 100 iron",
    icon: "game-icons:mining",
    category: "Production",
    condition: (s) => s.stats.totalResourcesProduced.iron >= 100,
    progress: (s) => Math.min(1, s.stats.totalResourcesProduced.iron / 100),
    progressText: (s) =>
      `${Math.floor(s.stats.totalResourcesProduced.iron)}/100`,
    reward: "Iron production milestone",
    tier: 1,
  },
  {
    id: "industrialist",
    name: "Industrialist",
    description: "Build 10 buildings total",
    icon: "game-icons:factory",
    category: "Production",
    condition: (s) => s.buildings.length >= 10,
    progress: (s) => Math.min(1, s.buildings.length / 10),
    progressText: (s) => `${s.buildings.length}/10`,
    reward: "Industrial expansion recognized",
    tier: 2,
  },
  {
    id: "power-hungry",
    name: "Power Hungry",
    description: "Generate 500MW of power",
    icon: "game-icons:lightning-frequency",
    category: "Production",
    condition: (s) => s.powerGrid.totalProduction >= 500,
    progress: (s) => Math.min(1, s.powerGrid.totalProduction / 500),
    progressText: (s) => `${Math.floor(s.powerGrid.totalProduction)}/500 MW`,
    reward: "Energy dominance achieved",
    tier: 2,
  },
  {
    id: "factory-floor",
    name: "Factory Floor",
    description: "Have 5 active factory buildings",
    icon: "game-icons:wrench",
    category: "Production",
    condition: (s) =>
      s.buildings.filter(
        (b) => BUILDING_DEFS[b.type]?.category === "factory" && b.active,
      ).length >= 5,
    progress: (s) =>
      Math.min(
        1,
        s.buildings.filter(
          (b) => BUILDING_DEFS[b.type]?.category === "factory" && b.active,
        ).length / 5,
      ),
    progressText: (s) =>
      `${s.buildings.filter((b) => BUILDING_DEFS[b.type]?.category === "factory" && b.active).length}/5`,
    reward: "Manufacturing mastery",
    tier: 2,
  },
  {
    id: "chain-reaction",
    name: "Chain Reaction",
    description:
      "Complete a full production chain: have an extractor, a factory, and a power plant all active",
    icon: "game-icons:linked-rings",
    category: "Production",
    condition: (s) => {
      const hasExtractor = s.buildings.some(
        (b) => BUILDING_DEFS[b.type]?.category === "extractor" && b.active,
      );
      const hasFactory = s.buildings.some(
        (b) => BUILDING_DEFS[b.type]?.category === "factory" && b.active,
      );
      const hasPower = s.buildings.some(
        (b) => BUILDING_DEFS[b.type]?.category === "power" && b.active,
      );
      return hasExtractor && hasFactory && hasPower;
    },
    progress: (s) => {
      const hasExtractor = s.buildings.some(
        (b) => BUILDING_DEFS[b.type]?.category === "extractor" && b.active,
      );
      const hasFactory = s.buildings.some(
        (b) => BUILDING_DEFS[b.type]?.category === "factory" && b.active,
      );
      const hasPower = s.buildings.some(
        (b) => BUILDING_DEFS[b.type]?.category === "power" && b.active,
      );
      return [hasExtractor, hasFactory, hasPower].filter(Boolean).length / 3;
    },
    progressText: (s) => {
      const hasExtractor = s.buildings.some(
        (b) => BUILDING_DEFS[b.type]?.category === "extractor" && b.active,
      );
      const hasFactory = s.buildings.some(
        (b) => BUILDING_DEFS[b.type]?.category === "factory" && b.active,
      );
      const hasPower = s.buildings.some(
        (b) => BUILDING_DEFS[b.type]?.category === "power" && b.active,
      );
      return `${[hasExtractor, hasFactory, hasPower].filter(Boolean).length}/3 types`;
    },
    reward: "Production chain unlocked",
    tier: 1,
  },

  // === ECONOMY ===
  {
    id: "market-mogul",
    name: "Market Mogul",
    description: "Earn $10,000 from total sales",
    icon: "game-icons:money-stack",
    category: "Economy",
    condition: (s) => s.totalMoneyEarned >= 10000,
    progress: (s) => Math.min(1, s.totalMoneyEarned / 10000),
    progressText: (s) => `$${formatNumber(s.totalMoneyEarned)}/$10,000`,
    reward: "Financial success",
    tier: 2,
  },
  {
    id: "first-sale",
    name: "First Sale",
    description: "Sell any resource on the market",
    icon: "game-icons:cash",
    category: "Economy",
    condition: (s) =>
      Object.values(s.stats.totalResourcesSold).some((v) => v > 0),
    progress: (s) =>
      Object.values(s.stats.totalResourcesSold).some((v) => v > 0) ? 1 : 0,
    progressText: (s) =>
      Object.values(s.stats.totalResourcesSold).some((v) => v > 0)
        ? "Sold!"
        : "Not yet",
    reward: "Market access unlocked",
    tier: 1,
  },
  {
    id: "resource-baron",
    name: "Resource Baron",
    description: "Have $50,000 cash on hand",
    icon: "game-icons:bank",
    category: "Economy",
    condition: (s) => s.money >= 50000,
    progress: (s) => Math.min(1, s.money / 50000),
    progressText: (s) => `$${formatNumber(s.money)}/$50,000`,
    reward: "Wealth accumulation milestone",
    tier: 2,
  },

  // === RESEARCH ===
  {
    id: "research-pioneer",
    name: "Research Pioneer",
    description: "Complete 3 researches",
    icon: "game-icons:chemical-drop",
    category: "Research",
    condition: (s) => s.completedResearch.length >= 3,
    progress: (s) => Math.min(1, s.completedResearch.length / 3),
    progressText: (s) => `${s.completedResearch.length}/3`,
    reward: "Scientific breakthrough",
    tier: 2,
  },
  {
    id: "knowledge-seeker",
    name: "Knowledge Seeker",
    description: "Complete your first research",
    icon: "game-icons:open-book",
    category: "Research",
    condition: (s) => s.completedResearch.length >= 1,
    progress: (s) => Math.min(1, s.completedResearch.length / 1),
    progressText: (s) => `${s.completedResearch.length}/1`,
    reward: "First steps in technology",
    tier: 1,
  },
  {
    id: "tech-master",
    name: "Tech Master",
    description: "Complete 10 researches",
    icon: "game-icons:chemical-drop",
    category: "Research",
    condition: (s) => s.completedResearch.length >= 10,
    progress: (s) => Math.min(1, s.completedResearch.length / 10),
    progressText: (s) => `${s.completedResearch.length}/10`,
    reward: "Technological supremacy",
    tier: 3,
  },

  // === EXPANSION ===
  {
    id: "global-expansion",
    name: "Global Expansion",
    description: "Prestige for the first time",
    icon: "game-icons:planet-core",
    category: "Expansion",
    condition: (s) => s.prestigeState.totalPrestiges >= 1,
    progress: (s) => Math.min(1, s.prestigeState.totalPrestiges / 1),
    progressText: (s) => `${s.prestigeState.totalPrestiges}/1`,
    reward: "Corporation Points and permanent bonuses",
    tier: 3,
  },
  {
    id: "contractor",
    name: "Contractor",
    description: "Complete 5 contracts",
    icon: "game-icons:scroll-unfurled",
    category: "Expansion",
    condition: (s) => s.stats.contractsCompleted >= 5,
    progress: (s) => Math.min(1, s.stats.contractsCompleted / 5),
    progressText: (s) => `${s.stats.contractsCompleted}/5`,
    reward: "Contracting reputation",
    tier: 2,
  },
  {
    id: "multi-national",
    name: "Multi-National",
    description: "Prestige 3 times",
    icon: "game-icons:world",
    category: "Expansion",
    condition: (s) => s.prestigeState.totalPrestiges >= 3,
    progress: (s) => Math.min(1, s.prestigeState.totalPrestiges / 3),
    progressText: (s) => `${s.prestigeState.totalPrestiges}/3`,
    reward: "Global corporation status",
    tier: 3,
  },

  // === SPECIAL ===
  {
    id: "automation-age",
    name: "Automation Age",
    description: "Activate your first automation",
    icon: "game-icons:robot-golem",
    category: "Special",
    condition: (s) => s.automationUnlocks.some((a) => a.active),
    progress: (s) => (s.automationUnlocks.some((a) => a.active) ? 1 : 0),
    progressText: (s) =>
      s.automationUnlocks.some((a) => a.active) ? "Active!" : "0/1",
    reward: "Automation mastery begins",
    tier: 2,
  },
  {
    id: "speed-demon",
    name: "Speed Demon",
    description: "Reach 10x game speed",
    icon: "game-icons:race-car",
    category: "Special",
    condition: (s) => s.gameSpeed >= 10,
    progress: (s) => Math.min(1, s.gameSpeed / 10),
    progressText: (s) => `${s.gameSpeed}x/10x`,
    reward: "Time manipulation achieved",
    tier: 2,
  },
  {
    id: "efficiency-expert",
    name: "Efficiency Expert",
    description: "Reach 95% power grid efficiency",
    icon: "game-icons:crosshair",
    category: "Special",
    condition: (s) => s.powerGrid.efficiency >= 0.95,
    progress: (s) => Math.min(1, s.powerGrid.efficiency / 0.95),
    progressText: (s) => `${(s.powerGrid.efficiency * 100).toFixed(1)}%/95%`,
    reward: "Peak performance recognition",
    tier: 2,
  },
  {
    id: "worker-bee",
    name: "Worker Bee",
    description: "Hire 5 workers",
    icon: "game-icons:overhead",
    category: "Special",
    condition: (s) => s.workers.length >= 5,
    progress: (s) => Math.min(1, s.workers.length / 5),
    progressText: (s) => `${s.workers.length}/5`,
    reward: "Workforce milestone",
    tier: 2,
  },
  {
    id: "peak-performance",
    name: "Peak Performance",
    description: "Reach 100% peak efficiency",
    icon: "game-icons:podium-winner",
    category: "Special",
    condition: (s) => s.stats.peakEfficiency >= 1.0,
    progress: (s) => Math.min(1, s.stats.peakEfficiency / 1.0),
    progressText: (s) => `${(s.stats.peakEfficiency * 100).toFixed(1)}%/100%`,
    reward: "Optimization excellence",
    tier: 3,
  },
  {
    id: "marathon-runner",
    name: "Marathon Runner",
    description: "Play for 10,000 ticks",
    icon: "game-icons:stopwatch",
    category: "Special",
    condition: (s) => s.gameTick >= 10000,
    progress: (s) => Math.min(1, s.gameTick / 10000),
    progressText: (s) => `${formatNumber(s.gameTick)}/10,000`,
    reward: "Dedication badge",
    tier: 2,
  },
  {
    id: "nuclear-age",
    name: "Nuclear Age",
    description: "Build a Nuclear Reactor",
    icon: "game-icons:radioactive",
    category: "Special",
    condition: (s) => s.buildings.some((b) => b.type === "nuclearReactor"),
    progress: (s) =>
      s.buildings.some((b) => b.type === "nuclearReactor") ? 1 : 0,
    progressText: (s) =>
      s.buildings.some((b) => b.type === "nuclearReactor") ? "Built!" : "0/1",
    reward: "Nuclear power achievement",
    tier: 3,
  },
];

const CATEGORY_META: Record<
  AchievementCategory,
  { icon: string; color: string; borderColor: string; bgColor: string }
> = {
  Production: {
    icon: "game-icons:factory",
    color: "text-brand",
    borderColor: "border-brand/30",
    bgColor: "bg-brand/10",
  },
  Economy: {
    icon: "game-icons:money-stack",
    color: "text-success",
    borderColor: "border-success/30",
    bgColor: "bg-success/10",
  },
  Research: {
    icon: "game-icons:chemical-drop",
    color: "text-research",
    borderColor: "border-research/30",
    bgColor: "bg-research/10",
  },
  Expansion: {
    icon: "game-icons:planet-core",
    color: "text-premium",
    borderColor: "border-premium/20/30",
    bgColor: "bg-premium/20/10",
  },
  Special: {
    icon: "game-icons:star-formation",
    color: "text-warning",
    borderColor: "border-warning/30",
    bgColor: "bg-warning/10",
  },
};

const TIER_COLORS = {
  1: {
    label: "Bronze",
    color: "text-domain",
    bg: "bg-domain/20",
    border: "border-domain/30",
    Icon: Zap,
  },
  2: {
    label: "Silver",
    color: "text-subtle",
    bg: "bg-muted-label/30",
    border: "border-muted-label/30",
    Icon: Shield,
  },
  3: {
    label: "Gold",
    color: "text-warning",
    bg: "bg-warning/20",
    border: "border-warning/80/30",
    Icon: Flame,
  },
};

interface AchievementCardProps {
  achievement: Achievement & {
    unlocked: boolean;
    progressValue: number;
    progressLabel: string;
  };
  isExpanded: boolean;
  onToggleExpand: (id: string) => void;
}

/**
 * Map a 0..1 progress value to a coloured gradient class.
 * Extracted to keep the JSX free of nested ternaries (RULES.md eslint).
 */
function progressGradientClass(progress: number): string {
  if (progress >= 0.75) return "bg-linear-to-r from-success/80 to-success/50";
  if (progress >= 0.4) return "bg-linear-to-r from-warning/70 to-warning/50";
  return "bg-linear-to-r from-muted-label/30 to-muted-label/30";
}

// Named function preserves the display name in React DevTools, which
// arrow functions don't. (Suppressed: prefer-arrow-callback)
// eslint-disable-next-line prefer-arrow-callback
const MemoizedAchievementCard = React.memo(function MemoizedAchievementCard({
  achievement,
  isExpanded,
  onToggleExpand,
}: AchievementCardProps) {
  const meta = CATEGORY_META[achievement.category];
  const tierMeta = TIER_COLORS[achievement.tier];

  return (
    <div
      className={`game-card rounded-xl border ${
        achievement.unlocked
          ? `bg-card ${meta.borderColor}`
          : "bg-card border-border opacity-70"
      }`}
    >
      <button
        className="w-full p-3 text-left"
        onClick={() => onToggleExpand(achievement.id)}
        aria-expanded={isExpanded}
        aria-label={`Toggle ${achievement.name} details`}
      >
        <div className="flex items-start gap-3">
          <div
            className={`w-10 h-10 rounded-lg flex items-center justify-center text-xl shrink-0 ${
              achievement.unlocked
                ? `${meta.bgColor}`
                : "bg-muted-label/30 grayscale"
            }`}
          >
            {achievement.unlocked ? (
              <GameIcon icon={achievement.icon} size={20} />
            ) : (
              <Lock className="w-5 h-5 text-muted-label" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              <span
                className={`text-xs font-semibold ${
                  achievement.unlocked ? meta.color : "text-muted-label"
                }`}
              >
                {achievement.name}
              </span>
              <Badge
                variant="outline"
                className={`text-[11px] h-3.5 px-1 ${tierMeta.bg} ${tierMeta.color} ${tierMeta.border}`}
              >
                {tierMeta.label}
              </Badge>
            </div>
            <p className="text-[10px] text-muted-label leading-relaxed line-clamp-2">
              {achievement.description}
            </p>
            {!achievement.unlocked && (
              <div className="mt-1.5">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[9px] text-muted-label">Progress</span>
                  <span className="text-[9px] text-muted-label font-mono">
                    {achievement.progressLabel}
                  </span>
                </div>
                <div className="h-1.5 bg-muted-label rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${progressGradientClass(achievement.progressValue)}`}
                    style={{
                      width: `${Math.min(100, achievement.progressValue * 100)}%`,
                    }}
                  />
                </div>
              </div>
            )}
            {achievement.unlocked && (
              <div className="flex items-center gap-1 mt-1">
                <Check className="w-3 h-3 text-success" />
                <span className="text-[9px] text-success font-medium">
                  Unlocked
                </span>
              </div>
            )}
          </div>
          <div className="shrink-0">
            <ChevronRight
              className={`w-3.5 h-3.5 text-muted-label ${
                isExpanded ? "rotate-90" : ""
              }`}
            />
          </div>
        </div>
      </button>
      {isExpanded && (
        <div className="overflow-hidden">
          <div className="px-3 pb-3 pt-0 border-t border-border/50 mt-0">
            <div className="pt-2.5 space-y-2">
              <div className="bg-background rounded-lg p-3">
                <div className="text-[10px] text-muted-label mb-0.5">
                  Reward
                </div>
                <div
                  className={`text-xs font-medium ${achievement.unlocked ? "text-success" : meta.color}`}
                >
                  <GameIcon
                    icon="game-icons:present"
                    size={14}
                    className="inline"
                  />{" "}
                  {achievement.reward}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <GameIcon
                    icon={meta.icon}
                    size={14}
                    className="inline-flex"
                  />
                  <span className={`text-[10px] ${meta.color}`}>
                    {achievement.category}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <tierMeta.Icon className={`w-3 h-3 ${tierMeta.color}`} aria-hidden="true" />
                  <span className={`text-[10px] ${tierMeta.color}`}>
                    {tierMeta.label} Tier
                  </span>
                </div>
              </div>
              {!achievement.unlocked && (
                <div className="bg-background rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-muted-label">
                      Current Progress
                    </span>
                    <span className="text-xs font-mono text-brand">
                      {achievement.progressLabel}
                    </span>
                  </div>
                  <div className="h-2 bg-muted-label rounded-full overflow-hidden">
                    <div
                      className="h-full bg-linear-to-r from-brand/70 to-brand/50 rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.min(100, achievement.progressValue * 100)}%`,
                      }}
                    />
                  </div>
                  <div className="text-right mt-0.5">
                    <span className="text-[9px] text-muted-label font-mono">
                      {(achievement.progressValue * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

// Module-level constant: achievement category names. Static.
const ACHIEVEMENT_CATEGORIES = [
  "All",
  "Production",
  "Economy",
  "Research",
  "Expansion",
  "Special",
] as const;

export function AchievementPanel() {
  // HIGH-3 fix (2026-07-14): the bare `useGameStore()` subscription re-renders
  // the entire achievement panel on ANY store change (UI tick, hydrate,
  // selection, market news, etc.). Use a specific shallow selector that only
  // includes the fields the achievement conditions actually read. Cast to
  // GameStore because the condition functions are typed against the full
  // store but only read the fields we subscribe to.
  const store = useGameStore(
    useShallow((s) => ({
      buildings: s.buildings,
      stats: s.stats,
      powerGrid: s.powerGrid,
      money: s.money,
      totalMoneyEarned: s.totalMoneyEarned,
      completedResearch: s.completedResearch,
      prestigeState: s.prestigeState,
      automationUnlocks: s.automationUnlocks,
      gameSpeed: s.gameSpeed,
      workers: s.workers,
      gameTick: s.gameTick,
    })),
  ) as unknown as GameStore;
  const [selectedCategory, setSelectedCategory] = useState<
    AchievementCategory | "All"
  >("All");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const achievementStates = useMemo(() => {
    return ACHIEVEMENTS.map((a) => ({
      ...a,
      unlocked: a.condition(store),
      progressValue: a.progress(store),
      progressLabel: a.progressText(store),
    }));
  }, [store]);

  const unlockedCount = achievementStates.filter((a) => a.unlocked).length;
  const totalAchievements = achievementStates.length;

  // Category stats
  const categoryStats = useMemo(() => {
    const stats: Record<string, { total: number; unlocked: number }> = {};
    ACHIEVEMENT_CATEGORIES.forEach((cat) => {
      if (cat === "All") {
        stats["All"] = { total: totalAchievements, unlocked: unlockedCount };
      } else {
        const filtered = achievementStates.filter((a) => a.category === cat);
        stats[cat] = {
          total: filtered.length,
          unlocked: filtered.filter((a) => a.unlocked).length,
        };
      }
    });
    return stats;
  }, [achievementStates, unlockedCount, totalAchievements]);

  const filteredAchievements =
    selectedCategory === "All"
      ? achievementStates
      : achievementStates.filter((a) => a.category === selectedCategory);

  // Recent unlocks (for the "Just unlocked" banner)
  const recentUnlocks = achievementStates.filter((a) => a.unlocked).slice(-3);

  // Search filter (case-insensitive name match)
  const [searchQuery, setSearchQuery] = useState('');
  const searchedAchievements = searchQuery.trim()
    ? filteredAchievements.filter((a) =>
        a.name.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : filteredAchievements;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-warning neon-glow-cyan tracking-wide">
            Achievements
          </h2>
          <p className="text-xs text-muted-label mt-0.5">
            Track your milestones and accomplishments
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className="border-warning/50 text-warning bg-warning/20 text-xs"
          >
            <Trophy className="w-3 h-3 mr-1" />
            {unlockedCount}/{totalAchievements}
          </Badge>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="game-card rounded-xl bg-card p-3 border border-warning/20">
          <div className="flex items-center gap-2 mb-1.5">
            <div className="w-7 h-7 rounded-lg bg-warning/20 flex items-center justify-center">
              <Trophy className="w-4 h-4 text-warning" />
            </div>
            <span className="text-[10px] text-muted-label uppercase tracking-wider">
              Unlocked
            </span>
          </div>
          <div className="text-lg font-bold font-mono text-warning">
            {unlockedCount}
          </div>
          <div className="text-[10px] text-muted-label">
            of {totalAchievements} achievements
          </div>
        </div>
        <div className="game-card rounded-xl bg-card p-3 border border-border">
          <div className="flex items-center gap-2 mb-1.5">
            <div className="w-7 h-7 rounded-lg bg-brand/20 flex items-center justify-center">
              <Target className="w-4 h-4 text-brand" />
            </div>
            <span className="text-[10px] text-muted-label uppercase tracking-wider">
              Completion
            </span>
          </div>
          <div className="text-lg font-bold font-mono text-brand">
            {totalAchievements > 0
              ? ((unlockedCount / totalAchievements) * 100).toFixed(0)
              : 0}
            %
          </div>
          <div className="text-[10px] text-muted-label">overall progress</div>
        </div>
        <div className="game-card rounded-xl bg-card p-3 border border-border">
          <div className="flex items-center gap-2 mb-1.5">
            <div className="w-7 h-7 rounded-lg bg-success/20 flex items-center justify-center">
              <Star className="w-4 h-4 text-success" />
            </div>
            <span className="text-[10px] text-muted-label uppercase tracking-wider">
              Gold Tier
            </span>
          </div>
          <div className="text-lg font-bold font-mono text-success">
            {achievementStates.filter((a) => a.unlocked && a.tier === 3).length}
          </div>
          <div className="text-[10px] text-muted-label">
            hardest achievements
          </div>
        </div>
        <div className="game-card rounded-xl bg-card p-3 border border-border">
          <div className="flex items-center gap-2 mb-1.5">
            <div className="w-7 h-7 rounded-lg bg-research/20 flex items-center justify-center">
              <Award className="w-4 h-4 text-research" />
            </div>
            <span className="text-[10px] text-muted-label uppercase tracking-wider">
              Categories
            </span>
          </div>
          <div className="text-lg font-bold font-mono text-research">5</div>
          <div className="text-[10px] text-muted-label">achievement types</div>
        </div>
        <div className="game-card rounded-xl bg-card p-3 border border-border">
          <div className="flex items-center gap-2 mb-1.5">
            <div className="w-7 h-7 rounded-lg bg-premium/20 flex items-center justify-center">
              <Users className="w-4 h-4 text-premium" />
            </div>
            <span className="text-[10px] text-muted-label uppercase tracking-wider">
              Total Buildings
            </span>
          </div>
          <div className="text-lg font-bold font-mono text-premium">
            {store.buildings.length}
          </div>
          <div className="text-[10px] text-muted-label">
            constructed across the empire
          </div>
        </div>
        <div className="game-card rounded-xl bg-card p-3 border border-border">
          <div className="flex items-center gap-2 mb-1.5">
            <div className="w-7 h-7 rounded-lg bg-domain/20 flex items-center justify-center">
              <Cog className="w-4 h-4 text-domain" />
            </div>
            <span className="text-[10px] text-muted-label uppercase tracking-wider">
              Active Tiers
            </span>
          </div>
          <div className="text-lg font-bold font-mono text-domain">
            {Array.from(
              new Set(
                store.buildings.map((b) => BUILDING_DEFS[b.type]?.tier ?? 0),
              ),
            ).filter((t) => t > 0).length}
          </div>
          <div className="text-[10px] text-muted-label">
            unique tiers in use
          </div>
        </div>
      </div>

      {/* Overall Progress Bar */}
      <div className="game-card rounded-xl bg-card p-4 border border-warning/20">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-warning" />
            <span className="text-sm font-semibold text-warning">
              Overall Progress
            </span>
          </div>
          <span className="text-xs text-subtle font-mono">
            {unlockedCount}/{totalAchievements}
          </span>
        </div>
        <div className="h-3 bg-muted-label rounded-full overflow-hidden relative">
          <div
            className="h-full bg-linear-to-r from-warning/70 to-warning/50 rounded-full transition-all duration-700"
            style={{
              width: `${(unlockedCount / Math.max(1, totalAchievements)) * 100}%`,
            }}
          >
            <div className="absolute inset-0 bg-linear-to-b from-white/10 to-transparent" />
          </div>
        </div>
        {/* Per-category mini bars */}
        <div className="grid grid-cols-5 gap-2 mt-3">
          {(
            [
              "Production",
              "Economy",
              "Research",
              "Expansion",
              "Special",
            ] as AchievementCategory[]
          ).map((cat) => {
            const meta = CATEGORY_META[cat];
            const stats = categoryStats[cat];
            const pct = stats.total > 0 ? (stats.unlocked / stats.total) * 100 : 0;
            // Per-category progress bar colour. Lifted to a lookup so the
            // JSX isn't a 5-level nested ternary (RULES.md eslint no-nested-ternary).
            const categoryBarColor: Record<AchievementCategory, string> = {
              Production: "bg-brand",
              Economy: "bg-success",
              Research: "bg-research",
              Expansion: "bg-premium/60",
              Special: "bg-warning",
            };
            return (
              <div key={cat} className="text-center">
                <div className="flex items-center justify-center mb-1">
                  <GameIcon icon={meta.icon} size={12} className="inline-flex" />
                </div>
                <div className="h-1.5 bg-muted-label rounded-full overflow-hidden mb-1">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${categoryBarColor[cat]}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="text-[9px] text-muted-label">
                  {stats.unlocked}/{stats.total}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Next Milestone — suggest the closest category to complete */}
      {(() => {
        const nextCategory = (
          ["Production", "Economy", "Research", "Expansion", "Special"] as AchievementCategory[]
        )
          .filter((cat) => categoryStats[cat].total > 0 && categoryStats[cat].unlocked < categoryStats[cat].total)
          .map((cat) => {
            const stats = categoryStats[cat];
            const pct = (stats.unlocked / stats.total) * 100;
            return { cat, pct, remaining: stats.total - stats.unlocked };
          })
          .sort((a, b) => b.pct - a.pct)[0];

        if (!nextCategory) return null;
        const meta = CATEGORY_META[nextCategory.cat];
        return (
          <div className="game-card rounded-xl bg-card p-3 border border-border">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <TrendingUp className="w-3.5 h-3.5 text-success shrink-0" aria-hidden="true" />
                <span className="text-[10px] uppercase tracking-wider text-muted-label font-semibold shrink-0">
                  Closest category
                </span>
                <span className={`text-[11px] font-medium ${meta.color} truncate`}>
                  {nextCategory.cat}
                </span>
              </div>
              <span className="text-[10px] text-muted-label shrink-0">
                {nextCategory.pct.toFixed(0)}% ({nextCategory.remaining} left)
              </span>
            </div>
          </div>
        );
      })()}

      {/* Category Filter + Search */}
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <div className="relative flex-1 min-w-0">
          <label htmlFor="achievement-search" className="sr-only">Search achievements</label>
          <Search
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-label pointer-events-none"
            aria-hidden="true"
          />
          <input
            id="achievement-search"
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search achievements by name..."
            aria-label="Search achievements by name"
            className="w-full h-7 pl-8 pr-3 text-[11px] bg-card border border-border rounded-lg text-subtle placeholder-muted-label focus:outline-none focus:border-warning/50 transition-colors"
          />
        </div>
        <div className="flex flex-wrap gap-2">
        {ACHIEVEMENT_CATEGORIES.map((cat) => {
          const stats = categoryStats[cat];
          const isAll = cat === "All";
          const catMeta = isAll ? null : CATEGORY_META[cat];
          const isActive = selectedCategory === cat;
          // Pre-compute active styles so we never have to assert meta is non-null.
          const activeStyles = catMeta
            ? `${catMeta.borderColor} ${catMeta.color} ${catMeta.bgColor}`
            : "border-warning/50 text-warning bg-warning/20";
          const iconName = isAll || !catMeta ? "game-icons:trophy" : catMeta.icon;

          return (
            <Button
              key={cat}
              variant="outline"
              size="sm"
              className={`h-7 text-[10px] ${
                isActive
                  ? activeStyles
                  : "border-muted-label text-muted-label hover:text-subtle"
              }`}
              onClick={() => setSelectedCategory(cat)}
            >
              <GameIcon icon={iconName} size={14} className="inline-flex" />{" "}
              {cat} ({stats.unlocked}/{stats.total})
            </Button>
          );
        })}
        </div>
      </div>

      {/* Recently Unlocked Banner */}
      {recentUnlocks.length > 0 && unlockedCount > 0 && (
        <div className="game-card rounded-xl bg-linear-to-r from-warning/10 to-success/5 p-3 border border-warning/30">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <Rocket className="w-3.5 h-3.5 text-warning" aria-hidden="true" />
              <span className="text-[10px] uppercase tracking-wider text-warning font-semibold">
                Recently Unlocked
              </span>
            </div>
            {expandedId !== null && (
              <button
                type="button"
                onClick={() => setExpandedId(null)}
                className="inline-flex items-center gap-1 text-[10px] text-muted-label hover:text-subtle transition-colors"
                aria-label="Collapse all expanded achievements"
              >
                <ChevronDown className="w-3 h-3" aria-hidden="true" />
                Collapse all
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {recentUnlocks.map((a) => (
              <div
                key={a.id}
                className="flex items-center gap-1.5 bg-background/60 rounded-lg px-2 py-1 text-[10px] text-subtle border border-warning/20"
                data-testid="recent-unlock"
                data-achievement-id={a.id}
              >
                <Check className="w-3 h-3 text-success" aria-hidden="true" />
                <span>{a.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Achievement Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {searchedAchievements.length === 0 && (
          <div className="col-span-full flex flex-col items-center justify-center py-8 text-muted-label">
            <Trophy className="w-8 h-8 mb-2 opacity-50" />
            <p className="text-sm">
              {searchQuery
                ? `No achievements match "${searchQuery}".`
                : 'Start building to unlock achievements!'}
            </p>
          </div>
        )}
        {searchedAchievements.map((achievement) => (
          <MemoizedAchievementCard
            key={achievement.id}
            achievement={achievement}
            isExpanded={expandedId === achievement.id}
            onToggleExpand={(id) =>
              setExpandedId((prev) => (prev === id ? null : id))
            }
          />
        ))}
      </div>

      {/* Locked Achievements Count */}
      {unlockedCount < totalAchievements && (
        <div className="game-card rounded-xl bg-card p-4 border border-border">
          <div className="flex items-center gap-2 mb-2">
            <Lock className="w-4 h-4 text-muted-label" />
            <h3 className="text-sm font-semibold text-subtle">
              Still to Unlock
            </h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {achievementStates
              .filter((a) => !a.unlocked)
              .map((a) => {
                const meta = CATEGORY_META[a.category];
                const tier = TIER_COLORS[a.tier];
                const TierIcon = tier.Icon;
                return (
                  <div
                    key={a.id}
                    className="flex items-center gap-1.5 bg-background rounded-lg px-2.5 py-1.5"
                    data-testid="locked-achievement"
                    data-tier={a.tier}
                  >
                    <GameIcon
                      icon={a.icon}
                      size={12}
                      className="inline-flex grayscale opacity-50"
                    />
                    <TierIcon
                      className={`w-2.5 h-2.5 ${tier.color}`}
                      aria-hidden="true"
                    />
                    <span className="text-[10px] text-muted-label">
                      {a.name}
                    </span>
                    <span className={`text-[9px] ${meta.color}`}>
                      ({a.progressLabel})
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
