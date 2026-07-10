// ============================================
// UI Client Config
// All UI feedback timings in one place. Per RULES.md [ARC-009]: no magic
// numbers / silent fallbacks — even client-side feedback durations are
// named constants so they can be tuned consistently and the codebase has
// zero bare numeric literals in setTimeout / setInterval calls.
// ============================================

export const UI_CONFIG = {
  // BlueprintPanel feedback ("Saved", "Copied")
  blueprintSaveFeedbackMs: 300,
  blueprintCopyFeedbackMs: 2_000,

  // CloudSyncBlockBanner appear delay
  cloudSyncBannerAppearMs: 100,

  // ContractPanel fulfillment feedback
  contractFulfilledFeedbackMs: 300,

  // GlobalResourceMonitorPanel toast disappear
  globalResourceToastMs: 2_500,

  // Header headline rotation
  headlineRotationMs: 5_000,

  // Cloud-sync idle reset delay
  cloudStatusIdleResetMs: 2_000,
} as const;

export type UIConfig = typeof UI_CONFIG;
