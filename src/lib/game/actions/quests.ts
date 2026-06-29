// ============================================
// Quest Actions Factory
// ============================================
import { generateId } from '../utils/generateId';
import { soundEngine } from '../soundEngine';

type SetFn = (partial: Record<string, unknown> | ((state: any) => Record<string, unknown>)) => void;
type GetFn = () => any;

export function createQuestActions(set: SetFn, get: GetFn) {
  return {
    claimQuestReward: async (questId: string) => {
      const state = get();
      const quest = state.quests.find((q: any) => q.id === questId);
      if (!quest || !quest.completed || quest.claimed) return;

      const validation = await import('../actionValidator').then(m =>
        m.validateActionWithServer('claim_quest', { questId }, generateId())
      );
      if (!validation.approved) {
        soundEngine.play('error', 'events');
        get().addNotification('error', validation.error ?? 'Quest claim rejected by server');
        return;
      }

      set({
        money: state.money + quest.reward.money,
        totalMoneyEarned: state.totalMoneyEarned + quest.reward.money,
        researchPoints: state.researchPoints + (quest.reward.researchPoints ?? 0),
        prestigeState: {
          ...state.prestigeState,
          corporationPoints: state.prestigeState.corporationPoints + (quest.reward.corporationPoints ?? 0),
        },
        quests: state.quests.map((q: any) =>
          q.id === questId ? { ...q, claimed: true } : q
        ),
      });
      soundEngine.play('moneyEarned', 'events');
      get().addNotification('success', `Claimed quest reward: ${quest.name}!`);
    },

    updateQuestProgress: (type: string, amount: number, targetId?: string) => {
      const state = get();

      if (type === 'reach') {
        const efficiency = state.powerGrid.efficiency * 100;
        const newQuests = state.quests.map((q: any) => {
          if (q.claimed || q.completed || q.type !== 'reach') return q;
          const newSteps = q.steps.map((s: any) => {
            if (s.completed) return s;
            if (s.description.toLowerCase().includes('efficiency')) {
              const newCurrent = Math.min(Math.round(efficiency), s.target);
              return { ...s, current: newCurrent, completed: newCurrent >= s.target };
            }
            const newCurrent = Math.min(amount, s.target);
            return { ...s, current: newCurrent, completed: newCurrent >= s.target };
          });
          const allStepsComplete = newSteps.every((s: any) => s.completed);
          return { ...q, steps: newSteps, completed: allStepsComplete };
        });
        set({ quests: newQuests });
        return;
      }

      if (type === 'earn') {
        const newQuests = state.quests.map((q: any) => {
          if (q.claimed || q.completed || q.type !== 'earn') return q;
          const newSteps = q.steps.map((s: any) => {
            if (s.completed) return s;
            const newCurrent = Math.min(state.totalMoneyEarned, s.target);
            return { ...s, current: newCurrent, completed: newCurrent >= s.target };
          });
          const allStepsComplete = newSteps.every((s: any) => s.completed);
          return { ...q, steps: newSteps, completed: allStepsComplete };
        });
        set({ quests: newQuests });
        return;
      }

      if (type === 'produce' && targetId) {
        const newQuests = state.quests.map((q: any) => {
          if (q.claimed || q.completed || q.type !== 'produce') return q;
          if (q.targetResource && q.targetResource !== targetId) return q;
          const newSteps = q.steps.map((s: any) => {
            if (s.completed) return s;
            const newCurrent = s.current + amount;
            const stepCompleted = newCurrent >= s.target;
            return { ...s, current: newCurrent, completed: stepCompleted };
          });
          const allStepsComplete = newSteps.every((s: any) => s.completed);
          return { ...q, steps: newSteps, completed: allStepsComplete };
        });
        set({ quests: newQuests });
        return;
      }

      if (type === 'build' && targetId) {
        const newQuests = state.quests.map((q: any) => {
          if (q.claimed || q.completed || q.type !== 'build') return q;
          if (q.targetBuilding && q.targetBuilding !== targetId) return q;
          const newSteps = q.steps.map((s: any) => {
            if (s.completed) return s;
            const newCurrent = s.current + amount;
            const stepCompleted = newCurrent >= s.target;
            return { ...s, current: newCurrent, completed: stepCompleted };
          });
          const allStepsComplete = newSteps.every((s: any) => s.completed);
          return { ...q, steps: newSteps, completed: allStepsComplete };
        });
        set({ quests: newQuests });
        return;
      }

      const newQuests = state.quests.map((q: any) => {
        if (q.claimed || q.completed) return q;
        if (q.type !== type) return q;
        const newSteps = q.steps.map((s: any) => {
          if (s.completed) return s;
          const newCurrent = s.current + amount;
          const stepCompleted = newCurrent >= s.target;
          return { ...s, current: newCurrent, completed: stepCompleted };
        });
        const allStepsComplete = newSteps.every((s: any) => s.completed);
        return { ...q, steps: newSteps, completed: allStepsComplete };
      });

      set({ quests: newQuests });
    },

    setTrackedQuest: (id: string | null) => {
      set({ trackedQuest: id });
    },
  };
}
