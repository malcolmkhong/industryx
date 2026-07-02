// ============================================
// FACTORY DOMINION: TIER DEFINITIONS
// Single source of truth for tier metadata.
// Re-exports color utilities from tierColors.ts.
// ============================================

// Re-export color utilities — these use custom Tailwind tokens (brand, domain, etc.)
export { getTierColorClasses, type TierColor, type TierColorClasses, TIER_COLOR_MAP, TIER_NUMBER_COLOR_MAP } from '../../../components/game/shared/tierColors';

// --- Tier Info ---
// Used across panels for tier badges, colors, and labels.
export const TIER_INFO: Record<number, {
  name: string;
  icon: string;       // SVG icon ID (game-icons:)
  emoji: string;       // Emoji for status display
  color: string;       // Hex color
  bgColor: string;     // RGBA background
  borderColor: string; // RGBA border
  description: string;
}> = {
  0: { name: 'Startup',          icon: 'game-icons:mining',     emoji: '🏗️', color: '#a0a0a0', bgColor: 'rgba(160,160,160,0.08)',   borderColor: 'rgba(160,160,160,0.3)',   description: 'Raw resources & basic extraction' },
  1: { name: 'Basic Processing',  icon: 'game-icons:wrench',     emoji: '🔧', color: '#22d3ee', bgColor: 'rgba(34,211,238,0.08)',     borderColor: 'rgba(34,211,238,0.3)',    description: 'Smelting, wire drawing, chemical processing' },
  2: { name: 'Advanced Mfg.',     icon: 'game-icons:big-gear',   emoji: '⚙️', color: '#f97316', bgColor: 'rgba(249,115,22,0.08)',    borderColor: 'rgba(249,115,22,0.3)',   description: 'Circuits, engines, batteries, gears' },
  3: { name: 'High-Tech',         icon: 'game-icons:brain',      emoji: '🧠', color: '#a855f7', bgColor: 'rgba(168,85,247,0.08)',   borderColor: 'rgba(168,85,247,0.3)',   description: 'AI, robotics, quantum, nano materials' },
  4: { name: 'Singularity',       icon: 'game-icons:galaxy',     emoji: '🌌', color: '#00ffcc', bgColor: 'rgba(0,255,204,0.08)',     borderColor: 'rgba(0,255,204,0.3)',    description: 'Singularity cores, dark matter, warp drives, chrono tech' },
  5: { name: 'Transcendent',     icon: 'game-icons:spaceship',   emoji: '🔮', color: '#ff1744', bgColor: 'rgba(255,23,68,0.08)',    borderColor: 'rgba(255,23,68,0.3)',    description: 'Omniscience arrays, world engines, dimensional gates, galactic armadas' },
};
