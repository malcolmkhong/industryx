import type { GameNotification } from "../types";
import { RESEARCH_TREE } from "../configCache";
import { generateId } from "../utils/generateId";
import { formatNumber } from "../utils/formatNumber";
import { isResearchUnlocked } from "../utils/costCalculator";
import { soundEngine } from "../soundEngine";
import type { SetFn, GetFn } from "./_actionTypes";

// Inline: translate server technical error → user-friendly text.
function friendlyResearchError(serverError: string | undefined): string {
  const e = serverError ?? "";
  if (e.includes("not found in game config"))
    return "That research is not available yet.";
  if (e.includes("Prerequisite research") && e.includes("not completed"))
    return "Prerequisite research not completed.";
  if (e.includes("already completed")) return "Already researched.";
  if (e.includes("already in progress")) return "Research already in progress.";
  if (e.includes("Not enough research points"))
    return "Not enough research points.";
  return e || "Research could not be started. Please try again.";
}

export function createResearchActions(set: SetFn, get: GetFn) {
  return {
    startResearch: async (id: string) => {
      const state = get();

      // Phase 6: server-authoritative research start. Server validates
      // existence, prereqs, completion, and RP cost, then returns the
      // authoritative post-start state. Client applies exactly what the
      // server says — no local cost computation.
      const validation = await import("../actionValidator").then((m) =>
        m.validateActionWithServer(
          "research",
          { researchId: id },
          generateId(),
        ),
      );
      if (!validation.approved) {
        soundEngine.play("error", "ui");
        // Log technical error for debugging; show friendly message to user
        // eslint-disable-next-line no-console
        console.error(`[startResearch] server rejected: ${validation.error}`);
        get().addNotification("error", friendlyResearchError(validation.error));
        return;
      }

      // Defensive fallback: client uses local cost only if server omits
      // correctedState (should never happen with valid server response,
      // but keeps the client tolerant of degraded responses).
      const corrected = validation.correctedState;
      const node = RESEARCH_TREE.find((r) => r.id === id);
      const localCost = node?.cost ?? 0;

      const serverResearchPoints =
        corrected?.researchPoints ??
        Math.max(0, state.researchPoints - localCost);
      const serverActiveResearch =
        (corrected?.activeResearch as string | null) ?? id;
      const serverResearchProgress = corrected?.researchProgress ?? 0;

      set({
        researchPoints: serverResearchPoints,
        activeResearch: serverActiveResearch,
        researchProgress: serverResearchProgress,
      });
      soundEngine.play("buttonClick", "ui");
      const nodeName = node?.name ?? id;
      get().addNotification("info", `Started research: ${nodeName}`);
      get().updateQuestProgress("research", 1);
    },
  };
}
