import type { ReactNode } from 'react';

interface SectionHeaderProps {
  title: string;
  badge?: ReactNode;
  action?: ReactNode;
  className?: string;
}

/**
 * Consistent panel section heading. Optional badge (count, status) on
 * the right of the title, optional action (button, link) further right.
 * Use to delimit logical groups within a panel.
 */
export function SectionHeader({ title, badge, action, className = '' }: SectionHeaderProps) {
  return (
    <div className={`flex items-center justify-between gap-2 mb-2 ${className}`}>
      <div className="flex items-center gap-2 min-w-0">
        <h3 className="text-sm font-semibold text-brand uppercase tracking-wider truncate">
          {title}
        </h3>
        {badge}
      </div>
      {action !== undefined && <div className="flex items-center gap-1 flex-shrink-0">{action}</div>}
    </div>
  );
}
