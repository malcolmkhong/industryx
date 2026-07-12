"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { GameTab } from "@/lib/game/shared/types/types";
import { NAV_GROUPS, getGroupForTab } from "@/components/game/GameSidebar";
import { useSettingsStore, type BottomNavMode } from "@/lib/game/settings/settingsStore";
import { useTabChange } from "@/lib/hooks/page/useTabChange";
import { motion, AnimatePresence } from "framer-motion";
import {
  Home,
  Wrench,
  Truck,
  FlaskConical,
  Trophy,
  Coins,
  Database,
  Factory,
  Pickaxe,
  Cog,
  Zap,
  TrendingUp,
  Users,
  ScrollText,
  Bot,
  Globe,
  AlertTriangle,
  Bell,
  BookOpen,
  BarChart3,
  Map as MapIcon,
  Gift,
  Scroll,
  DollarSign,
  Plane,
  Settings,
  Search,
  Clock,
  Star,
  Heart,
  Eye,
  ChevronUp,
  ChevronDown,
  Plus,
  Minus,
  X,
  Check,
  Activity,
  Save,
  Swords, // Reserved for future PvP/Battles feature (no GameTab yet)
} from "lucide-react";

// ─── Icon Map (exported for use by FAB and other components) ────────────────────

export const ICON_MAP: Record<
  string,
  React.ComponentType<{ className?: string }>
> = {
  Home,
  Wrench,
  Truck,
  FlaskConical,
  Trophy,
  Coins,
  Database,
  Factory,
  Pickaxe,
  Cog,
  Zap,
  TrendingUp,
  Users,
  ScrollText,
  Bot,
  Globe,
  AlertTriangle,
  Bell,
  BookOpen,
  BarChart3,
  Map: MapIcon,
  Gift,
  Scroll,
  DollarSign,
  Plane,
  Settings,
  Search,
  Clock,
  Star,
  Heart,
  Eye,
  ChevronUp,
  ChevronDown,
  Plus,
  Minus,
  X,
  Check,
  Activity,
  Save,
  Swords, // Reserved for future PvP/Battles feature (no GameTab yet)
};

// ─── Props Interface ────────────────────────────────────────────────────────────

// Now derives `activeTab` from URL pathname instead of being passed in as a prop.
// The mobile bar lives inside the game layout, so it's always mounted under
// `/game/...` and reading the path is the single source of truth.
interface BottomNavigationBarProps {
  activeTab?: GameTab;
  onTabChange?: (tab: GameTab) => void;
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
      type: "spring" as const,
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
      ease: "easeIn" as const,
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
      ease: "easeOut" as const,
    },
  }),
  exit: { opacity: 0, y: 4, transition: { duration: 0.1 } },
};

// ─── Component ──────────────────────────────────────────────────────────────────

export function BottomNavigationBar({
  activeTab: activeTabProp,
  onTabChange,
}: BottomNavigationBarProps) {
  const pathname = usePathname();
  const handleTabChange = useTabChange();
  const bottomNavMode = useSettingsStore((state) => state.bottomNavMode);
  const setBottomNavMode = useSettingsStore((state) => state.setBottomNavMode);

  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);

  // URL is the source of truth; the optional prop still wins if a caller passes it
  // (keeps backwards compatibility for any other mounts).
  const activeTab: GameTab =
    activeTabProp ??
    (pathname.startsWith("/game/")
      ? (pathname.slice(6).split("/")[0] as GameTab)
      : "dashboard");

  // Derive the active group from the active tab
  const activeGroup = getGroupForTab(activeTab);

  // Close panel on outside click — this is an event handler (not a direct
  // setState in the effect body), so it satisfies the react-hooks lint rule.
  useEffect(() => {
    if (expandedGroupId === null) return undefined;

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

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [expandedGroupId]);

  const handleGroupTap = useCallback((groupId: string) => {
    setExpandedGroupId((prev) => (prev === groupId ? null : groupId));
  }, []);

  const toggleMode = useCallback(() => {
    const next: BottomNavMode =
      bottomNavMode === "compact" ? "quick" : "compact";
    setBottomNavMode(next);
  }, [bottomNavMode, setBottomNavMode]);

  const isCompact = bottomNavMode === "compact";
  const expandedGroup = NAV_GROUPS.find((g) => g.id === expandedGroupId);

  return (
    <div
      className="lg:hidden fixed bottom-0 left-0 right-0 z-40"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      {/* Slide-up sub-tab panel */}
      <AnimatePresence>
        {expandedGroup && (
          <motion.div
            ref={panelRef}
            variants={panelVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="absolute bottom-full left-0 right-0 mx-1.5 mb-1.5 rounded-xl border border-brand/30 bg-background/95 backdrop-blur-lg shadow-[0_-4px_24px_rgba(0,255,242,0.08)] overflow-hidden"
          >
            {/* Panel header */}
            <div className="flex items-center gap-2 px-3 pt-2.5 pb-1.5 border-b border-brand/20">
              {(() => {
                const GroupIcon = expandedGroup.icon;
                return (
                  <GroupIcon className={`w-3.5 h-3.5 ${expandedGroup.color}`} />
                );
              })()}
              <span
                className={`text-[11px] font-bold uppercase tracking-wider ${expandedGroup.color}`}
              >
                {expandedGroup.label}
              </span>
              <button
                onClick={() => setExpandedGroupId(null)}
                className="ml-auto p-1.5 rounded-md text-muted-label hover:text-subtle hover:bg-white/5 transition-colors min-w-8 min-h-8 flex items-center justify-center"
                aria-label="Close panel"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Sub-tab grid — 3 columns with better spacing */}
            <div className="grid grid-cols-3 gap-1 p-2">
              <AnimatePresence>
                {expandedGroup.tabs.map((tab, i) => {
                  const TabIcon = tab.icon;
                  const isActive = activeTab === tab.id;

                  return (
                    <motion.div
                      key={tab.id}
                      custom={i}
                      variants={tabItemVariants}
                      initial="hidden"
                      animate="visible"
                      exit="exit"
                    >
                      <Link
                        href={`/game/${tab.id}`}
                        prefetch
                        onClick={(e) => {
                          setExpandedGroupId(null);
                          if (!handleTabChange(tab.id)) {
                            e.preventDefault();
                          } else {
                            onTabChange?.(tab.id);
                          }
                        }}
                        aria-current={isActive ? "page" : undefined}
                        className={`
                                      flex items-center gap-2 px-2.5 py-2.5 rounded-lg text-[11px] font-medium
                                      min-h-11 transition-colors duration-150
                                      ${
                                        isActive
                                          ? `${tab.color} bg-white/8 border border-brand/20 shadow-[0_0_12px_rgba(0,255,242,0.1)]`
                                          : "text-subtle active:bg-white/8 border border-transparent"
                                      }
                                    `}
                      >
                        <TabIcon className="w-4 h-4 shrink-0" />
                        <span className="truncate">{tab.label}</span>
                      </Link>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>

            {/* Subtle glow border at bottom of panel */}
            <div className="h-px bg-linear-to-r from-transparent via-brand/20 to-transparent" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main bottom navigation bar */}
      <div
        ref={barRef}
        className="bg-background/95 backdrop-blur-lg border-t border-brand/30"
      >
        {/* Top glow line */}
        <div className="h-px bg-linear-to-r from-transparent via-brand/15 to-transparent" />

        <div
          className={`
                    flex items-center
                    ${isCompact ? "gap-0.5 px-1" : "gap-0 px-0.5"}
                    justify-around
                  `}
          style={{ paddingTop: "6px", paddingBottom: "6px" }}
        >
          {/* Navigation group buttons */}
          {NAV_GROUPS.map((group) => {
            const GroupIcon = group.icon;
            const isActiveGroup = group.id === activeGroup?.id;
            const isExpanded = expandedGroupId === group.id;
            const hasActiveTab = group.tabs.some((t) => t.id === activeTab);

            return (
              <button
                key={group.id}
                onClick={() => handleGroupTap(group.id)}
                className={`
                  relative flex items-center justify-center
                  min-w-10 min-h-10 rounded-lg
                  transition-all duration-200
                  active:scale-95
                  ${isCompact ? "flex-col items-center gap-0.5 px-1 py-1" : "px-2 py-2"}
                  ${
                    isExpanded
                      ? `${group.color} bg-white/10 shadow-[0_0_16px_rgba(0,255,242,0.12)]`
                      : hasActiveTab || isActiveGroup
                        ? `${group.color} bg-white/4`
                        : "text-muted-label active:text-subtle active:bg-white/6"
                  }
                `}
                aria-label={group.label}
                aria-expanded={isExpanded}
              >
                <GroupIcon
                  className={`shrink-0 ${
                    isCompact ? "w-5 h-5" : "w-4.5 h-4.5"
                  }`}
                />
                {isCompact && (
                  <span
                    className={`
                      text-[11px] font-medium leading-tight truncate max-w-11
                      ${hasActiveTab || isActiveGroup || isExpanded ? "opacity-100" : "opacity-60"}
                    `}
                  >
                    {group.label}
                  </span>
                )}

                {/* Active indicator dot — animates in/out when active tab changes */}
                <AnimatePresence>
                  {(hasActiveTab || isActiveGroup) && !isExpanded && (
                    <motion.span
                      key="active-dot"
                      initial={{ opacity: 0, scale: 0.5 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.5 }}
                      transition={{ duration: 0.15, ease: "easeOut" }}
                      className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-brand shadow-[0_0_6px_rgba(0,255,242,0.6)]"
                    />
                  )}
                </AnimatePresence>

                {/* Expanded chevron indicator — animates in/out when group toggles */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.span
                      key="expand-chevron"
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.18, ease: "easeOut" }}
                      className="absolute -top-0.5 left-1/2 -translate-x-1/2"
                    >
                      <ChevronUp className="w-2.5 h-2.5 text-brand" />
                    </motion.span>
                  )}
                </AnimatePresence>
              </button>
            );
          })}

          {/* Mode toggle button */}
          <button
            onClick={toggleMode}
            className={`
              flex items-center justify-center
              min-w-10 min-h-10 rounded-lg
              text-muted-label active:text-brand active:bg-white/6
              transition-all duration-200
              ${isCompact ? "flex-col items-center gap-0.5 px-1 py-1" : "px-2 py-2"}
            `}
            aria-label={
              isCompact ? "Switch to quick mode" : "Switch to compact mode"
            }
          >
            {isCompact ? (
              <>
                <ChevronDown className="w-4 h-4" />
                <span className="text-[11px] font-medium opacity-60">
                  Quick
                </span>
              </>
            ) : (
              <ChevronUp className="w-4.5 h-4.5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
