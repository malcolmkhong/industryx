import type { SetFn, GetFn } from "./_actionTypes";
import { getCurrentRankState } from "./rank/rankScore";
import { getPlayerGameTierState } from "./rank/rankTier";

export function createRankActions(set: SetFn, get: GetFn) {
  void set;

  return {
    getCurrentRank: () => getCurrentRankState(get),
    getPlayerGameTier: () => getPlayerGameTierState(get),
  };
}
