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

// Tier definitions (canonical location: src/lib/game/progression/tiers.ts
// and src/components/game/shared/tierColors.ts). Previously this index
// re-exported from the deprecated redirect at ./tiers which has been
// removed; callers should import from the canonical locations directly.
export { TIER_INFO } from '../../progression/tiers';
export {
  getTierColorClasses,
  TIER_COLOR_MAP,
  TIER_NUMBER_COLOR_MAP,
  type TierColor,
  type TierColorClasses,
} from '../../../../components/game/shared/tierColors';
