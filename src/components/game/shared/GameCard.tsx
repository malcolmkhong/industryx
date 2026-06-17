'use client';

import { cn } from '@/lib/utils';

interface GameCardProps {
  children: React.ReactNode;
  className?: string;
  /** Optional accent color for left border */
  accent?: 'cyan' | 'orange' | 'purple' | 'emerald' | 'amber' | 'red' | 'none';
  /** Whether card is hoverable (adds hover effects) */
  hoverable?: boolean;
  /** Whether card is clickable (adds cursor + active feedback) */
  clickable?: boolean;
  /** Optional click handler */
  onClick?: () => void;
  /** Optional aria-label for clickable cards */
  'aria-label'?: string;
}

const ACCENT_MAP = {
  cyan: 'border-l-brand border-l-[3px]',
  orange: 'border-l-domain border-l-[3px]',
  purple: 'border-l-research border-l-[3px]',
  emerald: 'border-l-success border-l-[3px]',
  amber: 'border-l-warning/50 border-l-[3px]',
  red: 'border-l-danger border-l-[3px]',
  none: '',
};

export function GameCard({ children, className, accent = 'none', hoverable = false, clickable = false, onClick, 'aria-label': ariaLabel }: GameCardProps) {
  const Component = clickable ? 'button' : 'div';
  return (
    <Component
      className={cn(
        'rounded-xl border border-muted-label/30 bg-[#111827] p-4 transition-all duration-300',
        ACCENT_MAP[accent],
        hoverable && 'hover:border-muted-label/50 hover:shadow-lg hover:scale-[1.01]',
        clickable && 'cursor-pointer focus-visible:ring-2 focus-visible:ring-brand/50',
        className,
      )}
      onClick={onClick}
      aria-label={ariaLabel}
      {...(clickable ? { role: 'button', tabIndex: 0 } : {})}
    >
      {children}
    </Component>
  );
}
