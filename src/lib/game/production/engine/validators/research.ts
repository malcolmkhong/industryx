// Server-authoritative research start validator.

import {
  applyAddResearchToQueueMutation,
  applyCancelResearchMutation,
  applyRemoveResearchFromQueueMutation,
  applyResearchMutation,
} from "../mutators/research";
import type { GameConfig } from "../../../config/config";
import type { ServerGameData } from "../../../shared/types/types";

export function validateResearchAction(
  researchId: string,
  state: Partial<ServerGameData>,
  config: GameConfig,
): {
  valid: boolean;
  error?: string;
  correctedState?: Partial<ServerGameData>;
} {
  if (!researchId || typeof researchId !== "string") {
    return { valid: false, error: "Missing researchId in payload" };
  }

  const researchDef = config.research.find((r) => r.id === researchId);
  if (!researchDef) {
    return {
      valid: false,
      error: `Research "${researchId}" not found in game config`,
    };
  }

  const completedResearch = state.completedResearch ?? [];
  for (const prereq of researchDef.prerequisites) {
    if (!completedResearch.includes(prereq)) {
      return {
        valid: false,
        error: `Prerequisite research "${prereq}" not completed`,
      };
    }
  }

  if (completedResearch.includes(researchId)) {
    return {
      valid: false,
      error: `Research "${researchId}" already completed`,
    };
  }

  if (state.activeResearch) {
    return {
      valid: false,
      error: `Research already in progress ("${state.activeResearch}"). Finish or cancel it first.`,
    };
  }

  const cost = researchDef.cost;
  if (!Number.isFinite(cost) || cost < 0) {
    return {
      valid: false,
      error: `Research "${researchId}" has invalid cost (${cost})`,
    };
  }
  const researchPoints = state.researchPoints ?? 0;
  if (researchPoints < cost) {
    return {
      valid: false,
      error: `Not enough research points. Need ${researchDef.cost}, have ${Math.floor(researchPoints)}`,
    };
  }

  return {
    valid: true,
    correctedState: applyResearchMutation({ researchId, cost }, state),
  };
}

/**
 * Validate a cancel-research request.
 *
 * Rules (mirrors the validator + mutator shape used by startResearch):
 *   - activeResearch must be set and not null
 *   - the requested researchId must match the currently-active research
 *     (guards against stale payloads left over from a tab refresh)
 *   - No claim on a research that has already been claimed or moved to
 *     completedResearch
 *
 * Refund: callers can refund any percentage (defaults to 100%) of the
 * original cost. Production prefers 100% — the SP-rejection cost is
 * already deducted and we don't want partial refunds to leave the
 * economy in an indeterminate state. Future tuning (e.g. scaling refund
 * by progress made) belongs here, not in the client.
 */
export function validateCancelResearchAction(
  researchId: string,
  state: Partial<ServerGameData>,
  config: GameConfig,
  refundFraction: number = 1,
): {
  valid: boolean;
  error?: string;
  correctedState?: Partial<ServerGameData>;
} {
  if (!researchId || typeof researchId !== "string") {
    return { valid: false, error: "Missing researchId in payload" };
  }
  const active = state.activeResearch;
  if (!active) {
    return { valid: false, error: "No active research to cancel" };
  }
  if (active !== researchId) {
    return {
      valid: false,
      error: `Active research is "${active}", not "${researchId}"`,
    };
  }
  const completedResearch = state.completedResearch ?? [];
  if (completedResearch.includes(researchId)) {
    return {
      valid: false,
      error: `Research "${researchId}" already completed`,
    };
  }
  if (
    !Number.isFinite(refundFraction) ||
    refundFraction < 0 ||
    refundFraction > 1
  ) {
    return { valid: false, error: `Invalid refund fraction ${refundFraction}` };
  }
  // Authoritative cost lookup — never trust client-supplied cost. The
  // validator already guarantees `researchId === state.activeResearch`,
  // so we read cost from the same lookup path as validateResearchAction.
  const researchDef = (config.research ?? []).find((r) => r.id === researchId);
  if (!researchDef) {
    return {
      valid: false,
      error: `Research "${researchId}" not found in game config`,
    };
  }
  return {
    valid: true,
    correctedState: applyCancelResearchMutation(
      { researchId, cost: researchDef.cost, refundFraction },
      state,
    ),
  };
}

/**
 * Maximum research-queue length. Held as a module constant so balance
 * changes live with the validator, not scattered through callers.
 * When this limit needs to be runtime-configurable, lift it onto
 * `app_config` and read here.
 */
export const RESEARCH_QUEUE_MAX = 5;

/**
 * Validate add-to-queue. Server-authoritative: cost is looked up from
 * `config.research` rather than trusting the client payload.
 *
 * Prereq rule (monotonic):
 *   Each prerequisite of the candidate must be in `completedResearch`
 *   OR appear earlier in the *current* `researchQueue`. This allows
 *   "queue A then queue B with A as prereq" without requiring the
 *   player to start A first.
 */
export function validateAddResearchToQueueAction(
  researchId: string,
  state: Partial<ServerGameData>,
  config: GameConfig,
): {
  valid: boolean;
  error?: string;
  correctedState?: Partial<ServerGameData>;
} {
  if (!researchId || typeof researchId !== "string") {
    return { valid: false, error: "Missing researchId in payload" };
  }
  const researchDef = (config.research ?? []).find((r) => r.id === researchId);
  if (!researchDef) {
    return {
      valid: false,
      error: `Research "${researchId}" not found in game config`,
    };
  }
  const cost = researchDef.cost;
  if (!Number.isFinite(cost) || cost < 0) {
    return {
      valid: false,
      error: `Research "${researchId}" has invalid cost (${cost})`,
    };
  }
  if (state.activeResearch === researchId) {
    return {
      valid: false,
      error: `Research "${researchId}" is already active`,
    };
  }
  const completedResearch = state.completedResearch ?? [];
  if (completedResearch.includes(researchId)) {
    return {
      valid: false,
      error: `Research "${researchId}" already completed`,
    };
  }
  const queue = state.researchQueue ?? [];
  if (queue.includes(researchId)) {
    return {
      valid: false,
      error: `Research "${researchId}" already in queue`,
    };
  }
  if (queue.length >= RESEARCH_QUEUE_MAX) {
    return {
      valid: false,
      error: `Research queue is full (max ${RESEARCH_QUEUE_MAX})`,
    };
  }
  // Monotonic prereq walk: a prereq is satisfied by completedResearch or
  // any queued item earlier in the list.
  for (const prereq of researchDef.prerequisites) {
    if (completedResearch.includes(prereq)) continue;
    if (queue.includes(prereq)) continue;
    return {
      valid: false,
      error: `Prerequisite research "${prereq}" not completed`,
    };
  }
  const researchPoints = state.researchPoints ?? 0;
  if (researchPoints < cost) {
    return {
      valid: false,
      error: `Not enough research points. Need ${cost}, have ${Math.floor(researchPoints)}`,
    };
  }
  return {
    valid: true,
    correctedState: applyAddResearchToQueueMutation(
      { researchId, cost },
      state,
    ),
  };
}

/**
 * Validate remove-from-queue. Refunds the original cost so
 * queue-add + queue-remove is a clean no-op on RP.
 */
export function validateRemoveResearchFromQueueAction(
  researchId: string,
  state: Partial<ServerGameData>,
  config: GameConfig,
): {
  valid: boolean;
  error?: string;
  correctedState?: Partial<ServerGameData>;
} {
  if (!researchId || typeof researchId !== "string") {
    return { valid: false, error: "Missing researchId in payload" };
  }
  const queue = state.researchQueue ?? [];
  if (!queue.includes(researchId)) {
    return {
      valid: false,
      error: `Research "${researchId}" not in queue`,
    };
  }
  // Cost lookup is server-authoritative. If the id is in the queue
  // but no longer exists in config (e.g. config drift), refund 0 and
  // still allow removal — the entry is invalid either way.
  const researchDef = (config.research ?? []).find((r) => r.id === researchId);
  const cost = researchDef?.cost ?? 0;
  return {
    valid: true,
    correctedState: applyRemoveResearchFromQueueMutation(
      { researchId, cost },
      state,
    ),
  };
}