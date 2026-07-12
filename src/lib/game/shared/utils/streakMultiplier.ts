// ============================================
// IndustryaX: Streak Multiplier (pure utility)
// Moved out of configCache so it can be a const import
// after data.ts deletion. The function is pure logic —
// does NOT vary per player or per Supabase config.
// ============================================

/**
 * Calculate streak multiplier for daily reward scaling.
 * >=3 days = 1.5x, >=5 days = 2x, >=7 days = 3x.
 */
export function getStreakMultiplier(streak: number): number {
  if (streak >= 7) return 3;
  if (streak >= 5) return 2;
  if (streak >= 3) return 1.5;
  return 1;
}
