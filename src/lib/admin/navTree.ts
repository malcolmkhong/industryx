import {
  LayoutDashboard, Activity, Users, GitCompare, AlertTriangle,
  Flag, ScrollText, ShieldCheck, Cog, TrendingUp,
  BarChart3, Database, KeyRound, UserCog, Lock, LifeBuoy, Search,
  type LucideIcon,
} from 'lucide-react';

export type AdminNavRole = "viewer" | "admin" | "super_admin";

export interface NavTreePage {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  phase?: 'P1' | 'P2' | 'P3';
  badge?: string | number;
  badgeColor?: string;
  /** Minimum role required to see this nav entry. Defaults to "viewer". */
  requiredRole?: AdminNavRole;
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
      { id: 'system-status', label: 'System Status', href: '/admin/system-status', icon: Activity },
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
      { id: 'reports', label: 'Reports', href: '/admin/reports', icon: Flag },
    ],
  },
  {
    id: 'actions',
    label: 'Actions',
    pages: [
      { id: 'player-audit', label: 'Player Audit', href: '/admin/actions/player', icon: ScrollText },
      { id: 'admin-audit', label: 'Admin Audit', href: '/admin/actions/admin', icon: ShieldCheck },
    ],
  },
  {
    id: 'operations',
    label: 'Operations',
    pages: [
      { id: 'jobs', label: 'Jobs', href: '/admin/jobs', icon: Cog },
      { id: 'market', label: 'Market', href: '/admin/market', icon: TrendingUp },
      { id: 'economy', label: 'Economy', href: '/admin/economy', icon: BarChart3 },
    ],
  },
  {
    id: 'configuration',
    label: 'Configuration',
    pages: [
      { id: 'config-tables', label: 'Config Tables', href: '/admin/config', icon: Database, requiredRole: 'admin' },
      { id: 'roles', label: 'Roles', href: '/admin/roles', icon: KeyRound, phase: 'P2', requiredRole: 'admin' },
    ],
  },
  {
    id: 'admin',
    label: 'Admin',
    pages: [
      { id: 'admin-users', label: 'Admin Users', href: '/admin/admins', icon: UserCog, requiredRole: 'admin' },
      { id: 'permissions', label: 'Permissions', href: '/admin/permissions', icon: Lock, phase: 'P3', requiredRole: 'super_admin' },
      { id: 'support', label: 'Support', href: '/admin/support', icon: LifeBuoy },
    ],
  },
];

/**
 * Filter the nav tree by admin role. Pages with `requiredRole` are hidden
 * from users whose role rank is below the requirement. Role rank:
 *   viewer (0) < admin (1) < super_admin (2)
 * Pages without a `requiredRole` are visible to all roles.
 */
const ROLE_RANK: Record<AdminNavRole, number> = {
  viewer: 0,
  admin: 1,
  super_admin: 2,
};

export function filterNavTreeByRole(
  tree: NavTreeGroup[],
  role: string,
): NavTreeGroup[] {
  const userRank = ROLE_RANK[role as AdminNavRole] ?? 0;
  return tree
    .map((group) => ({
      ...group,
      pages: group.pages.filter((page) => {
        const required = page.requiredRole ?? "viewer";
        return userRank >= ROLE_RANK[required];
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
