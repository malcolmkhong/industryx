// ============================================
// FACTORY DOMINION: ICON MODULE
// Unified icon system — single import point for all icon assets.
// ============================================

// SVG icon mappings (game-icons: IDs → game-icons CDN)
export {
  RESOURCE_ICON_MAP,
  BUILDING_ICON_MAP,
  TRANSPORT_ICON_MAP,
  WORKER_ICON_MAP,
  RESEARCH_ICON_MAP,
  MEGA_PROJECT_ICON_MAP,
  WEATHER_ICON_MAP,
  UI_ICON_MAP,
  TIER_EMOJI_MAP,
} from './mappings';

// Tier definitions
export { TIER_INFO } from './tiers';
export {
  getTierColorClasses,
  TIER_COLOR_MAP,
  TIER_NUMBER_COLOR_MAP,
  type TierColor,
  type TierColorClasses,
} from './tiers';
