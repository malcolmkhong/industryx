'use client';

import { memo } from 'react';

// ─── Shared PanelStatCard ──────────────────────────────────────────────────────
// Used across ResourcePanel, FactoryPanel, and other panels for consistent stat display

type StatColor = 'cyan' | 'green' | 'orange' | 'red' | 'purple' | 'yellow' | 'amber' | 'emerald' | 'fuchsia' | 'sky' | 'rose' | 'teal';

const COLOR_MAP: Record<StatColor, { icon: string; value: string; border: string; bg: string; gradientFrom: string; borderAccent: string }> = {
  cyan: { icon: 'text-brand', value: 'text-brand', border: 'border-brand/30', bg: 'bg-brand/10', gradientFrom: 'from-brand/20', borderAccent: 'border-l-brand' },
  green: { icon: 'text-success', value: 'text-success', border: 'border-success/30', bg: 'bg-success/10', gradientFrom: 'from-success/30/20', borderAccent: 'border-l-success' },
  orange: { icon: 'text-domain', value: 'text-domain', border: 'border-domain/30', bg: 'bg-domain/10', gradientFrom: 'from-domain/20/20', borderAccent: 'border-l-domain' },
  red: { icon: 'text-danger', value: 'text-danger', border: 'border-danger/40/30', bg: 'bg-danger/10', gradientFrom: 'from-danger/20', borderAccent: 'border-l-danger' },
  purple: { icon: 'text-research', value: 'text-research', border: 'border-research/30', bg: 'bg-research/10', gradientFrom: 'from-research/20/20', borderAccent: 'border-l-research' },
  yellow: { icon: 'text-warning', value: 'text-warning', border: 'border-warning/30', bg: 'bg-warning/10', gradientFrom: 'from-warning/20', borderAccent: 'border-l-warning/50' },
  amber: { icon: 'text-warning', value: 'text-warning', border: 'border-warning/30', bg: 'bg-warning/10', gradientFrom: 'from-warning/20', borderAccent: 'border-l-warning/50' },
  emerald: { icon: 'text-success', value: 'text-success', border: 'border-success/30', bg: 'bg-success/10', gradientFrom: 'from-success/30/20', borderAccent: 'border-l-success' },
  fuchsia: { icon: 'text-premium', value: 'text-premium', border: 'border-premium/20/30', bg: 'bg-premium/20/10', gradientFrom: 'from-premium/30/20', borderAccent: 'border-l-premium' },
  sky: { icon: 'text-brand', value: 'text-brand', border: 'border-brand/30', bg: 'bg-brand/10', gradientFrom: 'from-900-sky/20', borderAccent: 'border-l-brand/80' },
  rose: { icon: 'text-danger', value: 'text-danger', border: 'border-900-rose/30', bg: 'bg-danger/10', gradientFrom: 'from-900-rose/20', borderAccent: 'border-l-danger' },
  teal: { icon: 'text-brand', value: 'text-brand', border: 'border-brand/30', bg: 'bg-brand/10', gradientFrom: 'from-success/30/20', borderAccent: 'border-l-success/70' },
};

interface PanelStatCardProps {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  subtext: string;
  color: StatColor;
  /** Optional trend indicator */
  trend?: 'up' | 'down' | 'neutral';
}

function PanelStatCardImpl({ icon, label, value, subtext, color, trend }: PanelStatCardProps) {
  const c = COLOR_MAP[color];

  return (
    <div
      className={`game-card rounded-xl bg-linear-to-br ${c.gradientFrom} to-transparent p-3 border ${c.border} ${c.borderAccent} border-l-[3px] transition-all duration-200 hover:scale-[1.02] hover:shadow-lg cursor-default`}
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
