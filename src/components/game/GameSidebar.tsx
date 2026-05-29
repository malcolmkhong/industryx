'use client';

import { useState, useCallback } from 'react';
import { GameTab } from '@/lib/game/types';
import {
  Factory, Pickaxe, Cog, Truck, Zap, TrendingUp,
  FlaskConical, Users, ScrollText, Bot, Globe, AlertTriangle,
  Save, Bell, BookOpen, Trophy, BarChart3,
  Map as MapIcon, Gift, Scroll, DollarSign, Plane,
  Settings, ChevronDown, ChevronRight, Home, Wrench, Swords, Coins, Database,
} from 'lucide-react';
import { LucideIcon } from 'lucide-react';

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
      { id: 'power', label: 'Power Grid', icon: Zap, color: 'text-yellow-400' },
      { id: 'workers', label: 'Workers', icon: Users, color: 'text-sky-400' },
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

// ─── Mobile Navigation Component ───────────────────────────────────────────────

interface MobileNavProps {
  activeTab: GameTab;
  onTabChange: (tab: GameTab) => void;
}

export function MobileNav({ activeTab, onTabChange }: MobileNavProps) {
  const [activeCategory, setActiveCategory] = useState<string>(() => {
    const group = getGroupForTab(activeTab);
    return group?.id ?? 'overview';
  });

  const currentGroup = NAV_GROUPS.find(g => g.id === activeCategory) ?? NAV_GROUPS[0];

  const handleCategoryChange = useCallback((categoryId: string) => {
    setActiveCategory(categoryId);
  }, []);

  const handleTabChange = useCallback((tabId: GameTab) => {
    onTabChange(tabId);
  }, [onTabChange]);

  return (
    <div className="flex lg:hidden flex-col border-t border-cyan-900/20 bg-[#0d1220]">
      {/* Category selector - horizontal scroll */}
      <div className="flex items-center gap-0.5 px-1 pt-1.5 overflow-x-auto game-scrollbar">
        {NAV_GROUPS.map(group => {
          const GroupIcon = group.icon;
          const isActive = activeCategory === group.id;
          const isTabActive = group.tabs.some(t => t.id === activeTab);

          return (
            <button
              key={group.id}
              onClick={() => handleCategoryChange(group.id)}
              className={`flex items-center gap-1 px-2 py-1 rounded-t-lg text-[10px] font-semibold whitespace-nowrap transition-all ${
                isActive
                  ? `${group.color} bg-[#111827] border border-b-0 border-cyan-900/20`
                  : isTabActive
                    ? 'text-cyan-400 bg-[#111827]/50'
                    : 'text-gray-600 hover:text-gray-400'
              }`}
            >
              <GroupIcon className="w-3 h-3" />
              <span>{group.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tabs for selected category */}
      <div className="flex items-center gap-0.5 px-1 pb-1.5 overflow-x-auto game-scrollbar bg-[#111827]">
        {currentGroup.tabs.map(tab => {
          const TabIcon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-medium whitespace-nowrap transition-all ${
                isActive
                  ? `${tab.color} bg-white/[0.05] border border-white/[0.1]`
                  : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.02]'
              }`}
            >
              <TabIcon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
