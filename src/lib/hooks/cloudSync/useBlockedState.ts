'use client';

import { useState } from 'react';
import type { CloudBlockState } from './types';

/**
 * Manages the blocked state for cloud sync.
 * Blocked state is set when the server rejects a save/load due to
 * auth errors, validation failures, or account locks.
 */
export function useBlockedState() {
  const [blockedState, setBlockedState] = useState<CloudBlockState | null>(null);

  return { blockedState, setBlockedState };
}
