import type { ReactNode } from 'react';

interface PanelHeaderProps {
  title: string;
  badge?: ReactNode;
  action?: ReactNode;
  className?: string;
}

/**
 * Panel-level heading row: title on the left, optional badge inline,
 * optional action slot (e.g., filter button, refresh) on the right.
 * Use as a direct child of <PanelShell>.
 */
export function PanelHeader({ title, badge, action, className = '' }: PanelHeaderProps) {
  return (
    <header className={`flex items-center justify-between gap-2 flex-shrink-0 ${className}`}>
      <div className="flex items-center gap-2 min-w-0">
        <h2 className="text-xl font-bold text-brand truncate">{title}</h2>
        {badge}
      </div>
      {action !== undefined && <div className="flex items-center gap-1 flex-shrink-0">{action}</div>}
    </header>
  );
}
