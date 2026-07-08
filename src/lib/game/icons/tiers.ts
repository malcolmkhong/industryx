// ============================================
// IndustryaX: Tier Definitions — DEPRECATED REDIRECT
// ============================================
// This file previously contained the canonical TIER_INFO definition.
// As of TIER CENTRALIZATION (Phase 6 of TIER5_WIRING_PLAN), the canonical
// home for tier metadata is `src/lib/game/tiers.ts`.
//
// This file now re-exports from the central module for backward compatibility
// with existing imports. All new code should import directly from
// `src/lib/game/tiers.ts` (or `@/lib/game/tiers`).
// ============================================

// Re-export the canonical tier module
export {
  TIER_INFO,
  MAX_TIER,
  ALL_TIERS,
  getTierColor,
  getTierInfo,
  isValidTier,
  type TierInfo,
} from "../tiers";

// Re-export color utilities — these use custom Tailwind tokens (brand, domain, etc.)
export {
  getTierColorClasses,
  type TierColor,
  type TierColorClasses,
  TIER_COLOR_MAP,
  TIER_NUMBER_COLOR_MAP,
} from "../../../components/game/shared/tierColors";
