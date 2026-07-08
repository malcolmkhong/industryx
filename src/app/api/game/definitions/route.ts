// ============================================
// FACTORY DOMINION: Game Definitions API
// Returns processed game config from Supabase
// with 5-minute in-memory cache
// ============================================
//
// Architecture note:
// After the data.ts → Supabase refactor, this route is a thin wrapper
// around `fetchGameConfigFromSupabase()` (in src/lib/db/serverConfigFetcher.ts),
// which is also used by the server-side configLoader (configLoader.server.ts)
// so we have ONE place that maintains the SQL surface area.

import { NextResponse } from "next/server";
import { GameConfig } from "@/lib/game/config";
import { fetchGameConfigFromSupabase } from "@/lib/db/serverConfigFetcher";

// ─── In-Memory Cache ────────────────────────────────────────────────────

interface CachedDefinitions {
  data: GameConfig & { idMigrationMap: Record<string, string | string[]> };
  fetchedAt: number;
}

let cachedDefinitions: CachedDefinitions | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ─── Main GET Handler ───────────────────────────────────────────────────

export async function GET() {
  try {
    // Return cached data if still fresh. The server-side cache is the source
    // of truth for hot loops; CDN cache is an additional layer.
    if (
      cachedDefinitions &&
      Date.now() - cachedDefinitions.fetchedAt < CACHE_TTL_MS
    ) {
      return NextResponse.json(cachedDefinitions.data, {
        headers: {
          // Browser cache for 60s, Vercel/CDN edge for 5min, allow stale for 1h
          // while a single edge node re-fetches in the background.
          "Cache-Control":
            "private, max-age=60, s-maxage=300, stale-while-revalidate=3600",
        },
      });
    }

    const result = await fetchGameConfigFromSupabase();

    if (!result.config) {
      return NextResponse.json(
        {
          error:
            result.partialErrors.join("; ") ||
            "Critical game config failed to load",
          partialErrors: result.partialErrors,
          buildings: {},
          resources: {},
          research: [],
          market: [],
          weather: {},
          workers: [],
          transport: [],
          automation: [],
          prestigeBonuses: [],
          rankThresholds: [],
          quests: [],
          dailyRewards: [],
          eventTemplates: [],
          seasonalEvents: [],
          megaProjects: [],
          gameConfig: {},
          tradableResourceIds: [],
          productionChains: [],
          idMigrationMap: result.idMigrationMap,
          loadedAt: Date.now(),
          source: "fallback",
        } as GameConfig & {
          idMigrationMap: Record<string, string | string[]>;
          partialErrors: string[];
        },
        { status: 503 },
      );
    }

    // Tag the response with idMigrationMap (route-only concern).
    const payload = {
      ...result.config,
      idMigrationMap: result.idMigrationMap,
    } as GameConfig & { idMigrationMap: Record<string, string | string[]> };

    // Non-critical tables failed — surface partial-errors in payload.
    if (result.partialErrors.length > 0) {
      return NextResponse.json({
        ...payload,
        partialErrors: result.partialErrors,
      });
    }

    // Cache the result
    cachedDefinitions = {
      data: payload,
      fetchedAt: Date.now(),
    };

    return NextResponse.json(payload);
  } catch (error) {
    console.error("[/api/game/definitions] Unhandled error:", error);
    // Clear potentially corrupted cache on error
    cachedDefinitions = null;
    return NextResponse.json(
      { error: "Internal server error — game definitions unavailable" },
      { status: 500 },
    );
  }
}

// Match the 5-minute in-memory TTL with the framework cache so
// Edge nodes don't bypass our explicit Cache-Control header.
export const revalidate = 300;
