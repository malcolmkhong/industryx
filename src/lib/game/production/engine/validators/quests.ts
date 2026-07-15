// Server-authoritative quest validators (collect payout + claim quest).

import {
  applyCollectPayoutMutation,
  applyClaimQuestMutation,
} from "../mutators/quests";
import type { ServerGameData } from "../../../shared/types/types";

export function validateCollectPayoutAction(state: Partial<ServerGameData>): {
  valid: boolean;
  error?: string;
  correctedState?: Partial<ServerGameData>;
} {
  const pendingPayout = state.pendingPayout ?? 0;
  if (!Number.isFinite(pendingPayout) || pendingPayout <= 0) {
    return {
      valid: false,
      error: "No pending payout to collect",
    };
  }

  return {
    valid: true,
    correctedState: applyCollectPayoutMutation(undefined, state),
  };
}

export function validateClaimQuestAction(
  questId: string,
  state: Partial<ServerGameData>,
): {
  valid: boolean;
  error?: string;
  correctedState?: Partial<ServerGameData>;
} {
  if (!questId || typeof questId !== "string") {
    return { valid: false, error: "Missing questId in payload" };
  }

  const quests = state.quests ?? [];
  const questIdx = quests.findIndex((q) => q.id === questId);
  if (questIdx < 0) {
    return {
      valid: false,
      error: `Quest "${questId}" not found`,
    };
  }
  const quest = quests[questIdx];

  if (!quest.completed) {
    return {
      valid: false,
      error: `Quest "${questId}" is not yet completed`,
    };
  }
  if (quest.claimed) {
    return {
      valid: false,
      error: `Quest "${questId}" reward already claimed`,
    };
  }

  const reward = quest.reward;
  if (!reward || typeof reward.money !== "number" || reward.money < 0) {
    return {
      valid: false,
      error: `Quest "${questId}" has invalid reward configuration`,
    };
  }

  return {
    valid: true,
    correctedState: applyClaimQuestMutation({ questIdx }, state),
  };
}