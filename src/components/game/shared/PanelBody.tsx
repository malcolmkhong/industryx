import type { ReactNode } from 'react';

interface PanelBodyProps {
  children: ReactNode;
  scrollable?: boolean;
  className?: string;
}

/**
 * Scrollable content area for a panel. When `scrollable` is true (default),
 * the body grows to fill remaining height and scrolls independently of
 * the page. Use as a direct child of <PanelShell>, after <PanelHeader>.
 */
export function PanelBody({ children, scrollable = true, className = '' }: PanelBodyProps) {
  const baseClass = scrollable
    ? 'flex-1 min-h-0 overflow-y-auto overflow-x-hidden game-scrollbar'
    : 'flex-shrink-0';
  return <div className={`${baseClass} ${className}`}>{children}</div>;
}
