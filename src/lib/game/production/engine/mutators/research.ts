// Server-authoritative research start mutation.
//
// Assumes validator verified: researchId is valid, prerequisites met, no
// in-progress research, RP cost is affordable. Mutator deducts RP and sets
// activeResearch + resets progress to 0.

import type { ServerGameData } from "../../../shared/types/types";

export interface ResearchMutationInput {
  researchId: string;
  cost: number;
}

export function applyResearchMutation(
  input: ResearchMutationInput,
  state: Partial<ServerGameData>,
): Partial<ServerGameData> {
  const { researchId, cost } = input;
  const researchPoints = state.researchPoints ?? 0;

  return {
    researchPoints: researchPoints - cost,
    activeResearch: researchId,
    researchProgress: 0,
  };
}

/**
 * Server-authoritative cancel-research mutation.
 *
 * Assumes validator verified:
 *   - `researchId === state.activeResearch`
 *   - `researchId` is not already in `completedResearch`
 *   - `refundFraction ∈ [0, 1]` (defaults to 1 = 100% refund)
 *
 * Resets `activeResearch` to null and rolls `researchProgress` back to
 * 0, then restores the chosen fraction of the original cost to
 * `researchPoints`. The exact original cost must be passed in (the
 * validator is responsible for looking it up from `config.research`).
 */
export interface CancelResearchMutationInput {
  researchId: string;
  cost: number;
  refundFraction: number;
}

export function applyCancelResearchMutation(
  input: CancelResearchMutationInput,
  state: Partial<ServerGameData>,
): Partial<ServerGameData> {
  const { cost, refundFraction } = input;
  const researchPoints = state.researchPoints ?? 0;
  const refund = Math.max(0, Math.round(cost * refundFraction * 100) / 100);

  return {
    researchPoints: researchPoints + refund,
    activeResearch: null,
    researchProgress: 0,
  };
}

/**
 * Add a research id to the back of `state.researchQueue`.
 *
 * Validator guarantees:
 *   - queue length < RESEARCH_QUEUE_MAX before insertion
 *   - id is not the active research and not already queued or completed
 *   - cost is finite ≥ 0 and ≤ player RP
 *   - prereq chain is satisfied via completedResearch + earlier-queued
 *     items (monotonic queue ordering)
 *
 * Deducts RP cost up-front (symmetric with the startResearch flow).
 * Refund on remove uses applyRemoveResearchFromQueueMutation with the
 * same cost, so the two always net to 0 RP on cancel-after-queue.
 */
export interface AddResearchToQueueMutationInput {
  researchId: string;
  cost: number;
}

export function applyAddResearchToQueueMutation(
  input: AddResearchToQueueMutationInput,
  state: Partial<ServerGameData>,
): Partial<ServerGameData> {
  const { researchId, cost } = input;
  const researchPoints = state.researchPoints ?? 0;
  const queue = state.researchQueue ?? [];

  return {
    researchPoints: researchPoints - cost,
    researchQueue: [...queue, researchId],
  };
}

/**
 * Remove a research id from `state.researchQueue`. Refunds the full
 * pre-paid RP cost so queue-add + queue-remove is a clean no-op on RP.
 *
 * Validator guarantees the id is present in `state.researchQueue` and
 * that the cost matches what was originally deducted (lookup comes
 * from `config.research` server-side, never the client payload).
 */
export interface RemoveResearchFromQueueMutationInput {
  researchId: string;
  cost: number;
}

export function applyRemoveResearchFromQueueMutation(
  input: RemoveResearchFromQueueMutationInput,
  state: Partial<ServerGameData>,
): Partial<ServerGameData> {
  const { researchId, cost } = input;
  const researchPoints = state.researchPoints ?? 0;
  const queue = state.researchQueue ?? [];

  return {
    researchPoints: researchPoints + cost,
    researchQueue: queue.filter((id) => id !== researchId),
  };
}