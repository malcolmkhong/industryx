'use client';

import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore, formatNumber } from '@/lib/game/store';
import { RESOURCE_META } from '@/lib/game/configCache';
import { ResourceType } from '@/lib/game/types';
import { useReducedMotion } from '@/components/game/shared/useReducedMotion';
import { GameIcon } from '@/components/game/shared/GameIcon';

interface FloatingEntry {
  id: string;
  icon: string;
  amount: number;
  xOffset: number;
}

const MAX_ENTRIES = 6;
const DISPLAY_DURATION = 1800;
const MIN_CHANGE = 0.1;

// X offsets to spread numbers across the top bar area
const X_OFFSETS = [80, 170, 260, 340, 420, 140, 220, 300];
let offsetIdx = 0;

export default function FloatingNumbers() {
  const resources = useGameStore(s => s.resources);
  const money = useGameStore(s => s.money);
  const [entries, setEntries] = useState<FloatingEntry[]>([]);
  const reducedMotion = useReducedMotion();
  const prevRef = useRef<{ resources: Record<string, number>; money: number }>({
    resources: {},
    money: 0,
  });
  const idCounter = useRef(0);
  const lastTick = useRef(0);

  useEffect(() => {
    const prev = prevRef.current;
    const resKeys = Object.keys(resources) as ResourceType[];
    const newEntries: FloatingEntry[] = [];

    // Throttle: only check every other tick to reduce spam
    const gameTick = useGameStore.getState().gameTick;
    if (gameTick - lastTick.current < 2) {
      prevRef.current = { resources: { ...resources }, money };
      return;
    }
    lastTick.current = gameTick;

    resKeys.forEach(key => {
      const current = resources[key];
      const previous = prev.resources[key] ?? 0;
      const diff = current - previous;

      if (diff >= MIN_CHANGE) {
        const meta = RESOURCE_META[key];
        newEntries.push({
          id: `fn-${idCounter.current++}`,
          icon: meta?.icon ?? 'gi:cardboard-box',
          amount: diff,
          xOffset: X_OFFSETS[offsetIdx % X_OFFSETS.length],
        });
        offsetIdx++;
      }
    });

    // Check money
    const moneyDiff = money - prev.money;
    if (moneyDiff >= 1) {
      newEntries.push({
        id: `fn-money-${idCounter.current++}`,
        icon: 'gi:money-stack',
        amount: moneyDiff,
        xOffset: X_OFFSETS[offsetIdx % X_OFFSETS.length],
      });
      offsetIdx++;
    }

    if (newEntries.length > 0) {
      // Limit to top 3 per update to avoid visual clutter
      const limited = newEntries.slice(0, 3);

      setEntries(prev => {
        const combined = [...prev, ...limited];
        return combined.slice(-MAX_ENTRIES);
      });

      // Auto-remove each entry after display
      limited.forEach(entry => {
        setTimeout(() => {
          setEntries(prev => prev.filter(e => e.id !== entry.id));
        }, DISPLAY_DURATION);
      });
    }

    prevRef.current = { resources: { ...resources }, money };
  }, [resources, money]);

  return (
    <div className="fixed top-12 left-16 z-[90] pointer-events-none" style={{ width: '480px', height: '40px' }}>
      <AnimatePresence>
        {entries.map(entry => (
          <motion.div
            key={entry.id}
            initial={reducedMotion ? { opacity: 0.9 } : { opacity: 0.95, y: 4, scale: 0.85 }}
            animate={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -28, scale: 1.05 }}
            exit={{ opacity: 0 }}
            transition={reducedMotion ? { duration: 0.3 } : { duration: 1.5, ease: 'easeOut' }}
            className="floating-number absolute text-xs font-mono font-bold whitespace-nowrap"
            style={{ left: entry.xOffset }}
          >
            <span className="text-green-400 drop-shadow-[0_0_4px_rgba(57,255,20,0.5)]">
              +{formatNumber(entry.amount)}
            </span>
            <span className="ml-0.5"><GameIcon icon={entry.icon} size={12} className="inline-flex" /></span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
