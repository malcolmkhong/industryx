// ============================================
// FACTORY DOMINION: Game Balance Configuration
// Compatibility barrel — type/runtime/validator symbols re-exported
// from split modules under `config/balance/`.
// ============================================

export type {
  GameBalanceConfig,
  Validator,
} from './balanceTypes';

export {
  vrange,
  vnumberArray,
  validateBalanceOverrides,
  validateCompleteBalance,
  REQUIRED_BALANCE_KEYS,
  BALANCE_VALIDATORS,
} from './balanceValidator';

export {
  applyBalanceOverrides,
  getBalance,
  isBalanceLoaded,
  getBalanceLoadedAt,
  getGameLimits,
  _resetBalanceForTests,
  BalanceNotLoadedError,
  VALID_RESOURCE_KEYS,
  VALID_WORKER_KEYS,
} from './balanceRuntime';
