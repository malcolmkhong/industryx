'use client';

import { useState } from 'react';
import type { TickFormat } from '@/lib/utils/time';

const STORAGE_KEY = 'industryx:tick-format';
const DEFAULT_FORMAT: TickFormat = 'human';

function readStoredFormat(): TickFormat {
  if (typeof window === 'undefined') return DEFAULT_FORMAT;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'human' || stored === 'ticks' ? stored : DEFAULT_FORMAT;
  } catch {
    return DEFAULT_FORMAT;
  }
}

/** Player-facing tick vs human-time toggle. Persists to localStorage. */
export function useTickFormat(): [TickFormat, (mode: TickFormat) => void] {
  const [format, setFormat] = useState<TickFormat>(readStoredFormat);

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
