import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '@/lib/game/store';

// Pulses a moneyGlow flag for 1s when money increases by more than 10 units,
// used by the header money badge for a visual cue.
export function useMoneyGlowEffect(): {
  moneyGlow: boolean;
} {
  const money = useGameStore(s => s.money);
  const [moneyGlow, setMoneyGlow] = useState(false);
  const prevMoneyRef = useRef(money);

  useEffect(() => {
    if (money > prevMoneyRef.current + 10) {
      const t1 = setTimeout(() => setMoneyGlow(true), 0);
      const t2 = setTimeout(() => setMoneyGlow(false), 1000);
      prevMoneyRef.current = money;
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
    prevMoneyRef.current = money;
  }, [money]);

  return { moneyGlow };
}
