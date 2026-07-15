// ============================================
// Quest Actions Factory
// ============================================
import { generateId } from "../../../shared/utils/generateId";
import { soundEngine } from "../../../audio/soundEngine";
import type { Quest, QuestStep } from "../../../shared/types/types";
import type { SetFn, GetFn } from "../_actionTypes";

export function createQuestActions(set: SetFn, get: GetFn) {
  return {
    claimQuestReward: async (questId: string) => {
      const state = get();
      const quest = state.quests.find((q) => q.id === questId);
      if (!quest || !quest.completed || quest.claimed) return;

      // Phase 6: server-authoritative quest claim. Server reads the reward
      // from state.quests (immune to client tampering), applies it, and
      // marks the quest as claimed. Client applies server-returned state.
      const validation = await import("../../../actions/client/actionValidator").then((m) =>
        m.validateActionWithServer("claim_quest", { questId }, generateId()),
      );
      if (!validation.approved) {
        soundEngine.play("error", "events");
        get().addNotification(
          "error",
          validation.error ?? "Quest claim rejected by server",
        );
        return;
      }

      const corrected = validation.correctedState;
      if (
        !corrected ||
        typeof corrected.money !== "number" ||
        typeof corrected.totalMoneyEarned !== "number" ||
        typeof corrected.researchPoints !== "number" ||
        !corrected.quests ||
        !corrected.prestigeState
      ) {
        soundEngine.play("error", "events");
        get().addNotification(
          "error",
          "Quest reward could not be confirmed by server. Please retry.",
        );
        return;
      }

      set({
        money: corrected.money,
        totalMoneyEarned: corrected.totalMoneyEarned,
        researchPoints: corrected.researchPoints,
        prestigeState: corrected.prestigeState,
        quests: corrected.quests as typeof state.quests,
      });
      soundEngine.play("moneyEarned", "events");
      get().addNotification("success", `Claimed quest reward: ${quest.name}!`);
    },

    updateQuestProgress: (type: string, amount: number, targetId?: string) => {
      const state = get();

      if (type === "reach") {
        const efficiency = state.powerGrid.efficiency * 100;
        const newQuests = state.quests.map((q: Quest) => {
          if (q.claimed || q.completed || q.type !== "reach") return q;
          const newSteps = q.steps.map((s: QuestStep) => {
            if (s.completed) return s;
            if (s.description.toLowerCase().includes("efficiency")) {
              const newCurrent = Math.min(Math.round(efficiency), s.target);
              return {
                ...s,
                current: newCurrent,
                completed: newCurrent >= s.target,
              };
            }
            const newCurrent = Math.min(amount, s.target);
            return {
              ...s,
              current: newCurrent,
              completed: newCurrent >= s.target,
            };
          });
          const allStepsComplete = newSteps.every((s) => s.completed);
          return { ...q, steps: newSteps, completed: allStepsComplete };
        });
        set({ quests: newQuests });
        return;
      }

      if (type === "earn") {
        const newQuests = state.quests.map((q: Quest) => {
          if (q.claimed || q.completed || q.type !== "earn") return q;
          const newSteps = q.steps.map((s: QuestStep) => {
            if (s.completed) return s;
            const newCurrent = Math.min(state.totalMoneyEarned, s.target);
            return {
              ...s,
              current: newCurrent,
              completed: newCurrent >= s.target,
            };
          });
          const allStepsComplete = newSteps.every((s) => s.completed);
          return { ...q, steps: newSteps, completed: allStepsComplete };
        });
        set({ quests: newQuests });
        return;
      }

      if (type === "produce" && targetId) {
        const newQuests = state.quests.map((q: Quest) => {
          if (q.claimed || q.completed || q.type !== "produce") return q;
          if (q.targetResource && q.targetResource !== targetId) return q;
          const newSteps = q.steps.map((s: QuestStep) => {
            if (s.completed) return s;
            const newCurrent = s.current + amount;
            const stepCompleted = newCurrent >= s.target;
            return { ...s, current: newCurrent, completed: stepCompleted };
          });
          const allStepsComplete = newSteps.every((s) => s.completed);
          return { ...q, steps: newSteps, completed: allStepsComplete };
        });
        set({ quests: newQuests });
        return;
      }

      if (type === "build" && targetId) {
        const newQuests = state.quests.map((q: Quest) => {
          if (q.claimed || q.completed || q.type !== "build") return q;
          if (q.targetBuilding && q.targetBuilding !== targetId) return q;
          const newSteps = q.steps.map((s: QuestStep) => {
            if (s.completed) return s;
            const newCurrent = s.current + amount;
            const stepCompleted = newCurrent >= s.target;
            return { ...s, current: newCurrent, completed: stepCompleted };
          });
          const allStepsComplete = newSteps.every((s) => s.completed);
          return { ...q, steps: newSteps, completed: allStepsComplete };
        });
        set({ quests: newQuests });
        return;
      }

      const newQuests = state.quests.map((q: Quest) => {
        if (q.claimed || q.completed) return q;
        if (q.type !== type) return q;
        const newSteps = q.steps.map((s: QuestStep) => {
          if (s.completed) return s;
          const newCurrent = s.current + amount;
          const stepCompleted = newCurrent >= s.target;
          return { ...s, current: newCurrent, completed: stepCompleted };
        });
        const allStepsComplete = newSteps.every((s) => s.completed);
        return { ...q, steps: newSteps, completed: allStepsComplete };
      });

      set({ quests: newQuests });
    },

    setTrackedQuest: (id: string | null) => {
      set({ trackedQuest: id });
    },
  };
}
