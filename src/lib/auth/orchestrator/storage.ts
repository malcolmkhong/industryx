/**
 * Device-id storage.
 *
 * Single owner of the persistent deviceId localStorage key. The deviceId is
 * the browser-installation anchor for guest resolution only; it is not proof
 * of authenticated account ownership.
 */

const DEVICE_ID_KEY = "factory-dominion-device-id";

/**
 * Legacy keys from earlier dev cycles. Cleared on every getOrCreate() so
 * they do not accumulate forever. New keys should be added here only when
 * the migration window closes and no callers remain.
 */
const LEGACY_KEYS: ReadonlyArray<string> = [
  "factory-dominion-device-id-v2",
  "factory-dominion-fp-cache",
  "factory-dominion-recovery-hint",
];

export interface DeviceIdStorage {
  get(): string | null;
  getOrCreate(): string;
  clear(): void;
}

export function createDeviceIdStorage(
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null,
): DeviceIdStorage {
  return {
    get(): string | null {
      if (!storage) return null;
      try {
        return storage.getItem(DEVICE_ID_KEY);
      } catch {
        return null;
      }
    },
    getOrCreate(): string {
      if (!storage) return "";

      for (const key of LEGACY_KEYS) {
        try {
          storage.removeItem(key);
        } catch {
          // Best effort only; storage can be restricted by the browser.
        }
      }

      let existing: string | null;
      try {
        existing = storage.getItem(DEVICE_ID_KEY);
      } catch {
        return "";
      }
      if (existing) return existing;

      if (typeof crypto === "undefined" || !("randomUUID" in crypto)) {
        return "";
      }

      const next = crypto.randomUUID();
      try {
        storage.setItem(DEVICE_ID_KEY, next);
      } catch {
        return "";
      }
      return next;
    },
    clear(): void {
      try {
        storage?.removeItem(DEVICE_ID_KEY);
      } catch {
        // Best effort only; storage can be restricted by the browser.
      }
    },
  };
}

export const DEVICE_ID_STORAGE_KEY = DEVICE_ID_KEY;
