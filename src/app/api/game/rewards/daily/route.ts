// ============================================
// IndustriaX: Daily Reward Claim API
// POST — Server-authoritative daily reward claiming
// ============================================

import { NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth/verifyAuth';
import { checkRateLimit, RATE_LIMITS } from '@/lib/auth/rateLimiter';
import {
  getLastClaimDate,
  getUserStreak,
  claimDailyReward,
} from '@/lib/db/dailyRewards';
import { WEEKLY_DAILY_REWARDS, getStreakMultiplier } from '@/lib/game/config/configCache';

export async function POST(request: Request) {
  const auth = await verifyAuth();
  if (!auth.success) return auth.response;

  const rateLimitResult = await checkRateLimit(auth.userId, RATE_LIMITS.action, '/api/game/rewards/daily');
  if (rateLimitResult) return rateLimitResult;

  // Audit context per RULES.md [SEC-013]. Captures traceable request metadata
  // (idempotency key, user-agent) so duplicate claims can be reconciled in logs.
  const requestId = request.headers.get('x-request-id') ?? crypto.randomUUID();
  const userAgent = request.headers.get('user-agent') ?? 'unknown';
  console.info(
    `[DailyRewardAPI] user=${auth.userId} requestId=${requestId} ua=${userAgent.slice(0, 80)}`,
  );

  // Determine UTC today
  const today = new Date().toISOString().split('T')[0];

  // Get last claim date from DB
  const lastClaimDate = await getLastClaimDate(auth.userId);
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  // Calculate new streak
  let currentStreak = 1;
  let longestStreak = 1;
  let totalLogins = 1;

  // Try to load existing streak data
  const existingStreak = await getUserStreak(auth.userId);
  if (existingStreak) {
    totalLogins = existingStreak.total_logins + 1;
    longestStreak = existingStreak.longest_streak;

    if (lastClaimDate === yesterday) {
      currentStreak = existingStreak.current_streak + 1;
    } else if (lastClaimDate === today) {
      // Already claimed today — return current state
      return NextResponse.json({
        alreadyClaimed: true,
        streak: {
          currentStreak: existingStreak.current_streak,
          longestStreak: existingStreak.longest_streak,
          totalLogins: existingStreak.total_logins,
          lastLoginDate: today,
        },
      });
    } else {
      currentStreak = 1; // Missed a day
    }

    if (currentStreak > longestStreak) {
      longestStreak = currentStreak;
    }
  }

  // Calculate reward for the current day of the week
  const dayOfWeek = ((currentStreak - 1) % 7) + 1;
  const multiplier = getStreakMultiplier(currentStreak);

  const rewardTemplate = WEEKLY_DAILY_REWARDS.find(r => r.day === dayOfWeek);
  if (!rewardTemplate) {
    return NextResponse.json({ error: 'No reward configured for this day' }, { status: 500 });
  }

  const rewardAmount = Math.floor(rewardTemplate.amount * multiplier);

  // Record in DB
  const result = await claimDailyReward(
    auth.userId,
    {
      currentStreak,
      longestStreak,
      totalLogins,
      lastClaimDate: today,
    },
    {
      rewardDay: dayOfWeek,
      rewardType: rewardTemplate.type,
      rewardAmount,
      rewardResource: rewardTemplate.resource ?? null,
      streakMultiplier: multiplier,
    },
  );

  if (!result) {
    return NextResponse.json({ error: 'Failed to record daily reward' }, { status: 503 });
  }

  return NextResponse.json({
    success: true,
    reward: {
      day: dayOfWeek,
      type: rewardTemplate.type,
      amount: rewardAmount,
      resource: rewardTemplate.resource ?? null,
    },
    streak: {
      currentStreak,
      longestStreak,
      totalLogins,
      lastLoginDate: today,
    },
  });
}
