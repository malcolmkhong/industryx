'use client';

interface NavigationTreeGroupProps {
  label: string;
}

export function NavigationTreeGroup({ label }: NavigationTreeGroupProps) {
  return (
    <div className="px-3 pt-5 pb-1.5">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500 select-none">
        {label}
      </p>
    </div>
  );
}
