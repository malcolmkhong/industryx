// ============================================
// stubProductionSnapshot.ts
//
// Re-export of the empty production snapshot used by client-side stub
// state code. Lets `state/*` files reference snapshot defaults without
// pulling in the full `productionCalculator` surface.
// ============================================

export { emptyProductionSnapshot } from "../production/productionCalculator";
