// Per-tick production snapshot shape — written once per tick, read by all UI.

/** Single runtime truth snapshot — written once per tick, read by all UI. */
export interface ProductionSnapshot {
  // Per-resource totals (per tick)
  production: Record<string, number>;
  consumption: Record<string, number>; // demand (includes stalled factories)
  actualConsumption: Record<string, number>; // actual consumption (excludes stalled)

  // Per-building detail (per tick)
  buildings: Record<
    string,
    {
      outputs: { resource: string; amount: number }[];
      inputs: { resource: string; amount: number }[];
      efficiency: number;
    }
  >;

  // Power grid
  powerProduction: number;
  powerConsumption: number;
  powerEfficiency: number;
  powerOverload: boolean;

  // Payout (per cycle)
  payoutPerCycle: number;
  payoutBreakdown: { extractors: number; factories: number; power: number };

  // Sell multiplier
  sellMultiplier: number;

  // Endgame passive income (per tick)
  endgameMoney: number;
  endgameResearch: number;
  endgameCorp: number;

  // Currency income/expense rates (per tick)
  moneyIncomeRate: number;
  moneyExpenseRate: number;
  rpIncomeRate: number;
  rpExpenseRate: number;
  cpIncomeRate: number;
  cpExpenseRate: number;

  // V-003 / PR-BP-3 §2.1: structured storage-overflow report.
  // For each resource that overflowed its capacity during the latest
  // tick: produced total, accepted total (clamped), wasted total
  // (clamped off). A resource appears here ONLY when wasted > 0 —
  // empty object when no storage overflow occurred.
  // Storage observers (StoragePanel etc.) read this to surface overflow
  // instead of silently capping. Consumed server-side exclusively;
  // stripped by SERVER_STATE_UI_FIELDS so it never persists in
  // `full_state`.
  storageOverflow: Record<string, { produced: number; accepted: number; wasted: number }>;
}
