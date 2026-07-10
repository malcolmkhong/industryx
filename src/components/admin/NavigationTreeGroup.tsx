'use client';

interface NavigationTreeGroupProps {
  label: string;
  isActive?: boolean;
}

export function NavigationTreeGroup({ label, isActive }: NavigationTreeGroupProps) {
  return (
    <div className="px-3 pt-5 pb-1.5">
      <p
        className={`text-[11px] font-semibold uppercase tracking-widest select-none ${
          isActive ? 'text-warning/80' : 'text-muted-label'
        }`}
      >
        {label}
      </p>
    </div>
  );
}
