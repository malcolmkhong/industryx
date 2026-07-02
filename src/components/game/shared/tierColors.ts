// ─── Shared Tier Color System ──────────────────────────────────────────────────
// Unified color class mappings used across FactoryPanel, ResourcePanel, and other panels

export type TierColor = 'cyan' | 'orange' | 'purple' | 'emerald' | 'amber' | 'red';

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

export const TIER_COLOR_MAP: Record<TierColor, TierColorClasses> = {
  cyan: {
    text: 'text-brand',
    border: 'border-brand/30',
    bg: 'bg-brand/20/20',
    hoverBorder: 'hover:border-brand/50',
    glow: 'hover:shadow-[0_0_15px_rgba(0,255,242,0.1)]',
    buttonBorder: 'border-brand/80/50',
    buttonText: 'text-brand',
    buttonHover: 'hover:bg-brand/20/30 hover:border-brand',
    badge: 'border-600-cyan/50',
    tabActive: 'border-brand/60 bg-brand/20/25 text-brand shadow-[0_0_12px_rgba(0,255,242,0.15)]',
    tabHover: 'hover:border-brand/80/50 hover:text-brand/60',
  },
  orange: {
    text: 'text-domain',
    border: 'border-domain/30',
    bg: 'bg-domain/20/20',
    hoverBorder: 'hover:border-domain/50',
    glow: 'hover:shadow-[0_0_15px_rgba(249,115,22,0.1)]',
    buttonBorder: 'border-domain/70/50',
    buttonText: 'text-domain',
    buttonHover: 'hover:bg-domain/20/30 hover:border-domain',
    badge: 'border-domain/80/50',
    tabActive: 'border-domain/60 bg-domain/20/25 text-domain shadow-[0_0_12px_rgba(249,115,22,0.15)]',
    tabHover: 'hover:border-domain/70/50 hover:text-domain/60',
  },
  purple: {
    text: 'text-research',
    border: 'border-research/30',
    bg: 'bg-research/20/20',
    hoverBorder: 'hover:border-research/50',
    glow: 'hover:shadow-[0_0_15px_rgba(168,85,247,0.1)]',
    buttonBorder: 'border-research/60/50',
    buttonText: 'text-research',
    buttonHover: 'hover:bg-research/20/30 hover:border-research',
    badge: 'border-600-purple/50',
    tabActive: 'border-research/60 bg-research/20/25 text-research shadow-[0_0_12px_rgba(168,85,247,0.15)]',
    tabHover: 'hover:border-research/60/50 hover:text-research/60',
  },
  emerald: {
    text: 'text-success',
    border: 'border-success/30',
    bg: 'bg-success/20/20',
    hoverBorder: 'hover:border-success/50',
    glow: 'hover:shadow-[0_0_15px_rgba(0,255,204,0.1)]',
    buttonBorder: 'border-success/60/50',
    buttonText: 'text-success',
    buttonHover: 'hover:bg-success/20/30 hover:border-success',
    badge: 'border-success/80/50',
    tabActive: 'border-success/60 bg-success/20/25 text-success shadow-[0_0_12px_rgba(0,255,204,0.15)]',
    tabHover: 'hover:border-success/60/50 hover:text-success/60',
  },
  amber: {
    text: 'text-warning',
    border: 'border-warning/60/30',
    bg: 'bg-warning/20',
    hoverBorder: 'hover:border-warning/60/50',
    glow: 'hover:shadow-[0_0_15px_rgba(245,158,11,0.1)]',
    buttonBorder: 'border-warning/50',
    buttonText: 'text-warning',
    buttonHover: 'hover:bg-warning/30 hover:border-warning/60',
    badge: 'border-warning/50',
    tabActive: 'border-warning/60/60 bg-warning/25 text-warning shadow-[0_0_12px_rgba(245,158,11,0.15)]',
    tabHover: 'hover:border-warning/50 hover:text-warning/80',
  },
  red: {
    text: 'text-danger',
    border: 'border-danger/30',
    bg: 'bg-danger/20/20',
    hoverBorder: 'hover:border-danger/50',
    glow: 'hover:shadow-[0_0_15px_rgba(255,23,68,0.1)]',
    buttonBorder: 'border-danger/60/50',
    buttonText: 'text-danger',
    buttonHover: 'hover:bg-danger/20/30 hover:border-danger',
    badge: 'border-danger/80/50',
    tabActive: 'border-danger/60 bg-danger/20/25 text-danger shadow-[0_0_12px_rgba(255,23,68,0.15)]',
    tabHover: 'hover:border-danger/60/50 hover:text-danger/60',
  },
};

export function getTierColorClasses(color: TierColor): TierColorClasses {
  return TIER_COLOR_MAP[color];
}

// Maps tier number to TierColor key
export const TIER_NUMBER_COLOR_MAP: Record<number, TierColor> = {
  0: 'cyan',
  1: 'cyan',
  2: 'orange',
  3: 'purple',
  4: 'emerald',
  5: 'red',
};
