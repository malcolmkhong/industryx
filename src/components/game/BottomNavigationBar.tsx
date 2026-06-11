'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { GameTab } from '@/lib/game/types';
import { NAV_GROUPS, getGroupForTab } from '@/components/game/GameSidebar';
import { useSettingsStore, BottomNavMode } from '@/lib/game/settingsStore';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Home, Wrench, Truck, FlaskConical, Trophy, Coins, Database,
  Factory, Pickaxe, Cog, Zap, TrendingUp, Users, ScrollText, Bot, Globe,
  AlertTriangle, Bell, BookOpen, BarChart3, Map as MapIcon, Gift, Scroll,
  DollarSign, Plane, Settings, Search, Clock, Star, Heart, Eye,
  ChevronUp, ChevronDown, Plus, Minus, X, Check,
  Activity, Save, Swords,
} from 'lucide-react';

// ─── Icon Map (exported for use by FAB and other components) ────────────────────

export const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Home, Wrench, Truck, FlaskConical, Trophy, Coins, Database,
  Factory, Pickaxe, Cog, Zap, TrendingUp, Users, ScrollText, Bot, Globe,
  AlertTriangle, Bell, BookOpen, BarChart3, Map: MapIcon, Gift, Scroll,
  DollarSign, Plane, Settings, Search, Clock, Star, Heart, Eye,
  ChevronUp, ChevronDown, Plus, Minus, X, Check,
  Activity, Save, Swords,
};

// ─── Props Interface ────────────────────────────────────────────────────────────

interface BottomNavigationBarProps {
  activeTab: GameTab;
  onTabChange: (tab: GameTab) => void;
}

// ─── Animation Variants ─────────────────────────────────────────────────────────

const panelVariants = {
  hidden: {
    opacity: 0,
    y: 8,
    scale: 0.98,
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: 'spring' as const,
      stiffness: 400,
      damping: 30,
      mass: 0.8,
    },
  },
  exit: {
    opacity: 0,
    y: 8,
    scale: 0.98,
    transition: {
      duration: 0.15,
      ease: 'easeIn' as const,
    },
  },
};

const tabItemVariants = {
  hidden: { opacity: 0, y: 6 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: i * 0.04,
      duration: 0.2,
      ease: 'easeOut' as const,
    },
  }),
  exit: { opacity: 0, y: 4, transition: { duration: 0.1 } },
};

// ─── Component ──────────────────────────────────────────────────────────────────

export function BottomNavigationBar({ activeTab, onTabChange }: BottomNavigationBarProps) {
  const bottomNavMode = useSettingsStore(state => state.bottomNavMode);
  const setBottomNavMode = useSettingsStore(state => state.setBottomNavMode);

  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);

  // Derive the active group from the active tab
  const activeGroup = getGroupForTab(activeTab);

  // Close panel on outside click — this is an event handler (not a direct
  // setState in the effect body), so it satisfies the react-hooks lint rule.
  useEffect(() => {
    if (expandedGroupId === null) return;

    function handleClickOutside(e: MouseEvent | TouchEvent) {
      if (
        panelRef.current &&
        barRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        !barRef.current.contains(e.target as Node)
      ) {
        setExpandedGroupId(null);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [expandedGroupId]);

  const handleGroupTap = useCallback((groupId: string) => {
    setExpandedGroupId(prev => (prev === groupId ? null : groupId));
  }, []);

  const handleSubTabSelect = useCallback(
    (tabId: GameTab) => {
      onTabChange(tabId);
      setExpandedGroupId(null);
    },
    [onTabChange]
  );

  const toggleMode = useCallback(() => {
    const next: BottomNavMode = bottomNavMode === 'compact' ? 'quick' : 'compact';
    setBottomNavMode(next);
  }, [bottomNavMode, setBottomNavMode]);

  const isCompact = bottomNavMode === 'compact';
  const expandedGroup = NAV_GROUPS.find(g => g.id === expandedGroupId);

  return (
    <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      {/* Slide-up sub-tab panel */}
      <AnimatePresence>
        {expandedGroup && (
          <motion.div
            ref={panelRef}
            variants={panelVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="absolute bottom-full left-0 right-0 mx-1.5 mb-1.5 rounded-xl border border-cyan-900/30 bg-[#0a0e17]/95 backdrop-blur-lg shadow-[0_-4px_24px_rgba(0,255,242,0.08)] overflow-hidden"
          >
            {/* Panel header */}
            <div className="flex items-center gap-2 px-3 pt-2.5 pb-1.5 border-b border-cyan-900/20">
              {(() => {
                const GroupIcon = expandedGroup.icon;
                return <GroupIcon className={`w-3.5 h-3.5 ${expandedGroup.color}`} />;
              })()}
              <span className={`text-[11px] font-bold uppercase tracking-wider ${expandedGroup.color}`}>
                {expandedGroup.label}
              </span>
              <button
                onClick={() => setExpandedGroupId(null)}
                className="ml-auto p-1.5 rounded-md text-muted-label hover:text-subtle hover:bg-white/[0.05] transition-colors min-w-[32px] min-h-[32px] flex items-center justify-center"
                aria-label="Close panel"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Sub-tab grid — 3 columns with better spacing */}
            <div className="grid grid-cols-3 gap-1 p-2">
              {expandedGroup.tabs.map((tab, i) => {
                const TabIcon = tab.icon;
                const isActive = activeTab === tab.id;

                return (
                  <motion.button
                    key={tab.id}
                    custom={i}
                    variants={tabItemVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    onClick={() => handleSubTabSelect(tab.id)}
                    className={`
                      flex items-center gap-2 px-2.5 py-2.5 rounded-lg text-[11px] font-medium
                      min-h-[44px] transition-colors duration-150
                      ${
                        isActive
                          ? `${tab.color} bg-white/[0.08] border border-cyan-500/20 shadow-[0_0_12px_rgba(0,255,242,0.1)]`
                          : 'text-subtle active:bg-white/[0.08] border border-transparent'
                      }
                    `}
                  >
                    <TabIcon className="w-4 h-4 flex-shrink-0" />
                    <span className="truncate">{tab.label}</span>
                  </motion.button>
                );
              })}
            </div>

            {/* Subtle glow border at bottom of panel */}
            <div className="h-px bg-gradient-to-r from-transparent via-cyan-500/20 to-transparent" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main bottom navigation bar */}
      <div
        ref={barRef}
        className="bg-[#0a0e17]/95 backdrop-blur-lg border-t border-cyan-900/30"
      >
        {/* Top glow line */}
        <div className="h-px bg-gradient-to-r from-transparent via-cyan-500/15 to-transparent" />

        <div
          className={`
            flex items-center
            ${isCompact ? 'gap-0 px-0.5' : 'gap-0 px-0.5'}
            justify-around
          `}
          style={{ paddingTop: '6px', paddingBottom: '6px' }}
        >
          {/* Navigation group buttons */}
          {NAV_GROUPS.map(group => {
            const GroupIcon = group.icon;
            const isActiveGroup = group.id === activeGroup?.id;
            const isExpanded = expandedGroupId === group.id;
            const hasActiveTab = group.tabs.some(t => t.id === activeTab);

            return (
              <button
                key={group.id}
                onClick={() => handleGroupTap(group.id)}
                className={`
                  relative flex items-center justify-center
                  min-w-[40px] min-h-[40px] rounded-lg
                  transition-all duration-200
                  active:scale-95
                  ${isCompact ? 'flex-col items-center gap-0.5 px-1 py-1' : 'px-2 py-2'}
                  ${
                    isExpanded
                      ? `${group.color} bg-white/[0.1] shadow-[0_0_16px_rgba(0,255,242,0.12)]`
                      : hasActiveTab || isActiveGroup
                        ? `${group.color} bg-white/[0.04]`
                        : 'text-muted-label active:text-subtle active:bg-white/[0.06]'
                  }
                `}
                aria-label={group.label}
                aria-expanded={isExpanded}
              >
                <GroupIcon
                  className={`flex-shrink-0 ${
                    isCompact ? 'w-5 h-5' : 'w-[18px] h-[18px]'
                  }`}
                />
                {isCompact && (
                  <span
                    className={`
                      text-[8px] font-medium leading-tight truncate max-w-[44px]
                      ${hasActiveTab || isActiveGroup || isExpanded ? 'opacity-100' : 'opacity-60'}
                    `}
                  >
                    {group.label}
                  </span>
                )}

                {/* Active indicator dot */}
                {(hasActiveTab || isActiveGroup) && !isExpanded && (
                  <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(0,255,242,0.6)]" />
                )}

                {/* Expanded chevron indicator */}
                {isExpanded && (
                  <ChevronUp className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-2.5 h-2.5 text-cyan-400" />
                )}
              </button>
            );
          })}

          {/* Mode toggle button */}
          <button
            onClick={toggleMode}
            className={`
              flex items-center justify-center
              min-w-[40px] min-h-[40px] rounded-lg
              text-muted-label active:text-cyan-400 active:bg-white/[0.06]
              transition-all duration-200
              ${isCompact ? 'flex-col items-center gap-0.5 px-1 py-1' : 'px-2 py-2'}
            `}
            aria-label={isCompact ? 'Switch to quick mode' : 'Switch to compact mode'}
          >
            {isCompact ? (
              <>
                <ChevronDown className="w-4 h-4" />
                <span className="text-[8px] font-medium opacity-60">Quick</span>
              </>
            ) : (
              <ChevronUp className="w-[18px] h-[18px]" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
