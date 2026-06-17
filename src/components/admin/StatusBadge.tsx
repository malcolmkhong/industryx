'use client';

interface StatusBadgeProps {
  variant: 'success' | 'warning' | 'danger' | 'neutral' | 'info';
  children: React.ReactNode;
}

const variantStyles: Record<StatusBadgeProps['variant'], string> = {
  success: 'bg-success/10 text-success border-success/20',
  warning: 'bg-warning/60/10 text-warning border-warning/60/20',
  danger: 'bg-danger/10 text-danger border-danger/20',
  neutral: 'bg-background/40/50 text-muted-label border-muted-label/20/30',
  info: 'bg-domain/60/10 text-domain/80 border-domain/20',
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
