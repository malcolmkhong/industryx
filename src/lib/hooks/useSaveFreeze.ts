// Phase 1.8: Save freeze during pending merge
// Prevents cloud saves and offline progress claims while a merge is pending.

'use client';

import { useState, useEffect } from 'react';

const FREEZE_KEY = 'factory-dominion-save-freeze';
const FREEZE_REASON_KEY = 'factory-dominion-save-freeze-reason';

function readFreezeFromStorage(): { frozen: boolean; reason: string | null } {
  if (typeof window === 'undefined') return { frozen: false, reason: null };
  try {
    const frozen = localStorage.getItem(FREEZE_KEY) === 'true';
    const reason = localStorage.getItem(FREEZE_REASON_KEY);
    return { frozen, reason };
  } catch {
    return { frozen: false, reason: null };
  }
}

function writeFreezeToStorage(frozen: boolean, reason: string | null = null): void {
  if (typeof window === 'undefined') return;
  try {
    if (frozen) {
      localStorage.setItem(FREEZE_KEY, 'true');
      if (reason) localStorage.setItem(FREEZE_REASON_KEY, reason);
    } else {
      localStorage.removeItem(FREEZE_KEY);
      localStorage.removeItem(FREEZE_REASON_KEY);
    }
  } catch {
  }
}

function emitFreezeEvent(frozen: boolean, reason: string | null): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('save-freeze-change', {
      detail: { frozen, reason },
    })
  );
}

export function useSaveFreeze() {
  const [isFrozen, setIsFrozen] = useState<boolean>(false);
  const [reason, setReason] = useState<string | null>(null);

  useEffect(() => {
    const { frozen, reason } = readFreezeFromStorage();
    setIsFrozen(frozen);
    setReason(reason);

    const onStorage = (e: StorageEvent) => {
      if (e.key === FREEZE_KEY || e.key === FREEZE_REASON_KEY) {
        const next = readFreezeFromStorage();
        setIsFrozen(next.frozen);
        setReason(next.reason);
      }
    };
    const onCustom = (e: Event) => {
      const detail = (e as CustomEvent).detail as { frozen: boolean; reason: string | null };
      setIsFrozen(detail.frozen);
      setReason(detail.reason);
    };

    window.addEventListener('storage', onStorage);
    window.addEventListener('save-freeze-change', onCustom as EventListener);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('save-freeze-change', onCustom as EventListener);
    };
  }, []);

  return { isFrozen, reason };
}

export function freezeSaves(reason: string = 'merge_in_progress'): void {
  writeFreezeToStorage(true, reason);
  emitFreezeEvent(true, reason);
}

export function unfreezeSaves(): void {
  writeFreezeToStorage(false, null);
  emitFreezeEvent(false, null);
}
