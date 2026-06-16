'use client';

interface StatusBadgeProps {
  variant: 'success' | 'warning' | 'danger' | 'neutral' | 'info';
  children: React.ReactNode;
}

const variantStyles: Record<StatusBadgeProps['variant'], string> = {
  success: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  warning: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  danger: 'bg-red-500/10 text-red-400 border-red-500/20',
  neutral: 'bg-zinc-700/50 text-zinc-400 border-zinc-600/30',
  info: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
};

export function StatusBadge({ variant, children }: StatusBadgeProps) {
  return (
    <span
      className={[
        'inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border',
        variantStyles[variant],
      ].join(' ')}
    >
      {children}
    </span>
  );
}
