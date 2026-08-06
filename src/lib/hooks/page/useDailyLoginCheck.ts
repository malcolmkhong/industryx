import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '@/lib/game/state/store';

// On mount, opens the daily reward dialog if today's reward is
// unclaimed based on the server-provided `loginStreak` (set by
// /api/auth/bootstrap). The hook is idempotent via an internal ref.
//
// All streak math runs server-side. The client only inspects the
// already-computed `loginStreak.weeklyRewards` to decide whether to
// show the dialog.
export function useDailyLoginCheck(): {
  dailyRewardDialogOpen: boolean;
  setDailyRewardDialogOpen: React.Dispatch<React.SetStateAction<boolean>>;
} {
  const [dailyRewardDialogOpen, setDailyRewardDialogOpen] = useState(false);
  const loginStreak = useGameStore(s => s.loginStreak);
  const hasCheckedDailyLogin = useRef(false);

  useEffect(() => {
    if (hasCheckedDailyLogin.current) return () => {};
    hasCheckedDailyLogin.current = true;
    const timer = setTimeout(() => {
      const currentDay = ((loginStreak.currentStreak - 1) % 7) + 1;
      const todayReward = loginStreak.weeklyRewards.find(
        r => r.day === currentDay && !r.claimed,
      );
      if (todayReward) {
        setDailyRewardDialogOpen(true);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [loginStreak]);

  return { dailyRewardDialogOpen, setDailyRewardDialogOpen };
}