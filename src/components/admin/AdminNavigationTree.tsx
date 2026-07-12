'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronLeft, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { NavigationTreeGroup } from './NavigationTreeGroup';
import { NavigationTreeNode } from './NavigationTreeNode';
import {
  ADMIN_NAV_TREE,
  filterNavTreeByRole,
  findActiveGroup,
  type NavTreeGroup,
} from '@/lib/admin/navTree';

const STORAGE_KEY = 'admin-nav-collapsed';
const SIDEBAR_WIDTH = 240;
const SIDEBAR_COLLAPSED = 64;

export function AdminNavigationTree() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored !== null ? stored === 'true' : false;
  });
  const [userRole, setUserRole] = useState<string>('viewer');

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  }, []);

  // Fetch the current admin's role from /api/auth/session/me so the nav tree
  // can hide entries the user doesn't have permission to see.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/auth/session/me', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data?.user?.role) {
          setUserRole(data.user.role);
        }
      } catch {
        // Network error: keep default 'viewer' (fail-closed per RULES.md [SEC-002])
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const activeGroupId = findActiveGroup(pathname);
  const tree = filterNavTreeByRole(ADMIN_NAV_TREE, userRole);

  return (
    <aside
      className="fixed left-0 top-0 bottom-0 z-40 flex flex-col bg-background/95 backdrop-blur-xl border-r border-muted-label/40/60 transition-all duration-200 overflow-hidden"
      style={{ width: collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_WIDTH }}
    >
      <div className="flex items-center justify-between h-14 px-3 border-b border-muted-label/40/60 shrink-0">
        {!collapsed && (
          <span className="text-sm font-bold text-white tracking-tight truncate">
            IndustriaX
          </span>
        )}
        <button
          type="button"
          onClick={toggleCollapsed}
          className={[
            'flex items-center justify-center w-7 h-7 rounded-md transition-colors',
            'text-muted-label hover:text-subtle hover:bg-background/60/60',
            collapsed ? 'mx-auto' : '',
          ].join(' ')}
        >
          {collapsed ? (
            <PanelLeftOpen className="w-4 h-4" />
          ) : (
            <PanelLeftClose className="w-4 h-4" />
          )}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-1">
        {tree.map((group: NavTreeGroup) => (
          <div key={group.id}>
            {!collapsed && (
              <NavigationTreeGroup
                label={group.label}
                isActive={group.id === activeGroupId}
              />
            )}
            {group.pages.map((page) => (
              <NavigationTreeNode
                key={page.id}
                label={page.label}
                href={page.href}
                icon={page.icon}
                indent={collapsed ? 0 : 1}
                badge={page.badge}
                badgeColor={page.badgeColor}
                phase={page.phase}
              />
            ))}
          </div>
        ))}
      </nav>

      <div className="border-t border-muted-label/40/60 p-2 shrink-0">
        <Link
          href="/"
          className={[
            'flex items-center gap-2.5 h-8 rounded-md transition-colors text-muted-label hover:text-subtle hover:bg-background/60/40',
            collapsed ? 'justify-center px-0' : 'px-3',
          ].join(' ')}
        >
          <ChevronLeft className="w-4 h-4 shrink-0" />
          {!collapsed && (
            <span className="text-[13px] font-medium truncate">Back to Game</span>
          )}
        </Link>
      </div>
    </aside>
  );
}
