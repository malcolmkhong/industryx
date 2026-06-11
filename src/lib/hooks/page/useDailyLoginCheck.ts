import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '@/lib/game/store';

// On mount, checks the daily login and opens the daily reward dialog if
// today's reward is unclaimed. Idempotent via an internal ref.
export function useDailyLoginCheck(): {
  dailyRewardDialogOpen: boolean;
  setDailyRewardDialogOpen: React.Dispatch<React.SetStateAction<boolean>>;
} {
  const [dailyRewardDialogOpen, setDailyRewardDialogOpen] = useState(false);
  const checkDailyLogin = useGameStore(s => s.checkDailyLogin);
  const loginStreak = useGameStore(s => s.loginStreak);
  const hasCheckedDailyLogin = useRef(false);

  useEffect(() => {
    if (hasCheckedDailyLogin.current) return;
    hasCheckedDailyLogin.current = true;
    const timer = setTimeout(() => {
      checkDailyLogin();
      const currentDay = ((loginStreak.currentStreak - 1) % 7) + 1;
      const todayReward = loginStreak.weeklyRewards.find(r => r.day === currentDay && !r.claimed);
      if (todayReward) {
        setDailyRewardDialogOpen(true);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [checkDailyLogin, loginStreak]);

  return { dailyRewardDialogOpen, setDailyRewardDialogOpen };
}
