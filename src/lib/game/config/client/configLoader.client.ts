import { type GameConfig } from "../types/gameConfig";

/**
 * Legacy client-side config loader. The admin `/api/admin/config` endpoint
 * is admin-only (returns 401 for guests) and the previous query-string form
 * `/api/admin/config?table=...` 404'd because the route is path-based
 * (`/api/admin/config/[table]`). The canonical client entry point is now
 * `/api/game/config/definitions`, which the GameConfigProvider already uses.
 *
 * This shim delegates to that endpoint so any legacy caller continues to work
 * without triggering 401/404 noise in the network panel.
 */
export async function fetchGameConfig(): Promise<GameConfig | null> {
  try {
    const res = await fetch("/api/game/config/definitions", {
      // Definitions endpoint is the canonical public loader.
      cache: "no-store",
    });
    if (!res.ok) {
      return null;
    }
    const data = (await res.json()) as GameConfig;
    if (!data.buildings || Object.keys(data.buildings).length === 0) {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}
