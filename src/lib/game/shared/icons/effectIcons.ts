// ============================================
// FACTORY DOMINION: WEATHER + TIER EMOJI ICON MAPS
// Split from mappings.ts (static icon IDs only).
// ============================================

export const WEATHER_ICON_MAP: Record<string, string> = {
  clear: 'game-icons:sun',
  sunny: 'game-icons:sun',
  rainy: 'game-icons:heavy-rain',
  stormy: 'game-icons:lightning-storm',
  foggy: 'game-icons:fog',
  snowy: 'game-icons:snowflake-2',
};

// Used for status indicators, panel labels, and visual flair.
export const TIER_EMOJI_MAP: Record<number, string> = {
  0: '🏗️',
  1: '🔧',
  2: '⚙️',
  3: '🧠',
  4: '🌌',
  5: '🔮',
};

