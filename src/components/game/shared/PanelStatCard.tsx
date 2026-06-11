'use client';

import { memo } from 'react';

// ─── Shared PanelStatCard ──────────────────────────────────────────────────────
// Used across ResourcePanel, FactoryPanel, and other panels for consistent stat display

type StatColor = 'cyan' | 'green' | 'orange' | 'red' | 'purple' | 'yellow' | 'amber' | 'emerald' | 'fuchsia' | 'sky' | 'rose' | 'teal';

const COLOR_MAP: Record<StatColor, { icon: string; value: string; border: string; bg: string; gradientFrom: string; borderAccent: string }> = {
  cyan: { icon: 'text-cyan-400', value: 'text-cyan-400', border: 'border-cyan-900/30', bg: 'bg-cyan-900/10', gradientFrom: 'from-cyan-900/20', borderAccent: 'border-l-cyan-500' },
  green: { icon: 'text-success', value: 'text-success', border: 'border-success/30', bg: 'bg-success/10', gradientFrom: 'from-green-900/20', borderAccent: 'border-l-green-500' },
  orange: { icon: 'text-orange-400', value: 'text-orange-400', border: 'border-orange-900/30', bg: 'bg-orange-900/10', gradientFrom: 'from-orange-900/20', borderAccent: 'border-l-orange-500' },
  red: { icon: 'text-danger', value: 'text-danger', border: 'border-red-900/30', bg: 'bg-danger/10', gradientFrom: 'from-red-900/20', borderAccent: 'border-l-red-500' },
  purple: { icon: 'text-purple-400', value: 'text-purple-400', border: 'border-purple-900/30', bg: 'bg-purple-900/10', gradientFrom: 'from-purple-900/20', borderAccent: 'border-l-purple-500' },
  yellow: { icon: 'text-warning', value: 'text-warning', border: 'border-yellow-900/30', bg: 'bg-yellow-900/10', gradientFrom: 'from-yellow-900/20', borderAccent: 'border-l-yellow-500' },
  amber: { icon: 'text-warning', value: 'text-warning', border: 'border-amber-900/30', bg: 'bg-amber-900/10', gradientFrom: 'from-amber-900/20', borderAccent: 'border-l-amber-500' },
  emerald: { icon: 'text-success', value: 'text-success', border: 'border-success/30', bg: 'bg-success/10', gradientFrom: 'from-emerald-900/20', borderAccent: 'border-l-emerald-500' },
  fuchsia: { icon: 'text-fuchsia-400', value: 'text-fuchsia-400', border: 'border-fuchsia-900/30', bg: 'bg-fuchsia-900/10', gradientFrom: 'from-fuchsia-900/20', borderAccent: 'border-l-fuchsia-500' },
  sky: { icon: 'text-sky-400', value: 'text-sky-400', border: 'border-sky-900/30', bg: 'bg-sky-900/10', gradientFrom: 'from-sky-900/20', borderAccent: 'border-l-sky-500' },
  rose: { icon: 'text-rose-400', value: 'text-rose-400', border: 'border-rose-900/30', bg: 'bg-rose-900/10', gradientFrom: 'from-rose-900/20', borderAccent: 'border-l-rose-500' },
  teal: { icon: 'text-teal-400', value: 'text-teal-400', border: 'border-teal-900/30', bg: 'bg-teal-900/10', gradientFrom: 'from-teal-900/20', borderAccent: 'border-l-teal-500' },
};

interface PanelStatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtext: string;
  color: StatColor;
  /** Optional trend indicator */
  trend?: 'up' | 'down' | 'neutral';
}

function PanelStatCardImpl({ icon, label, value, subtext, color, trend }: PanelStatCardProps) {
  const c = COLOR_MAP[color];

  return (
    <div
      className={`game-card rounded-xl bg-gradient-to-br ${c.gradientFrom} to-transparent p-3 border ${c.border} ${c.borderAccent} border-l-[3px] transition-all duration-200 hover:scale-[1.02] hover:shadow-lg cursor-default`}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <div className={`w-7 h-7 rounded-lg ${c.bg} flex items-center justify-center transition-transform duration-300`}>
          <div className={c.icon}>{icon}</div>
        </div>
        <span className="text-[10px] text-muted-label uppercase tracking-wider">{label}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className={`text-lg font-bold font-mono ${c.value} transition-all duration-200`}>{value}</div>
        {trend === 'up' && <span className="text-[10px] text-success">▲</span>}
        {trend === 'down' && <span className="text-[10px] text-danger">▼</span>}
      </div>
      <div className="text-[10px] text-muted-label mt-0.5">{subtext}</div>
    </div>
  );
}

// React.memo: PanelStatCard receives primitive props and renders 5-20x per panel.
// Without memo, every parent re-render triggers re-render of every card.
export const PanelStatCard = memo(PanelStatCardImpl);
PanelStatCard.displayName = 'PanelStatCard';

export type { StatColor };
