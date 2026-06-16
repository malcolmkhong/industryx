import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard, Activity, Users, GitCompare, AlertTriangle,
  Flag, ScrollText, ShieldCheck, Download, Cog, TrendingUp,
  BarChart3, Database, KeyRound, UserCog, Lock, LifeBuoy, Search,
} from 'lucide-react';

export interface NavTreePage {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  phase?: 'P1' | 'P2' | 'P3';
  badge?: string | number;
  badgeColor?: string;
}

export interface NavTreeGroup {
  id: string;
  label: string;
  pages: NavTreePage[];
}

export const ADMIN_NAV_TREE: NavTreeGroup[] = [
  {
    id: 'overview',
    label: 'Overview',
    pages: [
      { id: 'dashboard', label: 'Dashboard', href: '/admin', icon: LayoutDashboard },
      { id: 'system-status', label: 'System Status', href: '/admin/system-status', icon: Activity, phase: 'P1' },
      { id: 'player-search', label: 'Quick Search', href: '/admin/players', icon: Search },
    ],
  },
  {
    id: 'players',
    label: 'Players',
    pages: [
      { id: 'player-list', label: 'Player List', href: '/admin/players', icon: Users },
      { id: 'player-compare', label: 'Compare', href: '/admin/players/compare', icon: GitCompare, phase: 'P2' },
    ],
  },
  {
    id: 'investigations',
    label: 'Investigations',
    pages: [
      { id: 'investigations-queue', label: 'Queue', href: '/admin/investigations', icon: AlertTriangle },
      { id: 'reports', label: 'Reports', href: '/admin/reports', icon: Flag, phase: 'P2' },
    ],
  },
  {
    id: 'actions',
    label: 'Actions',
    pages: [
      { id: 'player-audit', label: 'Player Audit', href: '/admin/actions/player', icon: ScrollText },
      { id: 'admin-audit', label: 'Admin Audit', href: '/admin/actions/admin', icon: ShieldCheck },
      { id: 'export-audit', label: 'Export', href: '/admin/actions/export', icon: Download, phase: 'P2' },
    ],
  },
  {
    id: 'operations',
    label: 'Operations',
    pages: [
      { id: 'jobs', label: 'Jobs', href: '/admin/jobs', icon: Cog, phase: 'P1' },
      { id: 'market', label: 'Market', href: '/admin/market', icon: TrendingUp, phase: 'P1' },
      { id: 'economy', label: 'Economy', href: '/admin/economy', icon: BarChart3, phase: 'P2' },
    ],
  },
  {
    id: 'configuration',
    label: 'Configuration',
    pages: [
      { id: 'config-tables', label: 'Config Tables', href: '/admin/config', icon: Database },
      { id: 'roles', label: 'Roles', href: '/admin/roles', icon: KeyRound, phase: 'P2' },
    ],
  },
  {
    id: 'admin',
    label: 'Admin',
    pages: [
      { id: 'admin-users', label: 'Admin Users', href: '/admin/admins', icon: UserCog },
      { id: 'permissions', label: 'Permissions', href: '/admin/permissions', icon: Lock, phase: 'P3' },
      { id: 'support', label: 'Support', href: '/admin/support', icon: LifeBuoy, phase: 'P3' },
    ],
  },
];

export function filterNavTreeByRole(
  tree: NavTreeGroup[],
  role: string,
): NavTreeGroup[] {
  return tree
    .map((group) => ({
      ...group,
      pages: group.pages.filter((page) => {
        if (role === 'viewer') {
          return true;
        }
        return true;
      }),
    }))
    .filter((group) => group.pages.length > 0);
}

export function findActiveGroup(pathname: string): string | null {
  for (const group of ADMIN_NAV_TREE) {
    for (const page of group.pages) {
      if (page.href === pathname || pathname.startsWith(page.href + '/')) {
        return group.id;
      }
    }
  }
  return null;
}
