// ============================================
// Debounced PersistStorage for Zustand v5 persist
// ============================================
// Wraps raw localStorage with JSON serialization AND debounced writes to
// reduce I/O frequency. Prevents data loss on frequent store updates.

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
const DEBOUNCE_MS = 5000;

interface PendingWrite {
  name: string;
  value: string; // JSON-serialized string
}
let pendingWrite: PendingWrite | null = null;

function flushPendingWrite(): void {
  if (pendingWrite) {
    try {
      localStorage.setItem(pendingWrite.name, pendingWrite.value);
    } catch {
      // localStorage full or unavailable — non-critical
    }
    pendingWrite = null;
  }
  debounceTimer = null;
}

/**
 * Zustand v5 PersistStorage compatible wrapper with debounced writes.
 *
 * - getItem: reads from localStorage and parses JSON (same as createJSONStorage)
 * - setItem: serializes to JSON, then debounces the actual localStorage write
 * - removeItem: immediately removes from localStorage
 *
 * This fixes the critical bug where passing raw objects to the old Storage-based
 * debouncedStorage caused `localStorage.setItem(name, object)` → "[object Object]"
 * which made every page refresh lose all game state.
 */
const debouncedPersistStorage = {
  getItem: (name: string) => {
    if (typeof window === 'undefined') return null;
    try {
      const str = localStorage.getItem(name);
      if (str === null) return null;
      return JSON.parse(str);
    } catch {
      // Corrupted or unreadable data — treat as no saved state
      return null;
    }
  },
  setItem: (name: string, value: unknown) => {
    // Serialize to JSON immediately (captures current state snapshot)
    const serialized = JSON.stringify(value);
    pendingWrite = { name, value: serialized };
    if (!debounceTimer) {
      debounceTimer = setTimeout(flushPendingWrite, DEBOUNCE_MS);
    }
  },
  removeItem: (name: string) => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    pendingWrite = null;
    if (typeof window !== 'undefined') {
      try { localStorage.removeItem(name); } catch { /* noop */ }
    }
  },
};

// Force-save on page unload to prevent data loss
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    flushPendingWrite();
  });
}

export default debouncedPersistStorage;
