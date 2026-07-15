import { NextResponse } from "next/server";
import { applyElapsedTicks } from "@/lib/auth/applyElapsedTicks";
import { extractValidatedSaveFields } from "@/lib/auth/gameStateValidator";
import {
  saveServerGameStateOptimistic,
  type ServerGameStateForAction,
} from "@/lib/db/game/serverGameState";
import { asFullState } from "@/lib/db/game/serverGameStatePayload";
import type { Json } from "@/lib/db/types";
import type { ServerGameData } from "@/lib/game/shared/types/types";
import type { ProductionSnapshot } from "@/lib/game/production/productionCalculator";
import { buildMarketSupplyProjection } from "@/lib/game/production/snapshot/marketSupplyProjection";
import type { ActionResponse } from "./actionTypes";
import { buildDenormalizedStatePatchFields } from "./denormalizedStatePatch";
import type { PersistResult } from "./persistenceTypes";

export async function applyElapsedServerTime(
  serverState: ServerGameStateForAction,
  userId: string,
): Promise<
  PersistResult<{
    activeServerState: ServerGameStateForAction;
    elapsedTicks: number;
    /**
     * ProductionSnapshot matched to the post-tick `activeServerState`.
     * `null` when no ticks were applied (no new authoritative snapshot).
     * Surfaced to live-tick/offline-progress endpoints so UI consumers
     * can refresh rates alongside `newState` without a separate fetch.
     *
     * Phase 13 invariant: never persisted in `full_state`; client-only.
     */
    productionSnapshot: ProductionSnapshot | null;
  }>
> {
  try {
    const rawGameSpeed = Number(serverState.game_speed);
    const allowedSpeeds = [1, 2, 5, 10] as const;
    if (!allowedSpeeds.includes(rawGameSpeed as 1 | 2 | 5 | 10)) {
      console.error(
        "[ActionAPI] Invalid game_speed in server state:",
        serverState.game_speed,
      );
      return {
        ok: false,
        response: NextResponse.json(
          {
            valid: false,
            error: "Invalid game speed in state",
            code: "INVALID_GAME_SPEED",
          } satisfies ActionResponse,
          { status: 503 },
        ),
      };
    }

    const elapsed = await applyElapsedTicks(
      (serverState.full_state as unknown as ServerGameData) ??
        ({} as ServerGameData),
      serverState.last_tick_at ?? null,
      rawGameSpeed,
      );
    const elapsedStateVersion = Number(serverState.state_version);
    if (!Number.isInteger(elapsedStateVersion) || elapsedStateVersion < 0) {
      console.error(
        "[ActionAPI] Invalid state_version for elapsed-tick persist:",
        serverState.state_version,
      );
      return {
        ok: false,
        response: NextResponse.json(
          {
            valid: false,
            error: "Server tick state invalid — retry",
            code: "INVALID_STATE_VERSION",
          } satisfies ActionResponse,
          { status: 503 },
        ),
      };
    }

    if (elapsed.elapsedTicks <= 0 && serverState.last_tick_at) {
      return { ok: true, activeServerState: serverState, elapsedTicks: 0, productionSnapshot: null };
    }

    if (elapsed.elapsedTicks <= 0) {
      // CRIT-3 fix (2026-07-14): previously this path wrote only
      // {last_tick_at, last_saved_at}. If the row had stale or null
      // denormalized columns (e.g. a row created before the Phase 12 /
      // BUG-066 fix, or a row inserted by a path that did not populate
      // them), the cursor init left those columns untouched and the next
      // hydration overlaid them as 0 / [] / {} — silently corrupting
      // economy and inventory data.
      //
      // The cursor init now also refreshes the denormalized columns from
      // the overlaid full_state (the same source the action handler uses),
      // so a stale row self-heals on its very first cursor init. This is
      // safe because:
      //   - the full_state has already been hydrated via
      //     buildCompleteFullStateForServerRow on load
      //   - the patch fields are derived from full_state (state.*) with
      //     serverState.* as fallback (finiteNumberOr / jsonArrayOr)
      //   - the CAS guard is preserved (same expectedStateVersion)
      const denormalizedFields = buildDenormalizedStatePatchFields(
        elapsed.state as unknown as Record<string, unknown>,
        serverState,
      );
      const initialized = await saveServerGameStateOptimistic(
        userId,
        elapsedStateVersion,
        {
          ...denormalizedFields,
          last_tick_at: elapsed.serverNow,
          last_saved_at: elapsed.serverNow,
        },
      ).catch((err) => {
        console.error("[ActionAPI] Failed to initialize tick cursor:", err);
        return null;
      });
      if (!initialized) {
        return {
          ok: false,
          response: NextResponse.json(
            {
              valid: false,
              error: "Server failed to initialize tick cursor — retry",
              code: "ELAPSED_TICK_PERSIST_FAILED",
            } satisfies ActionResponse,
            { status: 503 },
          ),
        };
      }

      return {
        ok: true,
        activeServerState: initialized as ServerGameStateForAction,
        elapsedTicks: 0,
        productionSnapshot: null,
      };
    }

    try {
      extractValidatedSaveFields(
        elapsed.state as unknown as Record<string, unknown>,
      );
    } catch (err) {
      console.error("[ActionAPI] elapsed.state field validation failed:", err);
      return {
        ok: false,
        response: NextResponse.json(
          {
            valid: false,
            error: "Server tick state invalid — retry",
            code: "ELAPSED_TICK_INVALID",
          } satisfies ActionResponse,
          { status: 503 },
        ),
      };
    }

    const denormalizedFields = buildDenormalizedStatePatchFields(
      elapsed.state as unknown as Record<string, unknown>,
      serverState,
    );

    const persisted = await saveServerGameStateOptimistic(
      userId,
      elapsedStateVersion,
      {
        full_state: asFullState(elapsed.state),
        // PR-BP-2 (V-032): server-only supply projection written to a
        // dedicated top-level column. `stripUIFields` does NOT touch
        // this — it lives outside `full_state` and is server-pure data,
        // not a UI key. The aggregate cron reads this column instead
        // of `full_state.productionSnapshot` (which is stripped).
        market_supply: buildMarketSupplyProjection(elapsed.productionSnapshot) as unknown as Json,
        ...denormalizedFields,
        state_version: elapsedStateVersion + 1,
        last_tick_at: elapsed.serverNow,
        last_saved_at: elapsed.serverNow,
      },
    ).catch((err) => {
      console.error("[ActionAPI] Failed to persist elapsed-tick state:", err);
      return null;
    });
    if (!persisted) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            valid: false,
            error: "Server failed to apply elapsed ticks — retry",
            code: "ELAPSED_TICK_PERSIST_FAILED",
          } satisfies ActionResponse,
          { status: 503 },
        ),
      };
    }

    return {
      ok: true,
      activeServerState: persisted as ServerGameStateForAction,
      elapsedTicks: elapsed.elapsedTicks,
      productionSnapshot: elapsed.productionSnapshot,
    };
  } catch (err) {
    console.error("[ActionAPI] applyElapsedTicks failed:", err);
    return {
      ok: false,
      response: NextResponse.json(
        {
          valid: false,
          error: "Server tick computation unavailable — retry",
          code: "ELAPSED_TICK_FAILED",
        } satisfies ActionResponse,
        { status: 503 },
      ),
    };
  }
}
