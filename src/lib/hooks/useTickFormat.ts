'use client';

import { useEffect, useState } from 'react';
import type { TickFormat } from '@/lib/utils/time';

const STORAGE_KEY = 'industryx:tick-format';
const DEFAULT_FORMAT: TickFormat = 'human';

/** Player-facing tick vs human-time toggle. Persists to localStorage. */
export function useTickFormat(): [TickFormat, (mode: TickFormat) => void] {
  const [format, setFormat] = useState<TickFormat>(DEFAULT_FORMAT);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'human' || stored === 'ticks') {
        setFormat(stored);
      }
    } catch {
      // localStorage unavailable; keep default
    }
  }, []);

  const update = (mode: TickFormat) => {
    setFormat(mode);
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // ignore
    }
  };

  return [format, update];
}
