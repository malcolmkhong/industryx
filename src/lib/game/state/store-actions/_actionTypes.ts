// ============================================
// _actionTypes.ts
//
// Shared types for the action factory functions. Each action file
// exports `createXxxActions(set, get)` where `set` and `get` come from
// the Zustand store. To avoid circular imports, the actions don't
// import the store directly — they receive `set`/`get` as parameters
// with these typed signatures.
//
// Type-safety rationale:
// - `set` accepts Partial<GameStore> OR a function returning Partial<GameStore>
// - `get` returns the full GameStore
// - This catches typos in field names at compile time, replaces the
//   previous `any` which silently allowed any field access.
// ============================================

import type { GameStore } from "../store-types";

export type SetFn = (
  partial:
    | Partial<GameStore>
    | ((state: GameStore) => Partial<GameStore>),
) => void;

export type GetFn = () => GameStore;
