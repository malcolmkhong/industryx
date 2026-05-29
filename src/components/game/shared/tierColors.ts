// ─── Shared Tier Color System ──────────────────────────────────────────────────
// Unified color class mappings used across FactoryPanel, ResourcePanel, and other panels

export type TierColor = 'cyan' | 'orange' | 'purple' | 'emerald' | 'amber';

export interface TierColorClasses {
  text: string;
  border: string;
  bg: string;
  hoverBorder: string;
  glow: string;
  buttonBorder: string;
  buttonText: string;
  buttonHover: string;
  badge: string;
  tabActive: string;
  tabHover: string;
}

const TIER_COLOR_MAP: Record<TierColor, TierColorClasses> = {
  cyan: {
    text: 'text-cyan-400',
    border: 'border-cyan-500/30',
    bg: 'bg-cyan-900/20',
    hoverBorder: 'hover:border-cyan-500/50',
    glow: 'hover:shadow-[0_0_15px_rgba(0,255,242,0.1)]',
    buttonBorder: 'border-cyan-700/50',
    buttonText: 'text-cyan-400',
    buttonHover: 'hover:bg-cyan-900/30 hover:border-cyan-500',
    badge: 'border-cyan-600/50',
    tabActive: 'border-cyan-500/60 bg-cyan-900/25 text-cyan-400 shadow-[0_0_12px_rgba(0,255,242,0.15)]',
    tabHover: 'hover:border-cyan-700/50 hover:text-cyan-300',
  },
  orange: {
    text: 'text-orange-400',
    border: 'border-orange-500/30',
    bg: 'bg-orange-900/20',
    hoverBorder: 'hover:border-orange-500/50',
    glow: 'hover:shadow-[0_0_15px_rgba(249,115,22,0.1)]',
    buttonBorder: 'border-orange-700/50',
    buttonText: 'text-orange-400',
    buttonHover: 'hover:bg-orange-900/30 hover:border-orange-500',
    badge: 'border-orange-600/50',
    tabActive: 'border-orange-500/60 bg-orange-900/25 text-orange-400 shadow-[0_0_12px_rgba(249,115,22,0.15)]',
    tabHover: 'hover:border-orange-700/50 hover:text-orange-300',
  },
  purple: {
    text: 'text-purple-400',
    border: 'border-purple-500/30',
    bg: 'bg-purple-900/20',
    hoverBorder: 'hover:border-purple-500/50',
    glow: 'hover:shadow-[0_0_15px_rgba(168,85,247,0.1)]',
    buttonBorder: 'border-purple-700/50',
    buttonText: 'text-purple-400',
    buttonHover: 'hover:bg-purple-900/30 hover:border-purple-500',
    badge: 'border-purple-600/50',
    tabActive: 'border-purple-500/60 bg-purple-900/25 text-purple-400 shadow-[0_0_12px_rgba(168,85,247,0.15)]',
    tabHover: 'hover:border-purple-700/50 hover:text-purple-300',
  },
  emerald: {
    text: 'text-emerald-400',
    border: 'border-emerald-500/30',
    bg: 'bg-emerald-900/20',
    hoverBorder: 'hover:border-emerald-500/50',
    glow: 'hover:shadow-[0_0_15px_rgba(0,255,204,0.1)]',
    buttonBorder: 'border-emerald-700/50',
    buttonText: 'text-emerald-400',
    buttonHover: 'hover:bg-emerald-900/30 hover:border-emerald-500',
    badge: 'border-emerald-600/50',
    tabActive: 'border-emerald-500/60 bg-emerald-900/25 text-emerald-400 shadow-[0_0_12px_rgba(0,255,204,0.15)]',
    tabHover: 'hover:border-emerald-700/50 hover:text-emerald-300',
  },
  amber: {
    text: 'text-amber-400',
    border: 'border-amber-500/30',
    bg: 'bg-amber-900/20',
    hoverBorder: 'hover:border-amber-500/50',
    glow: 'hover:shadow-[0_0_15px_rgba(245,158,11,0.1)]',
    buttonBorder: 'border-amber-700/50',
    buttonText: 'text-amber-400',
    buttonHover: 'hover:bg-amber-900/30 hover:border-amber-500',
    badge: 'border-amber-600/50',
    tabActive: 'border-amber-500/60 bg-amber-900/25 text-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.15)]',
    tabHover: 'hover:border-amber-700/50 hover:text-amber-300',
  },
};

export function getTierColorClasses(color: TierColor): TierColorClasses {
  return TIER_COLOR_MAP[color];
}

// Tier info constants used across panels
export const TIER_INFO = {
  0: { name: 'Startup', color: '#a0a0a0', emoji: '🏗️' },
  1: { name: 'Basic Processing', color: '#22d3ee', emoji: '🔧' },
  2: { name: 'Advanced Mfg.', color: '#f97316', emoji: '⚙️' },
  3: { name: 'High-Tech', color: '#a855f7', emoji: '🧠' },
  4: { name: 'Singularity', color: '#00ffcc', emoji: '🌌' },
} as const;
