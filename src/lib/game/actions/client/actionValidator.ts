// Phase 2.3: Wraps store action mutations with server validation.
// Compatibility barrel: validation types and mapping live in split modules.

"use client";

export { validateActionWithServer } from "./resultMapper";
export type {
  ValidatedActionResult,
  ValidatedActionType,
} from "./validationTypes";
