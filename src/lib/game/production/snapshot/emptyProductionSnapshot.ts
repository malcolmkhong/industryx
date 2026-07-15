// Zero-valued ProductionSnapshot used as a pre-tick stub. The server tick
// overwrites `sellMultiplier`; this stub MUST NOT call getBalance() at
// module-eval (fail-closed per RULES.md [SEC-002]).

import type { ProductionSnapshot } from "./productionSnapshot";

export function emptyProductionSnapshot(): ProductionSnapshot {
  return {
    production: {},
    consumption: {},
    actualConsumption: {},
    buildings: {},
    powerProduction: 0,
    powerConsumption: 0,
    powerEfficiency: 1,
    powerOverload: false,
    payoutPerCycle: 0,
    payoutBreakdown: { extractors: 0, factories: 0, power: 0 },
    // sellMultiplier is overwritten by the calling tick (server:
    // computeSellMultiplierServer; client: computeSellMultiplier) so the
    // placeholder here is never user-visible. PURE stub: must NOT call
    // getBalance() — it would crash module-eval under fail-closed
    // semantics (see balanceConfig.BalanceNotLoadedError + RULES.md
    // [SEC-002]). The refactor that introduced fail-closed (Phase 8)
    // exposed a pre-existing module-init coupling that was masked by
    // the old DEFAULT_BALANCE default.
    sellMultiplier: 0,
    endgameMoney: 0,
    endgameResearch: 0,
    endgameCorp: 0,
    moneyIncomeRate: 0,
    moneyExpenseRate: 0,
    rpIncomeRate: 0,
    rpExpenseRate: 0,
    cpIncomeRate: 0,
    cpExpenseRate: 0,
    // V-003 / PR-BP-3 §2.1: no storage overflow recorded for the stub
    // snapshot (zero-tick cold-start / pre-tick preload). Real overflow
    // is populated by `runServerTicks` once per tick and copied onto the
    // snapshot it returns.
    storageOverflow: {},
  };
}
