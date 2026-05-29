'use client';

// ─── Shared PanelStatCard ──────────────────────────────────────────────────────
// Used across ResourcePanel, FactoryPanel, and other panels for consistent stat display

type StatColor = 'cyan' | 'green' | 'orange' | 'red' | 'purple' | 'yellow' | 'amber' | 'emerald' | 'fuchsia' | 'sky' | 'rose' | 'teal';

const COLOR_MAP: Record<StatColor, { icon: string; value: string; border: string; bg: string }> = {
  cyan: { icon: 'text-cyan-400', value: 'text-cyan-400', border: 'border-cyan-900/30', bg: 'bg-cyan-900/10' },
  green: { icon: 'text-green-400', value: 'text-green-400', border: 'border-green-900/30', bg: 'bg-green-900/10' },
  orange: { icon: 'text-orange-400', value: 'text-orange-400', border: 'border-orange-900/30', bg: 'bg-orange-900/10' },
  red: { icon: 'text-red-400', value: 'text-red-400', border: 'border-red-900/30', bg: 'bg-red-900/10' },
  purple: { icon: 'text-purple-400', value: 'text-purple-400', border: 'border-purple-900/30', bg: 'bg-purple-900/10' },
  yellow: { icon: 'text-yellow-400', value: 'text-yellow-400', border: 'border-yellow-900/30', bg: 'bg-yellow-900/10' },
  amber: { icon: 'text-amber-400', value: 'text-amber-400', border: 'border-amber-900/30', bg: 'bg-amber-900/10' },
  emerald: { icon: 'text-emerald-400', value: 'text-emerald-400', border: 'border-emerald-900/30', bg: 'bg-emerald-900/10' },
  fuchsia: { icon: 'text-fuchsia-400', value: 'text-fuchsia-400', border: 'border-fuchsia-900/30', bg: 'bg-fuchsia-900/10' },
  sky: { icon: 'text-sky-400', value: 'text-sky-400', border: 'border-sky-900/30', bg: 'bg-sky-900/10' },
  rose: { icon: 'text-rose-400', value: 'text-rose-400', border: 'border-rose-900/30', bg: 'bg-rose-900/10' },
  teal: { icon: 'text-teal-400', value: 'text-teal-400', border: 'border-teal-900/30', bg: 'bg-teal-900/10' },
};

interface PanelStatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtext: string;
  color: StatColor;
}

export function PanelStatCard({ icon, label, value, subtext, color }: PanelStatCardProps) {
  const c = COLOR_MAP[color];

  return (
    <div className={`game-card rounded-xl bg-[#111827] p-3 border ${c.border}`}>
      <div className="flex items-center gap-2 mb-1.5">
        <div className={`w-7 h-7 rounded-lg ${c.bg} flex items-center justify-center`}>
          <div className={c.icon}>{icon}</div>
        </div>
        <span className="text-[10px] text-gray-500 uppercase tracking-wider">{label}</span>
      </div>
      <div className={`text-lg font-bold font-mono ${c.value}`}>{value}</div>
      <div className="text-[10px] text-gray-500 mt-0.5">{subtext}</div>
    </div>
  );
}

export type { StatColor };
