import { RESEARCH_TREE } from "../../../config/configCache";
import { generateId } from "../../../shared/utils/generateId";
import { soundEngine } from "../../../audio/soundEngine";
import type { SetFn, GetFn } from "../_actionTypes";
import { friendlyResearchError } from "./friendlyResearchError";

export function createResearchActions(set: SetFn, get: GetFn) {
  return {
    startResearch: async (id: string) => {
      // Phase 6: server-authoritative research start. Server validates
      // existence, prereqs, completion, and RP cost, then returns the
      // authoritative post-start state. Client applies exactly what the
      // server says — no local cost computation.
      const validation = await import("../../../actions/client/actionValidator").then((m) =>
        m.validateActionWithServer(
          "research",
          { researchId: id },
          generateId(),
        ),
      );
      if (!validation.approved) {
        soundEngine.play("error", "ui");
        // Log technical error for debugging; show friendly message to user
        console.error(`[startResearch] server rejected: ${validation.error}`);
        get().addNotification("error", friendlyResearchError(validation.error));
        return;
      }

      const corrected = validation.correctedState;
      const node = RESEARCH_TREE.find((r) => r.id === id);
      if (
        typeof corrected?.researchPoints !== "number" ||
        typeof corrected?.activeResearch !== "string" ||
        typeof corrected?.researchProgress !== "number"
      ) {
        soundEngine.play("error", "ui");
        get().addNotification(
          "error",
          "Research could not be confirmed by server. Please retry.",
        );
        return;
      }

      set({
        researchPoints: corrected.researchPoints,
        activeResearch: corrected.activeResearch,
        researchProgress: corrected.researchProgress,
      });
      soundEngine.play("buttonClick", "ui");
      const nodeName = node?.name ?? id;
      get().addNotification("info", `Started research: ${nodeName}`);
      get().updateQuestProgress("research", 1);
    },

    /**
     * Server-authoritative research cancel.
     *
     * The validator already rejects stale `researchId` payloads that
     * don't match the current `state.activeResearch`, so the client
     * never needs to second-guess the request — it just sends the id
     * and applies whatever the server returns.
     */
    cancelResearch: async (id: string) => {
      const validation = await import("../../../actions/client/actionValidator").then((m) =>
        m.validateActionWithServer(
          "cancel_research",
          { researchId: id, refundFraction: 1 },
          generateId(),
        ),
      );
      if (!validation.approved) {
        soundEngine.play("error", "ui");
        console.error(`[cancelResearch] server rejected: ${validation.error}`);
        get().addNotification(
          "error",
          friendlyResearchError(validation.error),
        );
        return;
      }
      const corrected = validation.correctedState;
      if (
        typeof corrected?.researchPoints !== "number" ||
        corrected?.activeResearch !== null
      ) {
        soundEngine.play("error", "ui");
        get().addNotification(
          "error",
          "Research cancel could not be confirmed by server. Please retry.",
        );
        return;
      }
      set({
        researchPoints: corrected.researchPoints,
        activeResearch: null,
        researchProgress: 0,
      });
      soundEngine.play("buttonClick", "ui");
      const node = RESEARCH_TREE.find((r) => r.id === id);
      const nodeName = node?.name ?? id;
      get().addNotification("info", `Canceled research: ${nodeName}`);
    },

    /**
     * Queue a research id for future activation. Server-authoritative.
     *
     * Validator + mutator guarantee:
     *   - queue not full
     *   - id not active / queued / completed
     *   - prereq chain satisfied by completedResearch or earlier-queued items
     *   - RP cost deducted server-side
     *
     * The "removeFromResearchQueue" path is the symmetric refund and
     * keeps RP economy clean.
     */
    addToResearchQueue: async (id: string) => {
      const validation = await import("../../../actions/client/actionValidator").then((m) =>
        m.validateActionWithServer(
          "add_research_to_queue",
          { researchId: id },
          generateId(),
        ),
      );
      if (!validation.approved) {
        soundEngine.play("error", "ui");
        console.error(
          `[addToResearchQueue] server rejected: ${validation.error}`,
        );
        get().addNotification(
          "error",
          friendlyResearchError(validation.error),
        );
        return;
      }
      const corrected = validation.correctedState;
      if (
        typeof corrected?.researchPoints !== "number" ||
        !Array.isArray(corrected?.researchQueue)
      ) {
        soundEngine.play("error", "ui");
        get().addNotification(
          "error",
          "Queue add could not be confirmed by server. Please retry.",
        );
        return;
      }
      set({
        researchPoints: corrected.researchPoints,
        researchQueue: corrected.researchQueue,
      });
      soundEngine.play("buttonClick", "ui");
      const node = RESEARCH_TREE.find((r) => r.id === id);
      const nodeName = node?.name ?? id;
      get().addNotification("info", `Queued research: ${nodeName}`);
    },

    /** Server-authoritative queue removal. Refunds the pre-paid RP cost. */
    removeFromResearchQueue: async (id: string) => {
      const validation = await import("../../../actions/client/actionValidator").then((m) =>
        m.validateActionWithServer(
          "remove_research_from_queue",
          { researchId: id },
          generateId(),
        ),
      );
      if (!validation.approved) {
        soundEngine.play("error", "ui");
        console.error(
          `[removeFromResearchQueue] server rejected: ${validation.error}`,
        );
        get().addNotification(
          "error",
          friendlyResearchError(validation.error),
        );
        return;
      }
      const corrected = validation.correctedState;
      if (
        typeof corrected?.researchPoints !== "number" ||
        !Array.isArray(corrected?.researchQueue)
      ) {
        soundEngine.play("error", "ui");
        get().addNotification(
          "error",
          "Queue remove could not be confirmed by server. Please retry.",
        );
        return;
      }
      set({
        researchPoints: corrected.researchPoints,
        researchQueue: corrected.researchQueue,
      });
      soundEngine.play("buttonClick", "ui");
      const node = RESEARCH_TREE.find((r) => r.id === id);
      const nodeName = node?.name ?? id;
      get().addNotification("info", `Removed from queue: ${nodeName}`);
    },
  };
}