import type { GameConfig } from "@/lib/game/config/config";

let cachedConfig: GameConfig | null = null;
let configFetchedAt = 0;
const CONFIG_CACHE_TTL_MS = 5 * 60 * 1000;

export function rememberConfig(
  config: GameConfig,
  fetchedAt: number,
): GameConfig {
  cachedConfig = config;
  configFetchedAt = fetchedAt;
  return config;
}

export function isConfigCacheFresh(now: number = Date.now()): boolean {
  return (
    cachedConfig !== null && now - configFetchedAt < CONFIG_CACHE_TTL_MS
  );
}

export function getCachedConfig(): GameConfig | null {
  return cachedConfig;
}