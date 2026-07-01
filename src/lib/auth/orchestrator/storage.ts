/**
 * Device-id storage — Phase 1 skeleton.
 *
 * Single owner of the device-id localStorage key. Phase 1 mirrors the
 * existing getOrCreateDeviceId() semantics; later phases will add
 * fingerprint correlation and device-binding helpers.
 */

const DEVICE_ID_KEY = 'factory-dominion-device-id';

export interface DeviceIdStorage {
  get(): string | null;
  getOrCreate(): string;
  clear(): void;
}

export function createDeviceIdStorage(
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null,
): DeviceIdStorage {
  return {
    get(): string | null {
      if (!storage) return null;
      return storage.getItem(DEVICE_ID_KEY);
    },
    getOrCreate(): string {
      if (!storage) return '';
      const existing = storage.getItem(DEVICE_ID_KEY);
      if (existing) return existing;
      const next =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      storage.setItem(DEVICE_ID_KEY, next);
      return next;
    },
    clear(): void {
      storage?.removeItem(DEVICE_ID_KEY);
    },
  };
}

export const DEVICE_ID_STORAGE_KEY = DEVICE_ID_KEY;