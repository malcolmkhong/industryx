'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';

interface NavigationTreeNodeProps {
  label: string;
  href: string;
  icon: LucideIcon;
  indent?: number;
  badge?: string | number;
  badgeColor?: string;
  phase?: 'P1' | 'P2' | 'P3';
}

export function NavigationTreeNode({
  label,
  href,
  icon: Icon,
  indent = 0,
  badge,
  badgeColor = 'bg-zinc-700 text-zinc-300',
  phase,
}: NavigationTreeNodeProps) {
  const pathname = usePathname();
  const isActive = pathname === href || (href !== '/admin' && pathname.startsWith(href + '/'));

  return (
    <Link
      href={href}
      className={[
        'group flex items-center gap-2.5 h-8 rounded-md transition-colors duration-100 cursor-pointer select-none',
        isActive
          ? 'bg-zinc-800/80 text-white'
          : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40',
      ].join(' ')}
      style={{ paddingLeft: `${12 + indent * 16}px`, paddingRight: '8px' }}
    >
      <div
        className={[
          'absolute left-0 top-0 bottom-0 w-0.5 rounded-r transition-colors',
          isActive ? 'bg-amber-500' : 'bg-transparent group-hover:bg-zinc-600',
        ].join(' ')}
      />

      <Icon className="w-4 h-4 shrink-0" />

      <span className="text-[13px] font-medium truncate flex-1 leading-none">
        {label}
      </span>

      {phase && (
        <span className="text-[10px] font-semibold text-zinc-600 bg-zinc-800/60 px-1.5 py-0.5 rounded leading-none">
          {phase}
        </span>
      )}

      {badge !== undefined && badge !== null && (
        <span
          className={[
            'text-[10px] font-semibold px-1.5 py-0.5 rounded leading-none min-w-[18px] text-center',
            badgeColor,
          ].join(' ')}
        >
          {badge}
        </span>
      )}
    </Link>
  );
}
