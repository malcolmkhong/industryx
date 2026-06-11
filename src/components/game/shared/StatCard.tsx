import type { ReactNode } from 'react';

export type StatCardVariant = 'money' | 'power' | 'research' | 'corporation' | 'default';

interface StatCardProps {
  label?: string;
  value: ReactNode;
  icon?: ReactNode;
  variant?: StatCardVariant;
  badge?: ReactNode;
  tooltip?: ReactNode;
  onClick?: () => void;
  className?: string;
  children?: ReactNode;
}

const VARIANT_CLASS: Record<StatCardVariant, string> = {
  money: 'stat-badge-money',
  power: 'stat-badge-power',
  research: 'stat-badge-rp',
  corporation: 'stat-badge-cp',
  default: '',
};

/**
 * Compact stat display badge for headers and panels. Replaces 40+ ad-hoc
 * stat-badge implementations across the codebase. Pair with a Tooltip for
 * a rich hover card; render `children` for inline extras (e.g., a
 * pending-payout pill).
 */
export function StatCard({
  label,
  value,
  icon,
  variant = 'default',
  badge,
  tooltip,
  onClick,
  className = '',
  children,
}: StatCardProps) {
  const variantClass = VARIANT_CLASS[variant];
  return (
    <div
      className={`stat-badge bg-card rounded-lg px-3 py-1.5 border border-cyan-900/20 ${onClick ? 'cursor-pointer' : 'cursor-default'} ${variantClass} ${className}`}
      onClick={onClick}
    >
      {icon !== undefined && (
        <span className="text-gray-500 inline-flex items-center gap-1">{icon}</span>
      )}
      {value}
      {badge}
      {children}
    </div>
  );
}
