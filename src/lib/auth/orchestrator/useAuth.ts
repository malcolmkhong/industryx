"use client";

/**
 * useAuth — PR4-4A.
 *
 * Returns the orchestrator instance + the typed state object. The state
 * exposes the new plan §5 status names (`resolving_session`,
 * `bootstrapping`, `conflict`, `recovery_required`, `temporary_error`,
 * `signed_out`) and a typed `result` payload that the UI components use
 * to pick which screen to render.
 *
 * Consumers should NOT directly mutate `state` from this hook — call
 * orchestrator methods instead (`startup`, `signOut`, `signInWithOAuth`).
 */

import { useContext } from "react";

import { AuthOrchestratorContext, type AuthContextValue } from "./AuthContext";

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthOrchestratorContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthOrchestratorProvider");
  }
  return ctx;
}