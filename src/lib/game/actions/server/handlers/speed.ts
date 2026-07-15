import { saveServerGameStateOptimistic } from "@/lib/db/game/serverGameState";
import type { ActionResponse } from "../shared/actionTypes";

const ALLOWED_GAME_SPEEDS: readonly number[] = [1, 2, 5, 10];

export async function handleSetGameSpeed(
  payload: Record<string, unknown>,
  serverState: { state_version: number },
  userId: string,
): Promise<ActionResponse> {
  const speed = payload.speed as number;

  if (typeof speed !== "number" || !ALLOWED_GAME_SPEEDS.includes(speed)) {
    return {
      valid: false,
      error: `Invalid game speed: ${speed}. Allowed: ${ALLOWED_GAME_SPEEDS.join(", ")}`,
    };
  }

  const currentVersion = Number(serverState.state_version);
  if (!Number.isInteger(currentVersion) || currentVersion < 0) {
    console.error(
      "[ActionAPI] Invalid state_version for set_game_speed:",
      serverState.state_version,
    );
    return {
      valid: false,
      error: "Invalid server state version",
    };
  }
  // V-020 (PR-BP-3): await CAS. The previous fire-and-forget pattern
  // detached the persist failure from the response, so an optimistic
  // version bump would silently no-op and the next read would re-apply
  // the same patch on the OLD version, double-applying any future
  // tick. We now await the CAS, surface a typed failure, and return
  // 503 if the optimistic lock did not match.
  let persisted: unknown;
  try {
    persisted = await saveServerGameStateOptimistic(userId, currentVersion, {
      game_speed: speed,
      state_version: currentVersion + 1,
    });
  } catch (err) {
    console.error("[ActionAPI] Failed to persist game_speed:", err);
    return {
      valid: false,
      error: "Server failed to persist game speed — retry",
    };
  }
  if (!persisted) {
    // The CAS lost — return a typed retry signal so the client knows
    // to refetch state and try again rather than treat this as success.
    return {
      valid: false,
      error: "Game speed CAS lost — refetch and retry",
    };
  }

  return { valid: true };
}