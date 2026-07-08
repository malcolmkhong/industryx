// ============================================
// IndustryaX: Central Tier Definitions (SSOT)
// ============================================
// Single source of truth for all tier-related metadata.
//
// Replaces 6 scattered tier definitions that existed before this refactor:
//   1. TIER_INFO in src/lib/game/icons/tiers.ts (existing — moved here)
//   2. TIER_COLORS array in ContractPanel.tsx
//   3. TIER_CONFIG object in FactoryPanel.tsx
//   4. TIER_CONFIG object in StoragePanel.tsx
//   5. TIER_COLORS object in GlobalResourceMonitorPanel.tsx
//   6. TIER_COLORS array in AchievementPanel.tsx (different concept — achievements)
//
// All consumers MUST import from this file. Hardcoded tier arrays
// are forbidden and will fail the architecture test.
//
// Schema rationale: tiers 0–5 map to game progression (Startup → Transcendent).
// `MAX_TIER` is derived from the array length so adding tier 6 is one edit.
// ============================================

export interface TierInfo {
  /** Display name (e.g., "Singularity") */
  name: string;
  /** Game-icons SVG ID (e.g., "game-icons:galaxy") */
  icon: string;
  /** Emoji for compact status display */
  emoji: string;
  /** Primary hex color */
  color: string;
  /** RGBA background fill */
  bgColor: string;
  /** RGBA border color */
  borderColor: string;
  /** Short player-facing description */
  description: string;
  /** Tailwind utility color key (cyan/orange/purple/emerald/red) */
  tailwindColor: 'gray' | 'cyan' | 'orange' | 'purple' | 'emerald' | 'red';
  /** Tailwind background utility class (e.g., 'bg-brand/20') */
  tailwindBg: string;
  /** Tailwind border utility class */
  tailwindBorder: string;
}

/**
 * Tier definitions indexed by tier number (0–5).
 * Order matters: index 0 = tier 0 (Startup), index 5 = tier 5 (Transcendent).
 */
export const TIER_INFO: readonly TierInfo[] = [
  {
    name: 'Startup',
    icon: 'game-icons:mining',
    emoji: '🏗️',
    color: '#a0a0a0',
    bgColor: 'rgba(160,160,160,0.08)',
    borderColor: 'rgba(160,160,160,0.3)',
    description: 'Raw resources & basic extraction',
    tailwindColor: 'gray',
    tailwindBg: 'bg-muted-label/30',
    tailwindBorder: 'border-muted-label/40',
  },
  {
    name: 'Basic Processing',
    icon: 'game-icons:wrench',
    emoji: '🔧',
    color: '#22d3ee',
    bgColor: 'rgba(34,211,238,0.08)',
    borderColor: 'rgba(34,211,238,0.3)',
    description: 'Smelting, wire drawing, chemical processing',
    tailwindColor: 'cyan',
    tailwindBg: 'bg-brand/20',
    tailwindBorder: 'border-brand/40',
  },
  {
    name: 'Advanced Mfg.',
    icon: 'game-icons:big-gear',
    emoji: '⚙️',
    color: '#f97316',
    bgColor: 'rgba(249,115,22,0.08)',
    borderColor: 'rgba(249,115,22,0.3)',
    description: 'Circuits, engines, batteries, gears',
    tailwindColor: 'orange',
    tailwindBg: 'bg-domain/20',
    tailwindBorder: 'border-domain/40',
  },
  {
    name: 'High-Tech',
    icon: 'game-icons:brain',
    emoji: '🧠',
    color: '#a855f7',
    bgColor: 'rgba(168,85,247,0.08)',
    borderColor: 'rgba(168,85,247,0.3)',
    description: 'AI, robotics, quantum, nano materials',
    tailwindColor: 'purple',
    tailwindBg: 'bg-research/20',
    tailwindBorder: 'border-research/40',
  },
  {
    name: 'Singularity',
    icon: 'game-icons:galaxy',
    emoji: '🌌',
    color: '#00ffcc',
    bgColor: 'rgba(0,255,204,0.08)',
    borderColor: 'rgba(0,255,204,0.3)',
    description: 'Singularity cores, dark matter, warp drives, chrono tech',
    tailwindColor: 'emerald',
    tailwindBg: 'bg-success/20',
    tailwindBorder: 'border-success/40',
  },
  {
    name: 'Transcendent',
    icon: 'game-icons:spaceship',
    emoji: '🔮',
    color: '#ff1744',
    bgColor: 'rgba(255,23,68,0.08)',
    borderColor: 'rgba(255,23,68,0.3)',
    description: 'Omniscience arrays, world engines, dimensional gates, galactic armadas',
    tailwindColor: 'red',
    tailwindBg: 'bg-danger/20',
    tailwindBorder: 'border-danger/40',
  },
] as const;

/** Highest tier number (derived from array length — single source of truth). */
export const MAX_TIER = TIER_INFO.length - 1;

/** Numeric array of all valid tier numbers (e.g., [0,1,2,3,4,5]). */
export const ALL_TIERS: readonly number[] = TIER_INFO.map((_, i) => i);

/**
 * Map a tier number to its display color hex code.
 * Returns a safe fallback for unknown tiers.
 */
export function getTierColor(tier: number): string {
  return TIER_INFO[tier]?.color ?? '#a0a0a0';
}

/**
 * Map a tier number to its full TierInfo record.
 * Returns undefined for unknown tiers (caller should handle gracefully).
 */
export function getTierInfo(tier: number): TierInfo | undefined {
  return TIER_INFO[tier];
}

/**
 * Type guard: is this a valid tier number (0–MAX_TIER)?
 */
export function isValidTier(tier: number): boolean {
  return Number.isInteger(tier) && tier >= 0 && tier <= MAX_TIER;
}
