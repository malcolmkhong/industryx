"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useSettingsStore } from "@/lib/game/settings/settingsStore";
import type { GameTab } from "@/lib/game/shared/types/types";
import { useTabChange } from "@/lib/hooks/page/useTabChange";
import {
  Factory,
  Pickaxe,
  Cog,
  Truck,
  Zap,
  TrendingUp,
  FlaskConical,
  Users,
  ScrollText,
  Bot,
  Globe,
  AlertTriangle,
  Save,
  Bell,
  BookOpen,
  Trophy,
  BarChart3,
  Map as MapIcon,
  Gift,
  Scroll,
  DollarSign,
  Plane,
  Settings,
  ChevronDown,
  ChevronRight,
  Home,
  Wrench,
  Swords,
  Coins,
  Database,
  Activity,
  Coffee,
  Heart,
  ArrowRightLeft,
  Brain,
  Shield,
  GitBranch,
  type LucideIcon,
} from "lucide-react";
import { SupportButton } from "./SupportButton";

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
    id: "overview",
    label: "Overview",
    icon: Home,
    color: "text-brand",
    tabs: [
      {
        id: "dashboard",
        label: "Dashboard",
        icon: Factory,
        color: "text-brand",
      },
      {
        id: "advisor",
        label: "AI Advisor",
        icon: Brain,
        color: "text-success",
      },
      {
        id: "factoryMap",
        label: "Factory Map",
        icon: MapIcon,
        color: "text-success",
      },
      {
        id: "resourceMonitor",
        label: "Monitor",
        icon: Activity,
        color: "text-brand",
      },
      { id: "guide", label: "Guide", icon: BookOpen, color: "text-success" },
    ],
  },
  {
    id: "production",
    label: "Production",
    icon: Wrench,
    color: "text-domain",
    tabs: [
      {
        id: "resources",
        label: "Extraction",
        icon: Pickaxe,
        color: "text-warning",
      },
      { id: "factories", label: "Factories", icon: Cog, color: "text-domain" },
      {
        id: "productionChains",
        label: "Chains",
        icon: GitBranch,
        color: "text-success",
      },
      {
        id: "storage",
        label: "Storage",
        icon: Database,
        color: "text-warning",
      },
      { id: "power", label: "Power Grid", icon: Zap, color: "text-warning" },
      { id: "workers", label: "Workers", icon: Users, color: "text-brand" },
    ],
  },
  {
    id: "logistics",
    label: "Logistics",
    icon: Truck,
    color: "text-brand",
    tabs: [
      { id: "transport", label: "Transport", icon: Truck, color: "text-brand" },
      {
        id: "market",
        label: "Market",
        icon: TrendingUp,
        color: "text-success",
      },
      {
        id: "contracts",
        label: "Contracts",
        icon: ScrollText,
        color: "text-danger",
      },
      {
        id: "droneDelivery",
        label: "Drones",
        icon: Plane,
        color: "text-brand",
      },
      {
        id: "tradePost",
        label: "Trade Post",
        icon: ArrowRightLeft,
        color: "text-research",
      },
    ],
  },
  {
    id: "progression",
    label: "Progression",
    icon: FlaskConical,
    color: "text-research",
    tabs: [
      {
        id: "research",
        label: "Research",
        icon: FlaskConical,
        color: "text-research",
      },
      { id: "automation", label: "Automation", icon: Bot, color: "text-brand" },
      { id: "prestige", label: "Expand", icon: Globe, color: "text-premium" },
      {
        id: "megaprojects",
        label: "Mega Projects",
        icon: Globe,
        color: "text-premium",
      },
    ],
  },
  {
    id: "rewards",
    label: "Rewards",
    icon: Trophy,
    color: "text-warning",
    tabs: [
      { id: "quests", label: "Quests", icon: Scroll, color: "text-warning" },
      {
        id: "achievements",
        label: "Achievements",
        icon: Trophy,
        color: "text-warning",
      },
      {
        id: "dailyRewards",
        label: "Daily Rewards",
        icon: Gift,
        color: "text-premium",
      },
      {
        id: "leaderboard",
        label: "Leaderboard",
        icon: Trophy,
        color: "text-warning",
      },
      {
        id: "events",
        label: "Events",
        icon: AlertTriangle,
        color: "text-danger",
      },
    ],
  },
  {
    id: "finance",
    label: "Finance",
    icon: Coins,
    color: "text-success",
    tabs: [
      {
        id: "payouts",
        label: "Payouts",
        icon: DollarSign,
        color: "text-success",
      },
      { id: "notifications", label: "Alerts", icon: Bell, color: "text-brand" },
    ],
  },
  {
    id: "system",
    label: "System",
    icon: Database,
    color: "text-subtle",
    tabs: [
      {
        id: "statistics",
        label: "Statistics",
        icon: BarChart3,
        color: "text-brand",
      },
      {
        id: "blueprints",
        label: "Blueprints",
        icon: Save,
        color: "text-brand",
      },
      {
        id: "settings",
        label: "Settings",
        icon: Settings,
        color: "text-subtle",
      },
    ],
  },
];

// ─── Keyboard shortcut map (derived from nav group order) ──────────────────────

export const KEY_TAB_MAP: Record<string, GameTab> = {
  "1": "dashboard",
  "2": "factoryMap",
  "3": "resources",
  "4": "factories",
  "5": "power",
  "6": "market",
  "7": "research",
  "8": "quests",
  "9": "transport",
  "0": "dashboard",
};

// ─── Get the group a tab belongs to ────────────────────────────────────────────

export function getGroupForTab(tabId: GameTab): NavGroup | undefined {
  return NAV_GROUPS.find((g) => g.tabs.some((t) => t.id === tabId));
}

// ─── Desktop Sidebar Component ─────────────────────────────────────────────────

export function GameSidebar() {
  const pathname = usePathname();
  const handleTabChange = useTabChange();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch('/api/auth/session/me');
        if (!res.ok) {
          setIsAdmin(false);
          return;
        }
        const data = await res.json();
        setIsAdmin(!!data?.user?.isAdmin);
      } catch {
        setIsAdmin(false);
      }
    };
    check();
  }, []);

  // Track which groups are expanded - persisted via useSettingsStore (Phase 1.6)
  const expandedGroupsArray = useSettingsStore((s) => s.expandedGroups);
  const toggleGroup = useSettingsStore((s) => s.toggleExpandedGroup);
  const expandedGroups = useMemo(
    () => new Set(expandedGroupsArray),
    [expandedGroupsArray],
  );

  // Derive active tab from URL pathname instead of props
  const activeTab = pathname.startsWith("/game/") ? pathname.slice(6).split("/")[0] as GameTab : "dashboard";

  // Find which group contains the active tab, auto-expand it if collapsed
  const activeGroup = getGroupForTab(activeTab);

  // ── Buy Me a Coffee ──
  const BUYMEACOFFEE_URL = "https://buymeacoffee.com/malcolmkhod";

  return (
    <nav className="hidden md:flex flex-col w-16 lg:w-52 shrink-0 bg-background border-r border-brand/20" data-tablet-collapsed="true">
      <div className="flex flex-col py-2 gap-0.5 px-2 flex-1 overflow-y-auto game-scrollbar">
        {NAV_GROUPS.map((group) => {
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
                    ? `${group.color} bg-white/3`
                    : "text-muted-label hover:text-subtle hover:bg-white/2"
                }`}
              >
                <GroupIcon className="w-3 h-3 shrink-0" />
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
                  {group.tabs.map((tab) => {
                    const TabIcon = tab.icon;
                    const isActive = activeTab === tab.id;

                    return (
                      <Link
                        key={tab.id}
                        href={`/game/${tab.id}`}
                        prefetch
                        onClick={(e) => {
                          if (!handleTabChange(tab.id)) {
                            e.preventDefault();
                          }
                        }}
                        aria-current={isActive ? "page" : undefined}
                        className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-medium focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:ring-offset-1 focus-visible:ring-offset-gray-900 ${
                          isActive
                            ? `${tab.color} bg-white/5 border border-white/8 shadow-[0_0_8px_rgba(34,211,238,0.05)]`
                            : "text-muted-label hover:text-subtle hover:bg-white/3 border border-transparent"
                        }`}
                      >
                        <TabIcon className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{tab.label}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {isAdmin && (
        <div className="shrink-0 border-t border-brand/20 px-2 pt-2">
          <a
            href="/admin"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium
              text-warning hover:text-warning/80 hover:bg-warning/60/10 border border-transparent
              hover:border-warning/60/20 transition-colors"
          >
            <Shield className="w-4 h-4 shrink-0" />
            <span className="truncate">Admin Panel</span>
          </a>
        </div>
      )}

      <div className="shrink-0 border-t border-brand/20 px-2 pt-2">
        <SupportButton />
      </div>

      {/* ── Support footer (always visible at sidebar bottom) ── */}
      <div className="shrink-0 border-t border-brand/20 px-2 pt-2 pb-3">
        <a
          href={BUYMEACOFFEE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium
            text-warning border border-transparent"
          aria-label="Support the developer on Buy Me a Coffee"
        >
          <Coffee className="w-4 h-4 shrink-0 text-warning" />
          <span className="truncate text-warning">Buy me a coffee</span>
          <Heart className="w-3 h-3 ml-auto text-danger" />
        </a>
        {/* QR Code hint */}
        <div className="mt-1.5 px-2.5 pb-1">
          <a
            href={BUYMEACOFFEE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="block"
          >
            <Image
              src="/bmc_qr.png"
              alt="Scan QR code to support on Buy Me a Coffee"
              width={64}
              height={64}
              className="w-16 h-16 rounded-md mx-auto opacity-90"
            />
          </a>
        </div>
      </div>
    </nav>
  );
}
