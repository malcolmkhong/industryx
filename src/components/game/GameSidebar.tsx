'use client';

import { useState, useCallback } from 'react';
import { GameTab } from '@/lib/game/types';
import {
  Factory, Pickaxe, Cog, Truck, Zap, TrendingUp,
  FlaskConical, Users, ScrollText, Bot, Globe, AlertTriangle,
  Save, Bell, BookOpen, Trophy, BarChart3,
  Map as MapIcon, Gift, Scroll, DollarSign, Plane,
  Settings, ChevronDown, ChevronRight, Home, Wrench, Swords, Coins, Database,
  Activity, Coffee, Heart, ArrowRightLeft,
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
      { id: 'factoryMap', label: 'Factory Map', icon: MapIcon, color: 'text-success' },
      { id: 'resourceMonitor', label: 'Monitor', icon: Activity, color: 'text-teal-400' },
      { id: 'guide', label: 'Guide', icon: BookOpen, color: 'text-lime-400' },
    ],
  },
  {
    id: 'production',
    label: 'Production',
    icon: Wrench,
    color: 'text-orange-400',
    tabs: [
      { id: 'resources', label: 'Extraction', icon: Pickaxe, color: 'text-warning' },
      { id: 'factories', label: 'Factories', icon: Cog, color: 'text-orange-400' },
      { id: 'storage', label: 'Storage', icon: Database, color: 'text-warning' },
      { id: 'power', label: 'Power Grid', icon: Zap, color: 'text-warning' },
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
      { id: 'market', label: 'Market', icon: TrendingUp, color: 'text-success' },
      { id: 'contracts', label: 'Contracts', icon: ScrollText, color: 'text-rose-400' },
      { id: 'droneDelivery', label: 'Drones', icon: Plane, color: 'text-sky-400' },
      { id: 'tradePost', label: 'Trade Post', icon: ArrowRightLeft, color: 'text-violet-400' },
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
    color: 'text-warning',
    tabs: [
      { id: 'quests', label: 'Quests', icon: Scroll, color: 'text-warning' },
      { id: 'achievements', label: 'Achievements', icon: Trophy, color: 'text-warning' },
      { id: 'dailyRewards', label: 'Daily Rewards', icon: Gift, color: 'text-pink-400' },
      { id: 'leaderboard', label: 'Leaderboard', icon: Trophy, color: 'text-warning' },
      { id: 'events', label: 'Events', icon: AlertTriangle, color: 'text-danger' },
    ],
  },
  {
    id: 'finance',
    label: 'Finance',
    icon: Coins,
    color: 'text-success',
    tabs: [
      { id: 'payouts', label: 'Payouts', icon: DollarSign, color: 'text-success' },
      { id: 'notifications', label: 'Alerts', icon: Bell, color: 'text-cyan-400' },
    ],
  },
  {
    id: 'system',
    label: 'System',
    icon: Database,
    color: 'text-subtle',
    tabs: [
      { id: 'statistics', label: 'Statistics', icon: BarChart3, color: 'text-teal-400' },
      { id: 'blueprints', label: 'Blueprints', icon: Save, color: 'text-indigo-400' },
      { id: 'settings', label: 'Settings', icon: Settings, color: 'text-subtle' },
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

  // ── Buy Me a Coffee ──
  const BUYMEACOFFEE_URL = 'https://buymeacoffee.com/malcolmkhod';

  return (
    <nav className="hidden lg:flex flex-col w-52 flex-shrink-0 bg-[#0a0e17] border-r border-cyan-900/20">
      <div className="flex flex-col py-2 gap-0.5 px-2 flex-1 overflow-y-auto game-scrollbar">
        {NAV_GROUPS.map(group => {
          const isExpanded = expandedGroups.has(group.id);
          const isActiveGroup = group.id === activeGroup?.id;
          const GroupIcon = group.icon;

          return (
            <div key={group.id} className="mb-0.5">
              {/* Group header */}
              <button
                onClick={() => toggleGroup(group.id)}
                aria-expanded={isExpanded}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider ${
                  isActiveGroup
                    ? `${group.color} bg-white/[0.03]`
                    : 'text-muted-label hover:text-subtle hover:bg-white/[0.02]'
                }`}
              >
                <GroupIcon className="w-3 h-3 flex-shrink-0" />
                <span className="flex-1 text-left truncate">{group.label}</span>
                {isExpanded ? (
                  <ChevronDown className="w-3 h-3 text-muted-label" />
                ) : (
                  <ChevronRight className="w-3 h-3 text-muted-label" />
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
                        className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-medium focus-visible:ring-2 focus-visible:ring-cyan-500/50 focus-visible:ring-offset-1 focus-visible:ring-offset-gray-900 ${
                          isActive
                            ? `${tab.color} bg-white/[0.05] border border-white/[0.08] shadow-[0_0_8px_rgba(34,211,238,0.05)]`
                            : 'text-muted-label hover:text-subtle hover:bg-white/[0.03] border border-transparent'
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

      {/* ── Support footer (always visible at sidebar bottom) ── */}
      <div className="flex-shrink-0 border-t border-cyan-900/20 px-2 pt-2 pb-3">
        <a
          href={BUYMEACOFFEE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium
            text-warning border border-transparent"
          aria-label="Support the developer on Buy Me a Coffee"
        >
          <Coffee className="w-4 h-4 flex-shrink-0 text-warning" />
          <span className="truncate text-warning">Buy me a coffee</span>
          <Heart className="w-3 h-3 ml-auto text-rose-400" />
        </a>
        {/* QR Code hint */}
        <div className="mt-1.5 px-2.5 pb-1">
          <a
            href={BUYMEACOFFEE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="block"
          >
            <img
              src="/bmc_qr.png"
              alt="Scan QR code to support on Buy Me a Coffee"
              className="w-16 h-16 rounded-md mx-auto opacity-90"
            />
          </a>
        </div>
      </div>
    </nav>
  );
}
