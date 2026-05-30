'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { GameTab } from '@/lib/game/types';
import {
  Factory, Pickaxe, Cog, Truck, Zap, TrendingUp,
  FlaskConical, Users, ScrollText, Bot, Globe, AlertTriangle,
  Save, Bell, BookOpen, Trophy, BarChart3,
  Map as MapIcon, Gift, Scroll, DollarSign, Plane,
  Settings, ChevronDown, ChevronRight, Home, Wrench, Swords, Coins, Database,
  GitBranch,
} from 'lucide-react';
import { LucideIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '@/lib/game/store';
import { BUILDING_DEFS } from '@/lib/game/data';

// ─── Navigation Tab Definition ─────────────────────────────────────────────────

interface NavTab {
  id: GameTab;
  label: string;
  icon: LucideIcon;
  color: string;
}

interface NavGroup {
  id: string;
  label: string;
  icon: LucideIcon;
  color: string;
  tabs: NavTab[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'overview',
    label: 'Overview',
    icon: Home,
    color: 'text-cyan-400',
    tabs: [
      { id: 'dashboard', label: 'Dashboard', icon: Factory, color: 'text-cyan-400' },
      { id: 'factoryMap', label: 'Factory Map', icon: MapIcon, color: 'text-emerald-400' },
      { id: 'guide', label: 'Guide', icon: BookOpen, color: 'text-lime-400' },
    ],
  },
  {
    id: 'production',
    label: 'Production',
    icon: Wrench,
    color: 'text-orange-400',
    tabs: [
      { id: 'resources', label: 'Extraction', icon: Pickaxe, color: 'text-amber-400' },
      { id: 'factories', label: 'Factories', icon: Cog, color: 'text-orange-400' },
      { id: 'chains', label: 'Chains', icon: GitBranch, color: 'text-violet-400' },
      { id: 'storage', label: 'Storage', icon: Database, color: 'text-amber-300' },
      { id: 'power', label: 'Power Grid', icon: Zap, color: 'text-yellow-400' },
      { id: 'workers', label: 'Workers', icon: Users, color: 'text-sky-400' },
      { id: 'buildingManagement', label: 'Building Mgmt', icon: Wrench, color: 'text-orange-400' },
    ],
  },
  {
    id: 'logistics',
    label: 'Logistics',
    icon: Truck,
    color: 'text-blue-400',
    tabs: [
      { id: 'transport', label: 'Transport', icon: Truck, color: 'text-blue-400' },
      { id: 'market', label: 'Market', icon: TrendingUp, color: 'text-green-400' },
      { id: 'contracts', label: 'Contracts', icon: ScrollText, color: 'text-rose-400' },
      { id: 'droneDelivery', label: 'Drones', icon: Plane, color: 'text-sky-400' },
    ],
  },
  {
    id: 'progression',
    label: 'Progression',
    icon: FlaskConical,
    color: 'text-purple-400',
    tabs: [
      { id: 'research', label: 'Research', icon: FlaskConical, color: 'text-purple-400' },
      { id: 'automation', label: 'Automation', icon: Bot, color: 'text-teal-400' },
      { id: 'prestige', label: 'Expand', icon: Globe, color: 'text-fuchsia-400' },
      { id: 'megaprojects', label: 'Mega Projects', icon: Globe, color: 'text-fuchsia-400' },
    ],
  },
  {
    id: 'rewards',
    label: 'Rewards',
    icon: Trophy,
    color: 'text-amber-400',
    tabs: [
      { id: 'quests', label: 'Quests', icon: Scroll, color: 'text-amber-400' },
      { id: 'achievements', label: 'Achievements', icon: Trophy, color: 'text-amber-300' },
      { id: 'dailyRewards', label: 'Daily Rewards', icon: Gift, color: 'text-pink-400' },
      { id: 'leaderboard', label: 'Leaderboard', icon: Trophy, color: 'text-amber-400' },
      { id: 'events', label: 'Events', icon: AlertTriangle, color: 'text-red-400' },
    ],
  },
  {
    id: 'finance',
    label: 'Finance',
    icon: Coins,
    color: 'text-green-400',
    tabs: [
      { id: 'payouts', label: 'Payouts', icon: DollarSign, color: 'text-green-400' },
      { id: 'notifications', label: 'Alerts', icon: Bell, color: 'text-cyan-400' },
    ],
  },
  {
    id: 'system',
    label: 'System',
    icon: Database,
    color: 'text-gray-400',
    tabs: [
      { id: 'statistics', label: 'Statistics', icon: BarChart3, color: 'text-teal-400' },
      { id: 'blueprints', label: 'Blueprints', icon: Save, color: 'text-indigo-400' },
      { id: 'settings', label: 'Settings', icon: Settings, color: 'text-gray-400' },
    ],
  },
];

// ─── Keyboard shortcut map (derived from nav group order) ──────────────────────

export const KEY_TAB_MAP: Record<string, GameTab> = {
  '1': 'dashboard',
  '2': 'factoryMap',
  '3': 'resources',
  '4': 'factories',
  '5': 'power',
  '6': 'market',
  '7': 'research',
  '8': 'quests',
  '9': 'transport',
  '0': 'dashboard',
};

// ─── Get the group a tab belongs to ────────────────────────────────────────────

export function getGroupForTab(tabId: GameTab): NavGroup | undefined {
  return NAV_GROUPS.find(g => g.tabs.some(t => t.id === tabId));
}

// ─── Desktop Sidebar Component ─────────────────────────────────────────────────

interface GameSidebarProps {
  activeTab: GameTab;
  onTabChange: (tab: GameTab) => void;
}

export function GameSidebar({ activeTab, onTabChange }: GameSidebarProps) {
  // Track which groups are expanded - default all expanded
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    () => new Set(NAV_GROUPS.map(g => g.id))
  );

  const toggleGroup = useCallback((groupId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }, []);

  // Find which group contains the active tab, auto-expand it if collapsed
  const activeGroup = getGroupForTab(activeTab);

  return (
    <nav className="hidden lg:flex flex-col w-52 flex-shrink-0 bg-[#0d1220] border-r border-cyan-900/20 overflow-y-auto game-scrollbar">
      <div className="flex flex-col py-2 gap-0.5 px-2">
        {NAV_GROUPS.map(group => {
          const isExpanded = expandedGroups.has(group.id);
          const isActiveGroup = group.id === activeGroup?.id;
          const GroupIcon = group.icon;

          return (
            <div key={group.id} className="mb-0.5">
              {/* Group header */}
              <button
                onClick={() => toggleGroup(group.id)}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all duration-200 ${
                  isActiveGroup
                    ? `${group.color} bg-white/[0.03]`
                    : 'text-gray-600 hover:text-gray-400 hover:bg-white/[0.02]'
                }`}
              >
                <GroupIcon className="w-3 h-3 flex-shrink-0" />
                <span className="flex-1 text-left truncate">{group.label}</span>
                {isExpanded ? (
                  <ChevronDown className="w-3 h-3 text-gray-600" />
                ) : (
                  <ChevronRight className="w-3 h-3 text-gray-600" />
                )}
              </button>

              {/* Tab items */}
              {isExpanded && (
                <div className="flex flex-col gap-0.5 mt-0.5 ml-1">
                  {group.tabs.map(tab => {
                    const TabIcon = tab.icon;
                    const isActive = activeTab === tab.id;

                    return (
                      <button
                        key={tab.id}
                        onClick={() => onTabChange(tab.id)}
                        className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                          isActive
                            ? `${tab.color} bg-white/[0.05] border border-white/[0.08] shadow-[0_0_8px_rgba(34,211,238,0.05)]`
                            : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.03] border border-transparent'
                        }`}
                      >
                        <TabIcon className="w-3.5 h-3.5 flex-shrink-0" />
                        <span className="truncate">{tab.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </nav>
  );
}

// ─── Building Category → Nav Group mapping ─────────────────────────────────────

const BUILDING_CATEGORY_TO_NAV_GROUP: Record<string, string> = {
  extractor: 'production',
  factory: 'production',
  power: 'production',
  storage: 'production',
};

// ─── Mobile Navigation Component ───────────────────────────────────────────────

interface MobileNavProps {
  activeTab: GameTab;
  onTabChange: (tab: GameTab) => void;
}

export function MobileNav({ activeTab, onTabChange }: MobileNavProps) {
  // Ref for auto-scrolling category row
  const categoryRowRef = useRef<HTMLDivElement>(null);
  const categoryRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // Derive the active category from the active tab (no separate state needed)
  const activeGroup = getGroupForTab(activeTab);
  const activeCategory = activeGroup?.id ?? 'overview';

  // Get building counts from store for badge display
  const buildings = useGameStore(state => state.buildings);

  // Compute active building counts per nav group
  const buildingCountsByGroup = NAV_GROUPS.reduce<Record<string, number>>((acc, group) => {
    acc[group.id] = 0;
    return acc;
  }, {});

  buildings.forEach(b => {
    if (!b.active) return;
    const def = BUILDING_DEFS[b.type];
    if (!def) return;
    const navGroup = BUILDING_CATEGORY_TO_NAV_GROUP[def.category];
    if (navGroup && navGroup in buildingCountsByGroup) {
      buildingCountsByGroup[navGroup]++;
    }
  });

  const currentGroup = NAV_GROUPS.find(g => g.id === activeCategory) ?? NAV_GROUPS[0];

  // Auto-scroll active category into view when it changes
  useEffect(() => {
    const el = categoryRefs.current[activeCategory];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }, [activeCategory]);

  const handleCategoryChange = useCallback((categoryId: string) => {
    // When user taps a category, switch to its first tab
    const group = NAV_GROUPS.find(g => g.id === categoryId);
    if (group && group.tabs.length > 0) {
      onTabChange(group.tabs[0].id);
    }
  }, [onTabChange]);

  const handleTabChange = useCallback((tabId: GameTab) => {
    onTabChange(tabId);
  }, [onTabChange]);

  return (
    <div className="flex lg:hidden flex-col border-t border-cyan-900/20 bg-[#0d1220] mobile-bottom-bar">
      {/* Gradient accent line at top */}
      <div className="h-px bg-gradient-to-r from-transparent via-cyan-500/20 to-transparent flex-shrink-0" />

      {/* Category selector - horizontal scroll */}
      <div
        ref={categoryRowRef}
        className="flex items-center gap-1 px-2 pt-2 pb-1 overflow-x-auto mobile-tab-scroll"
        style={{
          background: 'linear-gradient(180deg, rgba(17,24,39,0.8) 0%, rgba(13,18,32,0.6) 100%)',
        }}
      >
        {NAV_GROUPS.map(group => {
          const GroupIcon = group.icon;
          const isActive = activeCategory === group.id;
          const isTabActive = group.tabs.some(t => t.id === activeTab);
          const buildingCount = buildingCountsByGroup[group.id] ?? 0;

          return (
            <button
              key={group.id}
              ref={el => { categoryRefs.current[group.id] = el; }}
              onClick={() => handleCategoryChange(group.id)}
              className={`
                relative flex items-center gap-1.5 px-3 py-2 rounded-full text-[11px] font-semibold
                whitespace-nowrap transition-all duration-200 min-h-[44px] min-w-[44px]
                active:scale-95 active:opacity-80
                ${isActive
                  ? `${group.color} bg-white/[0.08] shadow-[0_0_12px_rgba(0,255,242,0.08)] border border-white/[0.06]`
                  : isTabActive
                    ? 'text-cyan-300/70 bg-white/[0.03] border border-transparent'
                    : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.02] border border-transparent'
                }
              `}
            >
              <GroupIcon className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{group.label}</span>
              {buildingCount > 0 && (
                <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-cyan-500/20 text-cyan-300 text-[9px] font-bold leading-none">
                  {buildingCount}
                </span>
              )}
              {/* Animated indicator dot below active category */}
              {isActive && (
                <motion.span
                  layoutId="categoryIndicator"
                  className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-cyan-400"
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Subtle glow border between rows */}
      <div
        className="h-px flex-shrink-0"
        style={{
          background: activeCategory
            ? 'linear-gradient(90deg, transparent, rgba(0,255,242,0.15), transparent)'
            : 'linear-gradient(90deg, transparent, rgba(30,41,59,0.5), transparent)',
        }}
      />

      {/* Tabs for selected category - with slide animation */}
      <div className="flex items-center gap-1 px-2 py-2 overflow-x-auto mobile-tab-scroll bg-[#111827]/80"
        style={{ paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom))' }}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={activeCategory}
            className="flex items-center gap-1"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            {currentGroup.tabs.map(tab => {
              const TabIcon = tab.icon;
              const isActive = activeTab === tab.id;

              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  className={`
                    flex items-center gap-1.5 px-3 py-2 rounded-full text-[11px] font-medium
                    whitespace-nowrap transition-all duration-200 min-h-[44px] min-w-[44px]
                    active:scale-95 active:opacity-80
                    ${isActive
                      ? `${tab.color} bg-white/[0.07] border border-white/[0.1] shadow-[0_0_10px_rgba(0,255,242,0.06)]`
                      : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.03] border border-transparent'
                    }
                  `}
                >
                  <TabIcon className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
