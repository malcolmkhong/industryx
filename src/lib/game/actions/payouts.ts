import { soundEngine } from '../soundEngine';
import { formatNumber } from '../utils/formatNumber';

type SetFn = (partial: Record<string, unknown> | ((state: any) => Record<string, unknown>)) => void;
type GetFn = () => any;

export function createPayoutActions(set: SetFn, get: GetFn) {
  return {
    collectPayout: () => {
      const state = get();
      if (state.pendingPayout <= 0) return;
      const amount = state.pendingPayout;
      set({
        money: state.money + amount,
        totalMoneyEarned: state.totalMoneyEarned + amount,
        pendingPayout: 0,
      });
      soundEngine.play('moneyEarned', 'building');
      get().addNotification('success', `💰 Collected payout: $${formatNumber(amount)}`);
    },

    toggleAutoCollect: () => {
      const state = get();
      set({
        payoutConfig: {
          ...state.payoutConfig,
          autoCollect: !state.payoutConfig.autoCollect,
        },
      });
    },
  };
}
